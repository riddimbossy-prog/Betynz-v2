import { utcDate, fixtureBoard, goldenBoard } from './runtime.mjs';
import { settleDate } from './runtimeJobs.mjs';

const DAYS=7;
const POLL_MS=Math.max(2000,Number(process.env.PRECOMPUTE_POLL_MS||5000));
const MAX_RUN_MS=Math.max(10*60*1000,Number(process.env.PRECOMPUTE_MAX_RUN_MS||5*60*60*1000));
const started=Date.now();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function ensureBudget(){
  if(Date.now()-started>MAX_RUN_MS)throw new Error(`Precompute time budget exceeded after ${Math.round((Date.now()-started)/60000)} minutes.`);
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

// Run the existing production engine one date at a time. Saved fixture states in
// Supabase are restored, so repeated Actions runs continue instead of starting over.
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
    if(board?.complete)break;
    await sleep(POLL_MS);
  }
}

for(const n of[-2,-1,0]){
  ensureBudget();
  const date=utcDate(n);
  try{await settleDate(date);console.log(`[settle] ${date}: done`);}catch(error){console.warn(`[settle] ${date}: ${error?.message||error}`);}
}

console.log(`Betynz precompute worker finished in ${Math.round((Date.now()-started)/1000)} seconds.`);
