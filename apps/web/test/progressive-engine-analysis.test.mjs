import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import net from 'node:net';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(error => error ? reject(error) : resolve(port)); }); server.on('error', reject); }); }
async function waitFor(url, timeout = 15000) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { const response = await fetch(url); if (response.ok) return response; last = new Error(String(response.status)); } catch (error) { last = error; } await pause(100); } throw last || new Error('timeout'); }
function row({ id, date, homeId, awayId, home, away, status = 'NS', hg = null, ag = null }) { return { fixture:{ id, date, timezone:'UTC', venue:{ id:1, name:'Arena' }, status:{ short:status, elapsed:null } }, league:{ id:55, name:'Premier A', country:'Ghana', season:2038 }, teams:{ home:{ id:homeId, name:home, logo:`https://img/${homeId}.png` }, away:{ id:awayId, name:away, logo:`https://img/${awayId}.png` } }, goals:{ home:hg, away:ag }, score:{ halftime:{ home:null, away:null }, fulltime:{ home:hg, away:ag } } }; }
function odds(id) { return { fixture:{ id }, bookmakers:[{ id:8, name:'Book', bets:[{ name:'Match Winner', values:[{value:'Home',odd:'1.70'},{value:'Draw',odd:'3.60'},{value:'Away',odd:'4.80'}] },{ name:'Goals Over/Under', values:[{value:'Over 1.5',odd:'1.24'},{value:'Over 2.5',odd:'1.66'},{value:'Under 2.5',odd:'2.10'},{value:'Under 3.5',odd:'1.40'}] },{ name:'Both Teams To Score', values:[{value:'Yes',odd:'1.72'},{value:'No',odd:'1.95'}] }] }] }; }

test('engine HTTP routes return progress immediately while histories continue in background', async t => {
  const port = await freePort(); const apiPort = await freePort();
  const date = new Date(Date.now() + 86400000).toISOString().slice(0,10); const kickoff = `${date}T18:00:00Z`;
  const scheduled = row({ id:9101, date:kickoff, homeId:101, awayId:202, home:'Alpha FC', away:'Beta FC' });
  const homeHistory = Array.from({length:5},(_,i)=>row({id:9200+i,date:`2037-01-0${i+1}T12:00:00Z`,homeId:101,awayId:300+i,home:'Alpha FC',away:`H${i}`,status:'FT',hg:2,ag:0}));
  const awayHistory = Array.from({length:5},(_,i)=>row({id:9300+i,date:`2037-01-0${i+1}T13:00:00Z`,homeId:400+i,awayId:202,home:`A${i}`,away:'Beta FC',status:'FT',hg:0,ag:1}));
  const api=createServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host}`);res.setHeader('content-type','application/json');const send=response=>res.end(JSON.stringify({response,errors:[],paging:{current:1,total:1}}));if(url.pathname==='/fixtures'&&url.searchParams.get('date')===date)return send([scheduled]);if(url.pathname==='/odds')return send([odds(9101)]);if(url.pathname==='/fixtures'&&url.searchParams.get('team')==='101'){await pause(1200);return send(homeHistory);}if(url.pathname==='/fixtures'&&url.searchParams.get('team')==='202'){await pause(1200);return send(awayHistory);}return send([]);});
  await new Promise((resolve,reject)=>{api.listen(apiPort,'127.0.0.1',resolve);api.on('error',reject);}); t.after(()=>api.close());
  const child=spawn(process.execPath,['src/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),NODE_ENV:'test',AUTO_SETTLEMENT_ENABLED:'false',API_FOOTBALL_KEY:'key',API_FOOTBALL_BASE_URL:`http://127.0.0.1:${apiPort}/`,API_FOOTBALL_RETRIES:'0',API_FOOTBALL_REQUEST_MIN_INTERVAL_MS:'0',SUPABASE_URL:'',SUPABASE_ANON_KEY:'',SUPABASE_SERVICE_ROLE_KEY:''},stdio:['ignore','pipe','pipe']}); t.after(()=>child.kill('SIGTERM'));
  await waitFor(`http://127.0.0.1:${port}/api/health`);
  let started=Date.now(); let market=await(await fetch(`http://127.0.0.1:${port}/api/market-route-board?date=${date}`)).json(); assert.ok(Date.now()-started<1000); assert.equal(market.complete,false); assert.equal(market.summary.fixtures,1);
  started=Date.now(); let apex=await(await fetch(`http://127.0.0.1:${port}/api/apex-intelligence-board?date=${date}`)).json(); assert.ok(Date.now()-started<1000); assert.equal(apex.complete,false); assert.equal(apex.summary.fixtures,1);
  started=Date.now(); const consensus=await(await fetch(`http://127.0.0.1:${port}/api/consensus-picks?from=${date}&days=1`)).json(); assert.ok(Date.now()-started<1000); assert.equal(consensus.complete,false);
  const end=Date.now()+8000; while((!apex.complete||!market.complete)&&Date.now()<end){await pause(250); if(!apex.complete) apex=await(await fetch(`http://127.0.0.1:${port}/api/apex-intelligence-board?date=${date}`)).json(); if(!market.complete) market=await(await fetch(`http://127.0.0.1:${port}/api/market-route-board?date=${date}`)).json();} assert.equal(apex.complete,true); assert.equal(apex.failed,false); assert.equal(market.complete,true); assert.equal(market.failed,false);
});
