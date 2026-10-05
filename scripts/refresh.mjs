import { Sportybet } from '../src/providers/sportybet.mjs';
import { Football,matchFixture } from '../src/providers/football.mjs';
import { SportyStats } from '../src/providers/sporty-stats.mjs';
import { BetexplorerHtft, findTeam } from '../src/providers/betexplorer-htft.mjs';
import { analyse,eligibility,isSimulated } from '../src/engine/analyse.mjs';
import { applyHtft } from '../src/engine/htft.mjs';
import { leagueReliability } from '../src/engine/model.mjs';
import { day,addDays,readJSON,writeJSON,mapLimit,unique } from '../src/util.mjs';
export async function refresh({sporty=new Sportybet(),football=process.env.STATISTICS_PROVIDER==='api-football'?new Football():new SportyStats(),betexplorer=new BetexplorerHtft(),dataDir='data',today=day(),days=Number(process.env.BOARD_DAYS||1)}={}) {
  const policy=await readJSON('config/policy.json'),aliases=await readJSON('config/team-aliases.json');
  const dates=Array.from({length:Math.max(1,Math.min(7,days))},(_,n)=>addDays(today,n));
  const start=new Date().toISOString(),diagnostics=[];
  console.log(`Betynz refresh: ${dates.join(', ')} | Sportybet ${sporty.country}`);
  const books=await sporty.dailyBooks(dates).catch(e=>({fixtures:[],complete:false,diagnostics:[e.message]}));
  console.log(`Sportybet: ${books.fixtures.length} fixtures, ${books.fixtures.reduce((n,f)=>n+f.markets.length,0)} market rows, complete=${books.complete}`);
  diagnostics.push(...books.diagnostics);
  const statsByDay=new Map();
  if(books.fixtures.length&&!football.matchFixture) for(const date of dates) {
    try { statsByDay.set(date,await football.fixtures(date));console.log(`Statistics ${date}: ${statsByDay.get(date).length} fixtures available for matching`); }
    catch(e) { diagnostics.push(`Statistics ${date}: ${e.message}`);statsByDay.set(date,[]); }
  }
  const leagueCache=new Map();
  async function leagueInfo(f) {
    const key=`${f.league.id}:${f.league.season}:${f.league.groupId||''}`;
    if(!leagueCache.has(key))leagueCache.set(key,(async()=>{
      const [table,leagueHistory]=await Promise.all([football.standings(f).catch(()=>[]),football.leagueHistory(f).catch(()=>[])]);
      return {table,leagueHistory,reliability:leagueReliability(leagueHistory,policy)};
    })());
    return leagueCache.get(key);
  }
  async function fallback(f,reason,leagueCount) {
    let enriched={...f,homeHistory:[],awayHistory:[],h2h:[],leagueHistory:[],diagnostics:[reason]};
    if(betexplorer.enrich) {
      try {enriched=await betexplorer.enrich(f);}
      catch(e) {enriched.diagnostics.push(`BetExplorer statistics unavailable: ${e.message}`);}
    }
    return analyse(enriched,policy,{leagueCount});
  }
  const daily=[];
  for(const date of dates) {
    const listed=books.fixtures.filter(f=>day(f.kickoff)===date);
    const simulated=listed.filter(f=>isSimulated(f.league));
    const fixtures=listed.filter(f=>!isSimulated(f.league));
    if(simulated.length) diagnostics.push(`Skipped ${simulated.length} simulated ${date} fixtures`);
    const leagueCount=unique(fixtures.map(f=>f.league.id||`${f.league.country}:${f.league.name}`)).length;
    let processed=0,matchedCount=0,analysisCount=0;
    const results=await mapLimit(fixtures,2,async f=>{
      const skipped=reason=>({id:f.id,kickoff:f.kickoff,home:f.home,away:f.away,league:f.league,oddsFetchedAt:f.oddsFetchedAt,status:'skipped',tip:null,categoryTips:[],reasons:[reason],coverage:{markets:f.markets.length}});
      try {
        if(Date.parse(f.kickoff)<=Date.now())return skipped('Match has already started');
        if(f.marketFetchStatus!=='complete')return skipped('Full Sportybet market list unavailable');
        if(!policy.publishAllMatches&&policy.blockedLeaguePatterns.some(p=>new RegExp(p,'i').test(`${f.league.name} ${f.league.country}`)))return skipped('Excluded competition type');
        const matched=football.matchFixture?{fixture:await football.matchFixture(f)}:matchFixture(f,statsByDay.get(date)||[],aliases);
        if(!matched.fixture)return policy.publishAllMatches?fallback(f,matched.reason,leagueCount):skipped(matched.reason);
        matchedCount++;
        const info=await leagueInfo(matched.fixture);
        const homeId=String(matched.fixture.teams.home.id),awayId=String(matched.fixture.teams.away.id);
        const skeleton={...f,league:{...f.league,apiId:String(matched.fixture.league.id),size:info.table.length},
          homeStanding:info.table.find(t=>String(t.team.id)===homeId),awayStanding:info.table.find(t=>String(t.team.id)===awayId),homeHistory:[],awayHistory:[]};
        const earlyGate=eligibility(skeleton,policy,leagueCount);
        const structural=earlyGate.reasons.filter(r=>!['Insufficient home/away form','Busy-day filter: no clear table and split-form mismatch'].includes(r));
        if(structural.length)return {...skipped(structural[0]),reasons:structural};
        if(!policy.publishAllMatches&&!info.reliability.reliable)return {...skipped(`League reliability: ${info.reliability.reason}`),leagueReliability:info.reliability};
        const enriched=await football.enrich(f,matched.fixture,info);
        analysisCount++;
        if(policy.publishAllMatches&&(!enriched.homeHistory?.length||!enriched.awayHistory?.length))return fallback(f,'Split form unavailable',leagueCount);
        return analyse(enriched,policy,{leagueCount,reliability:info.reliability});
      } catch(e) { return policy.publishAllMatches?fallback(f,`Historical analysis unavailable: ${e.message}`,leagueCount):skipped(`Analysis unavailable: ${e.message}`); }
      finally { processed++; if(processed%20===0)console.log(`${date}: analysed ${processed}/${fixtures.length}`); }
    });
    const marketsById=new Map(fixtures.map(f=>[f.id,f.markets]));
    const tables=new Map();
    for(const row of results.filter(r=>r.tip)) {
      const key=`${row.league.country||''}|${row.league.name||''}`;
      if(!tables.has(key)) tables.set(key,betexplorer.leagueTables(row.league).catch(e=>({error:e.message})));
    }
    for(const row of results) {
      if(!row.tip) continue;
      const key=`${row.league.country||''}|${row.league.name||''}`;
      const table=await tables.get(key);
      if(!table||table.error) {
        row.htft={status:'unavailable',route:'no combo',pick:null,caveat:table?.error||'BetExplorer HT/FT unavailable'};
        diagnostics.push(`HT/FT ${row.league.name}: ${row.htft.caveat}`);
        continue;
      }
      row.htft=applyHtft({homeRow:findTeam(table.home,row.home.name),awayRow:findTeam(table.away,row.away.name),homeName:row.home.name,awayName:row.away.name,markets:marketsById.get(row.id)||[],minimumOdds:policy.minimumOdds,maximumOdds:policy.maximumOdds,venueConfirmed:table.venueConfirmed});
    }
    const qualified=results.filter(r=>r.tip).sort((a,b)=>b.tip.probability-a.tip.probability);
    const statisticsErrors=results.filter(r=>r.tip?.probabilityBasis==='odds'||r.reasons.some(s=>s.startsWith('Analysis unavailable:')||s==='No verified statistics fixture match')).length;
    const scanComplete=books.complete&&statisticsErrors===0;
    const board={version:8,date,generatedAt:new Date().toISOString(),oddsSource:'Sportybet',statisticsSource:[...new Set(results.map(r=>r.statsSource).filter(Boolean))].join(' / ')||football.source||'API-Football',htftSource:'BetExplorer',
      statistics:{matched:matchedCount,analysed:analysisCount,unavailable:statisticsErrors},
      status:scanComplete?'ready':fixtures.length?'partial':'unavailable',complete:scanComplete,oddsComplete:books.complete,leagueCount,busyDay:!policy.publishAllMatches&&leagueCount>=policy.busyDayLeagueCount,
      summary:{fixtures:fixtures.length,qualified:qualified.length,skipped:results.length-qualified.length,markets:fixtures.reduce((s,f)=>s+f.markets.length,0),htft:qualified.filter(r=>r.htft?.pick).length},
      matches:[...qualified,...results.filter(r=>!r.tip)],diagnostics,policy};
    await writeJSON(`${dataDir}/board-${date}.json`,board);
    await writeJSON(`${dataDir}/markets-${date}.json`,{date,fetchedAt:start,source:'Sportybet',complete:books.complete,fixtures:listed.map(f=>({id:f.id,kickoff:f.kickoff,home:f.home.name,away:f.away.name,league:f.league,oddsFetchedAt:f.oddsFetchedAt,status:f.marketFetchStatus,markets:f.markets}))});
    daily.push({date,...board.summary,status:board.status,leagueCount});
    console.log(`${date}: ${fixtures.length} fixtures, ${leagueCount} leagues, ${qualified.length} selected, ${board.summary.htft} HT/FT cards`);
  }
  const index={version:8,generatedAt:new Date().toISOString(),startedAt:start,dates:daily,diagnostics,complete:daily.every(d=>d.status==='ready'),policy};
  await writeJSON(`${dataDir}/index.json`,index);
  console.log(JSON.stringify({complete:index.complete,dates:daily,diagnostics:diagnostics.slice(0,15)}));
  return index;
}
if(import.meta.url===`file://${process.argv[1]}`) {
  refresh().catch(async e=>{console.error(`Refresh failed: ${e.message}`);process.exitCode=1;});
}
