import { loadLocalEnv } from '../web/src/lib/env.mjs';
import { apiFootballConfigured,apiFootballRateState,apiFootballRequest,getApiFootballFastFixtureBoard,getApiFootballFixtureCounts,getApiFootballIntelligence,getApiFootballLiveBoard,getApiFootballResults } from '../web/src/lib/apiFootball.mjs';
import { persistenceCoreEnabled,acquireJobLock,renewJobLock,releaseJobLock,checkpointFixtureStates,loadFixtureStates,checkpointBoard,loadBoards } from '../web/src/lib/persistenceCore.mjs';
import { supabaseConfigured,upsertPredictionLedger,getPredictionLedger } from '../web/src/lib/supabase.mjs';
await loadLocalEnv();
export {apiFootballConfigured,apiFootballRateState,apiFootballRequest,getApiFootballFastFixtureBoard,getApiFootballFixtureCounts,getApiFootballIntelligence,getApiFootballLiveBoard,getApiFootballResults,persistenceCoreEnabled,acquireJobLock,renewJobLock,releaseJobLock,checkpointFixtureStates,loadFixtureStates,checkpointBoard,loadBoards,supabaseConfigured,upsertPredictionLedger,getPredictionLedger};
export const VERSION='6.1.0',ENGINE='GOLDEN_BANKER_V4_3';
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