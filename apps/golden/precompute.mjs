import { utcDate, fixtureBoard, goldenBoard } from './runtime.mjs';
import { settleDate } from './runtimeJobs.mjs';
import { ENGINE,snapshots,checkpointBoard,getApiFootballFastFixtureBoard } from './runtimeConfig.mjs';
import { scanBangers,BANGER_RULES } from './bangersScan.mjs';

const DAYS=7;
const POLL_MS=Math.max(2000,Number(process.env.PRECOMPUTE_POLL_MS||5000));
const MAX_RUN_MS=Math.max(10*60*1000,Number(process.env.PRECOMPUTE_MAX_RUN_MS||5*60*60*1000));
const started=Date.now();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// API-Football deliberately unrefs its internal queue timer so the long-running
// web server can shut down cleanly. A one-shot GitHub Actions worker has no
// server socket to keep Node alive, so a queued request can otherwise leave a
// pending top-level await and Node exits with code 13. Keep one referenced
// handle for the lifetime of this worker and clear it on successful completion.
const workerKeepAlive=setInterval(()=>{},30000);

function ensureBudget(){
  if(Date.now()-started>MAX_RUN_MS)throw new Error(`Precompute time budget exceeded after ${Math.round((Date.now()-started)/60000)} minutes.`);
}

async function attachBangers(date,board){
  let scanBoard=board;
  try{
    const fresh=await getApiFootballFastFixtureBoard(date);
    if(Array.isArray(fresh?.fixtures)&&fresh.fixtures.length){
      const byId=new Map(fresh.fixtures.map(f=>[String(f?.id||''),f]));
      scanBoard={
        ...board,
        fixtures:fresh.fixtures,
        all:(board?.all||[]).map(item=>({...item,fixture:byId.get(String(item?.fixture?.id||item?.analysis?.id||''))||item?.fixture}))
      };
    }
  }catch{}

  try{
    const bangers=await scanBangers(scanBoard);
    const augmented={
      ...scanBoard,
      bangers,
      bangersReady:true,
      bangersWarning:null,
      bangersGeneratedAt:new Date().toISOString(),
      bangerRules:BANGER_RULES,
      summary:{...(scanBoard?.summary||{}),bangersFound:bangers.length},
      generatedAt:new Date().toISOString()
    };
    snapshots.set(date,augmented);
    await checkpointBoard({
      boardKey:ENGINE,
      date,
      complete:Boolean(augmented.complete),
      processed:Number(augmented?.progress?.processed||0),
      total:Number(augmented?.progress?.total||0),
      payload:augmented,
      generatedAt:augmented.generatedAt
    });
    console.log(`[bangers] ${date}: ${bangers.length} strict Over 2.5 qualifier${bangers.length===1?'':'s'}`);
    return augmented;
  }catch(error){
    const warning=String(error?.message||error||'Bangers scan failed');
    const augmented={...scanBoard,bangers:[],bangersReady:false,bangersWarning:warning,bangerRules:BANGER_RULES};
    snapshots.set(date,augmented);
    await checkpointBoard({boardKey:ENGINE,date,complete:Boolean(augmented.complete),processed:Number(augmented?.progress?.processed||0),total:Number(augmented?.progress?.total||0),payload:augmented,generatedAt:augmented.generatedAt||new Date().toISOString()}).catch(()=>null);
    console.warn(`[bangers] ${date}: ${warning}`);
    return augmented;
  }
}

console.log(`Betynz precompute worker starting for ${DAYS} days.`);

// Seed every fixture list first so all date tabs can populate before deep analysis.
for(let n=0;n<DAYS;n++){
  ensureBudget();
  const date=utcDate(n);
  try{
    const board=await fixtureBoard(date);
    console.log(`[seed] ${date}: ${board?.fixtures?.length||0} fixtures`);
  }catch(error){
    console.warn(`[seed] ${date}: ${error?.message||error}`);
  }
}

// Run the production Golden Banker engine one date at a time, then attach the
// strict Bangers scan to the same persisted board payload.
for(let n=0;n<DAYS;n++){
  ensureBudget();
  const date=utcDate(n);
  let last='';
  while(true){
    ensureBudget();
    const board=await goldenBoard(date);
    const p=board?.progress||{};
    const state=`${Number(p.processed||0)}/${Number(p.total||0)}`;
    if(state!==last){console.log(`[analyse] ${date}: ${state}${board?.complete?' complete':''}`);last=state;}
    if(board?.complete){await attachBangers(date,board);break;}
    await sleep(POLL_MS);
  }
}

for(const n of[-2,-1,0]){
  ensureBudget();
  const date=utcDate(n);
  try{await settleDate(date);console.log(`[settle] ${date}: done`);}catch(error){console.warn(`[settle] ${date}: ${error?.message||error}`);}
}

clearInterval(workerKeepAlive);
console.log(`Betynz precompute worker finished in ${Math.round((Date.now()-started)/1000)} seconds.`);
