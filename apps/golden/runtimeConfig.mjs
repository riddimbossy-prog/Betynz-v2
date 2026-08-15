import { loadLocalEnv } from '../web/src/lib/env.mjs';
import { apiFootballConfigured,apiFootballRateState,apiFootballRequest,getApiFootballFastFixtureBoard,getApiFootballFixtureCounts,getApiFootballIntelligence as getApiFootballIntelligenceBase,getApiFootballLiveBoard,getApiFootballResults } from '../web/src/lib/apiFootball.mjs';
import { persistenceCoreEnabled,acquireJobLock,renewJobLock,releaseJobLock,checkpointFixtureStates,loadFixtureStates,checkpointBoard,loadBoards } from '../web/src/lib/persistenceCore.mjs';
import { supabaseConfigured,upsertPredictionLedger,getPredictionLedger } from '../web/src/lib/supabase.mjs';
await loadLocalEnv();

const FINISHED_API=new Set(['FT','AET','PEN']);
const number=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const kickoffMs=row=>{const n=Date.parse(row?.fixture?.date||row?.kickoff||'');return Number.isFinite(n)?n:null};

function splitTable(rows,venue,beforeMs){
  const side=venue==='home'?'home':'away';
  const ids=new Set();
  for(const row of rows||[]){
    if(!FINISHED_API.has(String(row?.fixture?.status?.short||'').toUpperCase()))continue;
    const when=kickoffMs(row);if(beforeMs&&when&&when>=beforeMs)continue;
    const id=number(row?.teams?.[side]?.id);if(id)ids.add(id);
  }
  const table=[];
  for(const id of ids){
    const sample=(rows||[]).filter(row=>{
      if(!FINISHED_API.has(String(row?.fixture?.status?.short||'').toUpperCase()))return false;
      const when=kickoffMs(row);if(beforeMs&&when&&when>=beforeMs)return false;
      return number(row?.teams?.[side]?.id)===id;
    }).sort((a,b)=>(kickoffMs(b)||0)-(kickoffMs(a)||0)).slice(0,5);
    if(sample.length!==5)continue;
    let points=0,gf=0,ga=0;
    for(const row of sample){
      const h=number(row?.goals?.home),a=number(row?.goals?.away);if(h===null||a===null)continue;
      const own=venue==='home'?h:a,opp=venue==='home'?a:h;
      gf+=own;ga+=opp;points+=own>opp?3:own===opp?1:0;
    }
    table.push({id,points,gf,ga,gd:gf-ga});
  }
  table.sort((a,b)=>b.points-a.points||b.gd-a.gd||b.gf-a.gf||a.id-b.id);
  return{size:table.length,positions:new Map(table.map((row,i)=>[row.id,i+1]))};
}

function exactSplitPositions(rows,fixture){
  const beforeMs=Date.parse(fixture?.kickoff||'')||Date.now();
  const homeTable=splitTable(rows,'home',beforeMs),awayTable=splitTable(rows,'away',beforeMs);
  const homeId=number(fixture?.home?.id),awayId=number(fixture?.away?.id);
  return{
    home:homeId?homeTable.positions.get(homeId)||null:null,
    away:awayId?awayTable.positions.get(awayId)||null:null,
    homeTableSize:homeTable.size||null,
    awayTableSize:awayTable.size||null,
    tableSize:Math.max(homeTable.size,awayTable.size)||null,
    sampleSize:5,
    source:'API_FOOTBALL_EXACT_SPLIT_TABLES'
  };
}

export async function getApiFootballIntelligence(source,fixture,options={}){
  const intel=await getApiFootballIntelligenceBase(source,fixture,options);
  if(!intel||options?.mode!=='engine')return intel;
  const leagueId=number(fixture?.league?.id),season=number(fixture?.league?.season);
  if(!leagueId||!season)return{...intel,formPositions:null};
  try{
    const pool=await apiFootballRequest('/fixtures',{league:leagueId,season,status:'FT',__priority:2},43200);
    const rows=Array.isArray(pool?.response)?pool.response:[];
    return{...intel,formPositions:exactSplitPositions(rows,fixture)};
  }catch{
    return{...intel,formPositions:null};
  }
}

export {apiFootballConfigured,apiFootballRateState,apiFootballRequest,getApiFootballFastFixtureBoard,getApiFootballFixtureCounts,getApiFootballLiveBoard,getApiFootballResults,persistenceCoreEnabled,acquireJobLock,renewJobLock,releaseJobLock,checkpointFixtureStates,loadFixtureStates,checkpointBoard,loadBoards,supabaseConfigured,upsertPredictionLedger,getPredictionLedger};
export const VERSION='6.2.0',ENGINE='GOLDEN_BANKER_V4_3';
export const snapshots=new Map(),jobs=new Map();
const FINISHED=new Set(['FT','AET','PEN','FINISHED','ENDED','COMPLETED']),LIVE=new Set(['1H','HT','2H','ET','BT','P','LIVE','INT','INPLAY']);
export const safeDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
export const utcDate=(o=0)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+o);return d.toISOString().slice(0,10)};
export const addDays=(date,o)=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+o);return d.toISOString().slice(0,10)};
export const isPast=d=>d<utcDate(),outOfRange=d=>d>utcDate(7);
export const isSrl=f=>/(?:\bsrl\b|simulated reality|cyber|esoccer|e-soccer)/i.test([f?.league?.name,f?.home?.name,f?.away?.name].filter(Boolean).join(' '));
export const eligible=f=>{const s=String(f?.status||'').toUpperCase();return !isSrl(f)&&!FINISHED.has(s)&&!LIVE.has(s)&&!/PST|POSTPONED|CANC|ABD/.test(s)};

function publicTeam(team){
  if(!team)return null;
  const id=String(team?.id??'').trim();
  const proxiedLogo=/^\d+$/.test(id)&&Number(id)>0?`/media/team/${id}.png`:(team?.logo||null);
  return {...team,logo:proxiedLogo};
}

function publicLeague(league){
  if(!league)return null;
  return {
    ...league,
    round:league?.round||league?.currentRound||league?.matchday||league?.week||null
  };
}

export const publicFixture=f=>({
  id:String(f?.id||''),
  sourceId:String(f?.sourceId||f?.id||''),
  kickoff:f?.kickoff||null,
  status:f?.status||'NS',
  minute:f?.minute??null,
  score:f?.score||null,
  league:publicLeague(f?.league),
  round:f?.round||f?.fixture?.round||f?.league?.round||null,
  seasonRound:f?.seasonRound||f?.league?.round||null,
  home:publicTeam(f?.home),
  away:publicTeam(f?.away),
  odds:f?.odds||{}
});