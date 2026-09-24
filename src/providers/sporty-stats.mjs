import { HttpClient } from './http.mjs';
import { number } from '../util.mjs';

const BASE='https://stats.fn.sportradar.com/sportybet/en/Etc:UTC/gismo';
export const statsId=value=>String(value??'').match(/(?:^|:)(\d+)$/)?.[1]||null;
const rows=data=>Array.isArray(data?.matches)?data.matches:Object.values(data?.matches||{});
const teamId=team=>statsId(team?.uid); // _id is a season-specific team ID, not a competitor ID.
const recent=records=>[...new Map(records.map(r=>[r.id,r])).values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));

export function sportyResult(m,now=Date.now()) {
  if(['canceled','cancelled','postponed','walkover','retired','disqualified'].some(k=>m[k]))return null;
  const at=number(m.time?.uts),home=number(m.periods?.ft?.home),away=number(m.periods?.ft?.away);
  // Only completed regulation-time score fields count. Missing scores and an
  // extra-time/penalty result must never become a synthetic 0-0 or 90-minute score.
  if(at===null||at*1000>now-3*3600000||home===null||away===null||home<0||away<0)return null;
  const homeId=teamId(m.teams?.home),awayId=teamId(m.teams?.away);
  if(!homeId||!awayId||!statsId(m._id)||m.teams.home.virtual||m.teams.away.virtual)return null;
  return {id:statsId(m._id),date:new Date(at*1000).toISOString(),leagueId:statsId(m._utid),groupId:statsId(m._tid),
    homeId,awayId,home,away,htHome:number(m.periods?.p1?.home),htAway:number(m.periods?.p1?.away),stats:null};
}

export function sportyTable(data,fixture) {
  const home=String(fixture.teams.home.id),away=String(fixture.teams.away.id),group=String(fixture.league.groupId);
  // Use the provider's official table, including deductions and its tie-break
  // order. Never combine regional groups or reconstruct positions from scores.
  const tables=(data.tables||[]).filter(t=>String(t.tournamentid)===group&&
    (t.tablerows||[]).some(r=>teamId(r.team)===home)&&(t.tablerows||[]).some(r=>teamId(r.team)===away));
  if(tables.length!==1)throw new Error('Comparable official league standings unavailable');
  const table=tables[0].tablerows.map(r=>({rank:number(r.pos),team:{id:teamId(r.team),name:r.team.name},
    points:number(r.pointsTotal),goalsDiff:number(r.goalDiffTotal),all:{played:number(r.total),win:number(r.winTotal),draw:number(r.drawTotal),lose:number(r.lossTotal),goals:{for:number(r.goalsForTotal),against:number(r.goalsAgainstTotal)}}}));
  if(table.length<8)throw new Error('Comparable league standings require at least eight teams');
  if(table.some(t=>!t.team.id||!t.rank||t.rank>table.length||t.points===null||t.all.played===null)||new Set(table.map(t=>t.team.id)).size!==table.length)throw new Error('Incomplete official league standings');
  return table.sort((a,b)=>a.rank-b.rank);
}

export class SportyStats {
  constructor({client}={}) {
    this.source='Sportybet / Sportradar';this.memo=new Map();
    this.client=client||new HttpClient({interval:180,headers:{
      'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      accept:'application/json, text/plain, */*',origin:'https://www.sportybet.com',referer:'https://www.sportybet.com/'}});
  }
  get(path,ttl=30*60000) {
    if(!this.memo.has(path))this.memo.set(path,this.client.json(`${BASE}/${path}`,{ttl,validate:b=>{
      const doc=b?.doc?.[0];if(!doc?.data||doc.event==='exception')throw new Error(`Sportybet statistics: ${doc?.data?.message||'data unavailable'}`);
    }}).then(b=>b.doc[0].data));
    return this.memo.get(path);
  }
  async matchFixture(sporty) {
    const id=statsId(sporty.id);if(!id)throw new Error('Invalid Sportybet match ID');
    const m=await this.get(`stats_match_get/${id}`,10*60000);
    const h=teamId(m.teams?.home),a=teamId(m.teams?.away),kickoff=number(m.time?.uts);
    if(statsId(m._id)!==id||!h||!a||h!==statsId(sporty.home.id)||a!==statsId(sporty.away.id)||kickoff===null||Math.abs(kickoff*1000-Date.parse(sporty.kickoff))>5*60000)throw new Error('Sportybet statistics fixture identity mismatch');
    if(m.teams.home.virtual||m.teams.away.virtual||m.tournament?.friendly||m.season?.friendly)throw new Error('Excluded competition type');
    if(['canceled','postponed','walkover','retired'].some(k=>m[k]))throw new Error('Match is not available pre-match');
    if(!statsId(m._seasonid)||!statsId(m._tid)||!statsId(m._utid))throw new Error('Statistics season identity unavailable');
    return {fixture:{id,date:new Date(kickoff*1000).toISOString()},
      teams:{home:{id:h,name:m.teams.home.name},away:{id:a,name:m.teams.away.name}},
      league:{id:statsId(m._utid),season:statsId(m._seasonid),groupId:statsId(m._tid)},statsMatch:m};
  }
  async standings(f) {return sportyTable(await this.get(`stats_season_tables/${f.league.season}`),f);}
  async seasonResults(season) {return rows(await this.get(`stats_season_fixtures2/${season}`)).map(m=>sportyResult(m)).filter(Boolean);}
  async leagueHistory(f) {
    const cutoff=Math.min(Date.now(),Date.parse(f.fixture.date));
    const inGroup=r=>r.groupId===f.league.groupId&&Date.parse(r.date)<cutoff;
    let records=(await this.seasonResults(f.league.season)).filter(inGroup);
    if(records.length<180) {
      const seasons=(await this.get(`uniquetournament_seasons/${f.league.id}`,86400000)).seasons||[];
      const current=seasons.find(s=>String(s._id)===f.league.season);
      const previous=seasons.filter(s=>s.containsdata!==false&&number(s.start?.uts)<number(current?.start?.uts)).sort((a,b)=>b.start.uts-a.start.uts)[0];
      // Regional group IDs are stable across seasons; a renamed/restructured
      // group safely yields less history instead of borrowing another group.
      if(previous)records.push(...(await this.seasonResults(previous._id)).filter(inGroup));
    }
    return recent(records).slice(0,300);
  }
  async enrich(sporty,f,{table,leagueHistory}={}) {
    table ||= await this.standings(f);leagueHistory ||= await this.leagueHistory(f);
    const h=f.teams.home.id,a=f.teams.away.id,cutoff=Math.min(Date.now(),Date.parse(f.fixture.date)),diagnostics=[];
    const [homeRows,awayRows,h2hRows]=await Promise.all([
      this.get(`stats_team_lastx/${h}/80`),this.get(`stats_team_lastx/${a}/80`),
      this.get(`stats_team_versus/${h}/${a}`).catch(e=>{diagnostics.push(`H2H unavailable: ${e.message}`);return {matches:[]};})
    ]);
    const normalize=data=>rows(data).map(m=>sportyResult(m)).filter(r=>r&&Date.parse(r.date)<cutoff);
    const homeHistory=recent([...normalize(homeRows),...leagueHistory]).filter(r=>r.leagueId===f.league.id&&r.homeId===h).slice(0,10);
    const awayHistory=recent([...normalize(awayRows),...leagueHistory]).filter(r=>r.leagueId===f.league.id&&r.awayId===a).slice(0,10);
    const h2h=recent(normalize(h2hRows)).filter(r=>((r.homeId===h&&r.awayId===a)||(r.homeId===a&&r.awayId===h))&&cutoff-Date.parse(r.date)<3*365.25*86400000).slice(0,10);
    return {...sporty,apiFixtureId:f.fixture.id,statsSource:this.source,statsFetchedAt:new Date().toISOString(),
      home:{...sporty.home,apiId:h},away:{...sporty.away,apiId:a},league:{...sporty.league,apiId:f.league.id,season:f.league.season,groupId:f.league.groupId,size:table.length},
      table,homeStanding:table.find(t=>t.team.id===h),awayStanding:table.find(t=>t.team.id===a),homeHistory,awayHistory,h2h,leagueHistory,diagnostics};
  }
}
