import { HttpClient } from './http.mjs';
import { normalizeName, number, mapLimit, unique } from '../util.mjs';
const FINISHED=new Set(['FT','AET','PEN']);
const variants=s=>normalizeName(s).replace(/\b(fc|cf|afc|sc|ac|club|football)\b/g,' ').replace(/\s+/g,' ').trim();
function identityMarkers(s) { return (normalizeName(s).match(/\b(women|w|ladies|u\s?\d{2}|reserves?|ii|iii|b)\b/g)||[]).join('|'); }
export function nameSimilarity(a,b,aliases={}) {
  a=aliases[normalizeName(a)]||a; b=aliases[normalizeName(b)]||b;
  if(identityMarkers(a)!==identityMarkers(b)) return 0;
  a=variants(a); b=variants(b); if(a===b && a) return 1;
  const aa=new Set(a.split(' ')),bb=new Set(b.split(' '));
  return 2*[...aa].filter(w=>bb.has(w)).length/(aa.size+bb.size);
}
export function matchFixture(sporty,fixtures,aliases={}) {
  const candidates=fixtures.filter(f=>Math.abs(Date.parse(f.fixture.date)-Date.parse(sporty.kickoff))<=5*60000).map(f=>{
    const h=nameSimilarity(sporty.home.name,f.teams.home.name,aliases),a=nameSimilarity(sporty.away.name,f.teams.away.name,aliases);
    return {fixture:f,h,a,score:(h+a)/2};
  }).filter(c=>c.h>=0.78 && c.a>=0.78 && c.score>=0.87).sort((a,b)=>b.score-a.score);
  if(!candidates.length) return {fixture:null,reason:'No verified statistics fixture match'};
  if(candidates[1] && candidates[0].score-candidates[1].score<0.1) return {fixture:null,reason:'Ambiguous statistics fixture match'};
  return {fixture:candidates[0].fixture,score:candidates[0].score};
}
export function resultRecord(f) {
  // Goals after extra time are not regulation-time market results.
  const ft=f.score?.fulltime||{}; const ht=f.score?.halftime||{};
  const regular=f.fixture?.status?.short==='FT';
  const home=number(ft.home)??(regular?number(f.goals?.home):null),away=number(ft.away)??(regular?number(f.goals?.away):null);
  if(!FINISHED.has(f.fixture?.status?.short)||home===null||away===null) return null;
  return {id:String(f.fixture.id),date:f.fixture.date,leagueId:f.league.id,homeId:String(f.teams.home.id),awayId:String(f.teams.away.id),home,away,htHome:number(ht.home),htAway:number(ht.away),stats:null};
}
export function normalizeStats(rows) {
  const result={};
  for(const row of rows) {
    const s=Object.fromEntries((row.statistics||[]).map(x=>[x.type,x.value]));
    result[String(row.team.id)]={xg:number(s.expected_goals),shots:number(s['Total Shots']),shotsOnTarget:number(s['Shots on Goal']),corners:number(s['Corner Kicks']),yellow:number(s['Yellow Cards']),red:number(s['Red Cards'])};
  }
  return result;
}
export class Football {
  constructor({key=process.env.API_FOOTBALL_KEY,client}={}) {
    this.key=key; this.client=client||new HttpClient({interval:Number(process.env.API_FOOTBALL_REQUEST_INTERVAL_MS||750),headers:{'x-apisports-key':key||''}});
  }
  async get(path,params={},ttl=6*3600000) {
    if(!this.key) throw new Error('API_FOOTBALL_KEY is missing');
    const url=new URL(`https://v3.football.api-sports.io/${path}`);
    for(const [k,v] of Object.entries(params)) url.searchParams.set(k,String(v));
    const fetchPage=async()=>this.client.json(url,{ttl,validate:b=>{
      if(!Array.isArray(b.response)||Object.keys(b.errors||{}).length) throw new Error(`API-Football ${path}: ${JSON.stringify(b.errors||'invalid response').slice(0,220)}`);
    }});
    const first=await fetchPage(); const out=[...first.response];
    for(let page=2;page<=Number(first.paging?.total||1);page++) { url.searchParams.set('page',String(page)); out.push(...(await fetchPage()).response); }
    return out;
  }
  fixtures(date) { return this.get('fixtures',{date,timezone:'UTC'},10*60000); }
  async standings(fixture) {
    const rows=await this.get('standings',{league:fixture.league.id,season:fixture.league.season},30*60000);
    const groups=rows[0]?.league?.standings||[];
    // Never mix separate groups or rank a cup's unrelated group opponents.
    const table=groups.find(g=>g.some(t=>t.team.id===fixture.teams.home.id)&&g.some(t=>t.team.id===fixture.teams.away.id));
    if(!table || table.length<8) throw new Error('Comparable league standings unavailable');
    return table;
  }
  async leagueHistory(fixture) {
    const params={league:fixture.league.id,season:fixture.league.season};
    let rows=(await this.get('fixtures',params)).map(resultRecord).filter(Boolean);
    if(rows.length<180) {
      const prior=(await this.get('fixtures',{...params,season:params.season-1})).map(resultRecord).filter(Boolean);
      rows=[...prior,...rows];
    }
    return rows.filter(r=>Date.parse(r.date)<Date.parse(fixture.fixture.date)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,300);
  }
  async enrich(sporty,fixture,{table,leagueHistory}={}) {
    table ||= await this.standings(fixture);
    leagueHistory ||= await this.leagueHistory(fixture);
    const diagnostics=[];
    const cutoff=Date.parse(fixture.fixture.date);
    const historical=rows=>rows.map(resultRecord).filter(r=>r&&Date.parse(r.date)<cutoff);
    const [homeRows,awayRows,h2hRows]=await Promise.all([
      this.get('fixtures',{team:fixture.teams.home.id,last:60}),
      this.get('fixtures',{team:fixture.teams.away.id,last:60}),
      this.get('fixtures/headtohead',{h2h:`${fixture.teams.home.id}-${fixture.teams.away.id}`,last:20}).catch(e=>{diagnostics.push(`H2H unavailable: ${e.message}`); return [];})
    ]);
    const homeId=String(fixture.teams.home.id),awayId=String(fixture.teams.away.id);
    const sorted=rows=>historical(rows).filter(r=>r.leagueId===fixture.league.id).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
    const homeHistory=sorted(homeRows).filter(r=>r.homeId===homeId).slice(0,10);
    const awayHistory=sorted(awayRows).filter(r=>r.awayId===awayId).slice(0,10);
    const h2h=historical(h2hRows).filter(r=>cutoff-Date.parse(r.date)<3*365.25*86400000).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,10);
    const selected=[...homeHistory.slice(0,5),...awayHistory.slice(0,5),...h2h.slice(0,5)];
    const statsById=new Map();
    await mapLimit(unique(selected.map(r=>r.id)),2,async id=>{
      try { statsById.set(id,normalizeStats(await this.get('fixtures/statistics',{fixture:id},30*86400000))); }
      catch(e) { diagnostics.push(`Advanced stats unavailable for fixture ${id}`); }
    });
    for(const row of [...homeHistory,...awayHistory,...h2h]) row.stats=statsById.get(row.id)||null;
    const homeStanding=table.find(t=>String(t.team.id)===homeId),awayStanding=table.find(t=>String(t.team.id)===awayId);
    return {...sporty,apiFixtureId:String(fixture.fixture.id),statsSource:'API-Football',statsFetchedAt:new Date().toISOString(),
      home:{...sporty.home,apiId:homeId,logo:sporty.home.logo||fixture.teams.home.logo},
      away:{...sporty.away,apiId:awayId,logo:sporty.away.logo||fixture.teams.away.logo},
      league:{...sporty.league,apiId:String(fixture.league.id),season:fixture.league.season,size:table.length},
      table,homeStanding,awayStanding,homeHistory,awayHistory,h2h,leagueHistory,diagnostics};
  }
}
