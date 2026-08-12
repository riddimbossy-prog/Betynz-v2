import { ENGINE,VERSION,snapshots,jobs,utcDate,isPast,outOfRange,eligible,isSrl,publicFixture,getApiFootballFastFixtureBoard,getApiFootballIntelligence,acquireJobLock,renewJobLock,releaseJobLock,loadFixtureStates,checkpointFixtureStates,checkpointBoard,supabaseConfigured,getApiFootballResults,getPredictionLedger,upsertPredictionLedger,apiFootballConfigured,apiFootballRateState,persistenceCoreEnabled,getApiFootballFixtureCounts,getApiFootballLiveBoard } from './runtimeConfig.mjs';
import { analyseFixture,waiting,makeBoard,persistTop,hydrate,hasExactEvidence,upgradeAnalysisForCurrentRules } from './runtimeBoard.mjs';

const ANALYSIS_LOCK_REVISION='u35-cache-v2';
const configuredLease=Number(process.env.GOLDEN_BANKER_DATE_LOCK_SECONDS||900);
const ANALYSIS_LOCK_LEASE_SECONDS=Math.min(1800,Math.max(300,Number.isFinite(configuredLease)?configuredLease:900));
const ANALYSIS_LOCK_RENEW_MS=240000;
const ANALYSIS_RETRY_MS=15000;
const PRELOAD_DAYS_AHEAD=6;
const PRELOAD_SWEEP_MS=30*60*1000;
let preloadTask=null;
let fixtureSeedTask=null;
const fixtureSeededDates=new Set();

function lockKeyFor(date){return `golden:${ANALYSIS_LOCK_REVISION}:${date}`}
function scheduleRetry(date,force=false){
  const timer=setTimeout(()=>kick(date,force),ANALYSIS_RETRY_MS);
  timer.unref?.();
}

function cachedFixtureBoard(date,board){
  if(!board||!Array.isArray(board.fixtures))return null;
  return {
    source:'PRELOADED_BOARD',
    date,
    cached:true,
    complete:Boolean(board.complete),
    generatedAt:board.generatedAt||null,
    fixtures:board.fixtures
  };
}

async function seedFixtureDate(date){
  let current=snapshots.get(date)||await hydrate(date).catch(()=>null);
  if(current&&Array.isArray(current.fixtures)&&(current.fixtures.length||fixtureSeededDates.has(date))){
    fixtureSeededDates.add(date);
    return current;
  }

  const board=await getApiFootballFastFixtureBoard(date);
  const total=(board.fixtures||[]).filter(eligible).length;
  const seed=makeBoard(date,board,[],{complete:false,processed:0,total,warning:board?.warning||null});
  snapshots.set(date,seed);
  fixtureSeededDates.add(date);
  await checkpointBoard({boardKey:ENGINE,date,complete:false,processed:0,total,payload:seed,generatedAt:seed.generatedAt}).catch(()=>null);
  return seed;
}

async function preloadFixtureLists(){
  if(fixtureSeedTask)return fixtureSeedTask;
  fixtureSeedTask=(async()=>{
    for(let n=0;n<=PRELOAD_DAYS_AHEAD;n++){
      const date=utcDate(n);
      try{await seedFixtureDate(date);}catch{}
    }
  })().finally(()=>{fixtureSeedTask=null});
  return fixtureSeedTask;
}

async function analyseDate(date,{force=false}={}){
  if(jobs.has(date))return jobs.get(date);
  if(outOfRange(date))throw new Error('Fresh analysis is limited to today through +7 days.');
  if(isPast(date)&&!force)return snapshots.get(date)||await hydrate(date)||{engine:'Golden Banker v4.3',engineCode:ENGINE,date,historicalLock:true,complete:true,all:[],topBankers:[]};

  const task=(async()=>{
    const lockKey=lockKeyFor(date);
    const lock=await acquireJobLock(lockKey,ANALYSIS_LOCK_LEASE_SECONDS);
    if(!lock.acquired){
      scheduleRetry(date,force);
      return snapshots.get(date)||await hydrate(date);
    }

    let lastRenew=Date.now();
    const renewIfNeeded=async()=>{
      if(Date.now()-lastRenew<ANALYSIS_LOCK_RENEW_MS)return;
      await renewJobLock(lockKey,ANALYSIS_LOCK_LEASE_SECONDS).catch(()=>null);
      lastRenew=Date.now();
    };

    try{
      const board=await getApiFootballFastFixtureBoard(date);
      const fixtures=(board.fixtures||[]).filter(eligible);
      const saved=force?[]:await loadFixtureStates(date,5000);
      const savedMap=new Map(saved.filter(r=>r?.analysis_ready&&r?.payload?.analysis&&hasExactEvidence(r.payload.analysis)).map(r=>[String(r.fixture_id),r]));
      const items=[];
      let processed=0,restored=0,warning=null;

      for(const f of fixtures){
        await renewIfNeeded();
        const id=String(f.id),old=savedMap.get(id);
        if(old){
          items.push({fixture:publicFixture(f),analysis:upgradeAnalysisForCurrentRules(old.payload.analysis),restored:true});
          processed++;
          restored++;
        }else{
          try{
            const intel=await getApiFootballIntelligence({date,beforeDate:date,sourceEventId:f.sourceId||f.id,kickoff:f.kickoff,homeName:f.home?.name,awayName:f.away?.name,league:f.league?.name,country:f.league?.country},f,{mode:'engine'});
            const analysis=analyseFixture(f,intel),item={fixture:publicFixture(f),analysis};
            items.push(item);
            processed++;
            await checkpointFixtureStates([{fixture_date:date,fixture_id:id,source_fixture_id:String(f.sourceId||f.id),kickoff:f.kickoff||null,analysis_ready:true,state:'COMPLETE',stage:'GOLDEN_BANKER',attempts:1,payload:item,completed_at:new Date().toISOString()}]);
          }catch(e){
            const msg=e?.message||'Split-form data unavailable.',item={fixture:publicFixture(f),analysis:waiting(f,msg)};
            warning=warning||msg;
            items.push(item);
            processed++;
            await checkpointFixtureStates([{fixture_date:date,fixture_id:id,source_fixture_id:String(f.sourceId||f.id),kickoff:f.kickoff||null,analysis_ready:false,state:e?.code==='SPLIT_SAMPLE_INCOMPLETE'?'WAITING_SPLIT_SAMPLE':'RETRYABLE',stage:'GOLDEN_BANKER_WAITING',attempts:1,last_error:msg,payload:item}]);
          }
        }

        const snap=makeBoard(date,board,items,{processed,total:fixtures.length,warning,restored});
        snapshots.set(date,snap);
        fixtureSeededDates.add(date);
        await checkpointBoard({boardKey:ENGINE,date,complete:false,processed,total:fixtures.length,payload:snap,generatedAt:snap.generatedAt});
      }

      const final=makeBoard(date,board,items,{complete:true,processed,total:fixtures.length,warning,restored});
      snapshots.set(date,final);
      fixtureSeededDates.add(date);
      await checkpointBoard({boardKey:ENGINE,date,complete:true,processed,total:fixtures.length,payload:final,generatedAt:final.generatedAt});
      await persistTop(date,final.topBankers).catch(()=>null);
      return final;
    }finally{
      await releaseJobLock(lockKey).catch(()=>null);
    }
  })().finally(()=>jobs.delete(date));

  jobs.set(date,task);
  return task;
}

const kick=(date,force=false)=>{if(!jobs.has(date))queueMicrotask(()=>analyseDate(date,{force}).catch(()=>null))};

async function preloadUpcomingWeek(){
  if(preloadTask)return preloadTask;
  preloadTask=(async()=>{
    // Stage 1: seed every date's fixture list before any deep history work.
    // This keeps Thu–Tue immediately browseable even when deep analysis is slow.
    await preloadFixtureLists();

    // Stage 2: analyse sequentially so API-Football history calls stay controlled.
    for(let n=0;n<=PRELOAD_DAYS_AHEAD;n++){
      const date=utcDate(n);
      const current=snapshots.get(date)||await hydrate(date).catch(()=>null);
      if(current?.complete)continue;
      await analyseDate(date).catch(()=>null);
    }
  })().finally(()=>{preloadTask=null});
  return preloadTask;
}

function resultScore(f){const s=f?.score||{},h=Number.isFinite(Number(s.fulltimeHome))?Number(s.fulltimeHome):Number(s.home),a=Number.isFinite(Number(s.fulltimeAway))?Number(s.fulltimeAway):Number(s.away);return Number.isFinite(h)&&Number.isFinite(a)?{h,a}:null}
function settle(m,h,a){if(m==='HOME_WIN')return h>a?'WON':'LOST';if(m==='AWAY_WIN')return a>h?'WON':'LOST';if(m==='HOME_DNB')return h>a?'WON':h===a?'PUSH':'LOST';if(m==='AWAY_DNB')return a>h?'WON':h===a?'PUSH':'LOST';if(m==='UNDER_3_5')return h+a<=3?'WON':'LOST';if(m==='OVER_2_5')return h+a>=3?'WON':'LOST';if(m==='BTTS_YES')return h>0&&a>0?'WON':'LOST';return'REVIEW'}
export async function settleDate(date){if(!supabaseConfigured())return;const [results,ledger]=await Promise.all([getApiFootballResults(date),getPredictionLedger({from:date,to:date,engine:ENGINE,status:'PENDING',limit:100})]),map=new Map((results.fixtures||[]).map(f=>[String(f.id),f])),updates=[];for(const row of ledger.rows||[]){const f=map.get(String(row.fixture_id)),s=f&&resultScore(f);if(!s)continue;updates.push({...row,settlement_status:settle(String(row.market||''),s.h,s.a),settled_at:new Date().toISOString(),home_score:s.h,away_score:s.a,result_payload:{source:'API_FOOTBALL',score:{home:s.h,away:s.a}}})}if(updates.length)await upsertPredictionLedger(updates)}
export function health(){return{ok:true,version:VERSION,engine:'Golden Banker v4.3',engineCode:ENGINE,apiFootball:apiFootballConfigured(),supabase:supabaseConfigured(),persistence:persistenceCoreEnabled(),providerQueue:apiFootballRateState(),analysisLockRevision:ANALYSIS_LOCK_REVISION,analysisLockLeaseSeconds:ANALYSIS_LOCK_LEASE_SECONDS,preloadDaysAhead:PRELOAD_DAYS_AHEAD,seededFixtureDates:[...fixtureSeededDates].sort(),preloadedDates:[...snapshots.entries()].filter(([,b])=>b?.complete).map(([date])=>date).sort()}}
export async function fixtureBoard(date){
  // Future fixtures are stable enough to serve from the seeded/saved board.
  // This prevents deep history analysis or a provider cooldown from blanking a future tab.
  if(date>utcDate()){
    const cached=snapshots.get(date)||await hydrate(date).catch(()=>null);
    const cachedBoard=cachedFixtureBoard(date,cached);
    if(cachedBoard&&(cachedBoard.fixtures.length||fixtureSeededDates.has(date)))return cachedBoard;
    try{
      const seeded=await seedFixtureDate(date);
      const seededBoard=cachedFixtureBoard(date,seeded);
      if(seededBoard)return seededBoard;
    }catch{}
  }
  const b=await getApiFootballFastFixtureBoard(date);
  return{...b,fixtures:(b.fixtures||[]).filter(f=>!isSrl(f)).map(publicFixture)};
}
export const weekCounts=from=>getApiFootballFixtureCounts(from,7),liveBoard=()=>getApiFootballLiveBoard();
export async function proof(from,to){const l=await getPredictionLedger({from,to,engine:ENGINE,limit:500});return{from,to,rows:l.rows||[]}}
export async function goldenBoard(date){let cur=snapshots.get(date)||await hydrate(date);if(isPast(date)){if(cur)return{...cur,historicalLock:true};const ledger=await getPredictionLedger({from:date,to:date,engine:ENGINE,limit:20});return{engine:'Golden Banker v4.3',engineCode:ENGINE,date,historicalLock:true,complete:true,all:[],topBankers:[],ledger:ledger.rows||[]}}if(!cur?.complete)kick(date);if(!cur){const b=await getApiFootballFastFixtureBoard(date);cur=makeBoard(date,b,[],{total:(b.fixtures||[]).filter(eligible).length});snapshots.set(date,cur);fixtureSeededDates.add(date)}return cur}
export async function startRuntime(){
  for(let n=0;n<=PRELOAD_DAYS_AHEAD;n++){
    const restored=await hydrate(utcDate(n)).catch(()=>null);
    if(restored&&Array.isArray(restored.fixtures))fixtureSeededDates.add(utcDate(n));
  }
  queueMicrotask(()=>preloadUpcomingWeek().catch(()=>null));
  const preloadTimer=setInterval(()=>preloadUpcomingWeek().catch(()=>null),PRELOAD_SWEEP_MS);
  preloadTimer.unref?.();
  const timer=setInterval(()=>{for(const n of[-2,-1,0])settleDate(utcDate(n)).catch(()=>null)},Math.max(5,Number(process.env.AUTO_SETTLEMENT_INTERVAL_MINUTES||10))*60000);
  timer.unref?.();
}
