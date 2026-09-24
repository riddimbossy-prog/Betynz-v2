import { Sportybet } from '../src/providers/sportybet.mjs';
import { Football,matchFixture } from '../src/providers/football.mjs';
import { SportyStats } from '../src/providers/sporty-stats.mjs';
import { analyse,eligibility } from '../src/engine/analyse.mjs';
import { leagueReliability } from '../src/engine/model.mjs';
import { day,addDays,readJSON,writeJSON,mapLimit,unique } from '../src/util.mjs';
export async function refresh({sporty=new Sportybet(),football=process.env.STATISTICS_PROVIDER==='api-football'?new Football():new SportyStats(),dataDir='data',today=day(),days=Number(process.env.BOARD_DAYS||1)}={}) {
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
      const [table,leagueHistory]=await Promise.all([football.standings(f),football.leagueHistory(f)]);
      return {table,leagueHistory,reliability:leagueReliability(leagueHistory,policy)};
    })());
    return leagueCache.get(key);
  }
  const daily=[];
  for(const date of dates) {
    const fixtures=books.fixtures.filter(f=>day(f.kickoff)===date);
    const leagueCount=unique(fixtures.map(f=>f.league.id||`${f.league.country}:${f.league.name}`)).length;
    let processed=0,matchedCount=0,analysisCount=0;
    const results=await mapLimit(fixtures,2,async f=>{
      const skipped=reason=>({id:f.id,kickoff:f.kickoff,home:f.home,away:f.away,league:f.league,oddsFetchedAt:f.oddsFetchedAt,status:'skipped',tip:null,categoryTips:[],reasons:[reason],coverage:{markets:f.markets.length}});
      try {
        if(Date.parse(f.kickoff)<=Date.now())return skipped('Match has already started');
        if(f.marketFetchStatus!=='complete')return skipped('Full Sportybet market list unavailable');
        if(policy.blockedLeaguePatterns.some(p=>new RegExp(p,'i').test(`${f.league.name} ${f.league.country}`)))return skipped('Excluded competition type');
        const matched=football.matchFixture?{fixture:await football.matchFixture(f)}:matchFixture(f,statsByDay.get(date)||[],aliases);
        if(!matched.fixture)return skipped(matched.reason);
        matchedCount++;
        const info=await leagueInfo(matched.fixture);
        const homeId=String(matched.fixture.teams.home.id),awayId=String(matched.fixture.teams.away.id);
        const skeleton={...f,league:{...f.league,apiId:String(matched.fixture.league.id),size:info.table.length},
          homeStanding:info.table.find(t=>String(t.team.id)===homeId),awayStanding:info.table.find(t=>String(t.team.id)===awayId),homeHistory:[],awayHistory:[]};
        const earlyGate=eligibility(skeleton,policy,leagueCount);
        const structural=earlyGate.reasons.filter(r=>!['Insufficient home/away form','Busy-day filter: no clear table and split-form mismatch'].includes(r));
        if(structural.length)return {...skipped(structural[0]),reasons:structural};
        if(!info.reliability.reliable)return {...skipped(`League reliability: ${info.reliability.reason}`),leagueReliability:info.reliability};
        const enriched=await football.enrich(f,matched.fixture,info);
        analysisCount++;
        return analyse(enriched,policy,{leagueCount,reliability:info.reliability});
      } catch(e) { return skipped(`Analysis unavailable: ${e.message}`); }
      finally { processed++; if(processed%20===0)console.log(`${date}: analysed ${processed}/${fixtures.length}`); }
    });
    const qualified=results.filter(r=>r.tip).sort((a,b)=>b.tip.probability-a.tip.probability);
    const statisticsErrors=results.filter(r=>r.reasons.some(s=>s.startsWith('Analysis unavailable:')||s==='No verified statistics fixture match')).length;
    const scanComplete=books.complete&&statisticsErrors===0;
    const board={version:7,date,generatedAt:new Date().toISOString(),oddsSource:'Sportybet',statisticsSource:football.source||'API-Football',
      statistics:{matched:matchedCount,analysed:analysisCount,unavailable:statisticsErrors},
      status:scanComplete?'ready':fixtures.length?'partial':'unavailable',complete:scanComplete,oddsComplete:books.complete,leagueCount,busyDay:leagueCount>=policy.busyDayLeagueCount,
      summary:{fixtures:fixtures.length,qualified:qualified.length,skipped:results.length-qualified.length,markets:fixtures.reduce((s,f)=>s+f.markets.length,0)},
      matches:[...qualified,...results.filter(r=>!r.tip)],diagnostics,policy};
    await writeJSON(`${dataDir}/board-${date}.json`,board);
    // Retain every returned market, including markets the analysis cannot safely model.
    await writeJSON(`${dataDir}/markets-${date}.json`,{date,fetchedAt:start,source:'Sportybet',complete:books.complete,fixtures:fixtures.map(f=>({id:f.id,kickoff:f.kickoff,home:f.home.name,away:f.away.name,league:f.league,oddsFetchedAt:f.oddsFetchedAt,status:f.marketFetchStatus,markets:f.markets}))});
    daily.push({date,...board.summary,status:board.status,leagueCount});
    console.log(`${date}: ${fixtures.length} fixtures, ${leagueCount} leagues, ${qualified.length} selected`);
  }
  const index={version:7,generatedAt:new Date().toISOString(),startedAt:start,dates:daily,diagnostics,complete:daily.every(d=>d.status==='ready'),policy};
  await writeJSON(`${dataDir}/index.json`,index);
  console.log(JSON.stringify({complete:index.complete,dates:daily,diagnostics:diagnostics.slice(0,15)}));
  return index;
}
if(import.meta.url===`file://${process.argv[1]}`) {
  refresh().catch(async e=>{console.error(`Refresh failed: ${e.message}`);process.exitCode=1;});
}
