import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { refresh } from '../scripts/refresh.mjs';import { readJSON,writeJSON,day,addDays } from '../src/util.mjs';
import { fixture } from './helpers.mjs';
test('full pipeline writes one prediction plus every raw market; statistics IDs stay separate from Sportybet',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'betynz-pipeline-'));
  try {
    const f=fixture(),date=addDays(day(),1);f.kickoff=`${date}T20:00:00Z`;f.oddsFetchedAt=new Date().toISOString();f.marketFetchStatus='complete';
    const api={fixture:{id:600,date:f.kickoff},teams:{home:{id:1,name:f.home.name},away:{id:18,name:f.away.name}},league:{id:39,season:2026}};
    const history=[];let id=0;
    for(let h=1;h<=20;h++)for(let a=1;a<=20;a++)if(h!==a) {id++;history.push({id:String(id),homeId:String(h),awayId:String(a),date:new Date(Date.parse('2025-01-01')+id*3600000).toISOString(),home:h<a?3:0,away:h<a?0:2});}
    const sporty={country:'test',dailyBooks:async()=>({fixtures:[f],complete:true,diagnostics:[]})};
    const football={fixtures:async()=>[api],standings:async()=>f.table,leagueHistory:async()=>history,enrich:async()=>({...f,apiFixtureId:'600',leagueHistory:history})};
    const index=await refresh({sporty,football,betexplorer:{leagueTables:async()=>({home:[],away:[],venueConfirmed:true})},dataDir:directory,today:date,days:1});
    const board=await readJSON(`${directory}/board-${date}.json`),raw=await readJSON(`${directory}/markets-${date}.json`);
    assert.equal(index.complete,true);assert.equal(board.summary.qualified,1);assert.equal(board.matches[0].id,'sr:match:1');
    assert.ok(board.matches[0].tip.probability>=0.9&&board.matches[0].tip.probability<=1);assert.ok(board.matches[0].tip.odds>=1.2);assert.deepEqual(raw.fixtures[0].markets,f.markets);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('provider outage publishes explicit unavailable state with no synthetic or cached picks',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'betynz-outage-'));
  try {
    const date=day(),sporty={country:'test',dailyBooks:async()=>{throw new Error('HTTP 403');}};
    const index=await refresh({sporty,football:{},dataDir:directory,today:date,days:1});
    const board=await readJSON(`${directory}/board-${date}.json`);
    assert.equal(index.complete,false);assert.equal(board.status,'unavailable');assert.deepEqual(board.matches,[]);assert.match(board.diagnostics[0],/403/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('a started match keeps the pick already published for that day',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'betynz-settled-'));
  try {
    const played=fixture(),date=day();
    played.kickoff=new Date(Date.now()-60*60000).toISOString();
    played.oddsFetchedAt=new Date().toISOString();
    played.marketFetchStatus='complete';
    const gone={...played,id:'sr:match:gone',home:{...played.home,name:'Earlier FC'},tip:{selection:'Away',market:'1X2',odds:1.25,probability:0.6},categoryTips:[],htft:{pick:{label:'Away X2',odds:1.33,selection:'Draw or Away',market:'Double Chance'}},reasons:['Kept']};
    await writeJSON(`${directory}/board-${date}.json`,{matches:[
      {...played,status:'qualified',tip:{selection:'Home',market:'1X2',odds:1.4,probability:0.7},categoryTips:[],htft:{pick:{label:'Home 1X',odds:1.3,selection:'Home or Draw',market:'Double Chance'}},reasons:['Kept']},
      gone,
    ]});
    let analysed=0;
    const sporty={country:'test',dailyBooks:async()=>({fixtures:[played],complete:true,diagnostics:[]})};
    const football={fixtures:async()=>[],enrich:async()=>{analysed+=1;return played;}};
    const betexplorer={leagueTables:async()=>{analysed+=1;return {home:[],away:[],venueConfirmed:true};}};
    await refresh({sporty,football,betexplorer,dataDir:directory,today:date,days:1});
    const board=await readJSON(`${directory}/board-${date}.json`);
    assert.equal(analysed,0);
    assert.equal(board.matches.find(match=>match.id==='sr:match:1').tip.selection,'Home');
    assert.equal(board.matches.find(match=>match.id==='sr:match:gone').htft.pick.label,'Away X2');
    assert.equal(board.summary.qualified,2);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('a failed market refetch keeps the pick already published',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'betynz-refetch-'));
  try {
    const upcoming=fixture(),date=addDays(day(),1);
    upcoming.kickoff=`${date}T20:00:00Z`;
    upcoming.oddsFetchedAt=new Date().toISOString();
    upcoming.marketFetchStatus='complete';
    await writeJSON(`${directory}/board-${date}.json`,{matches:[{...upcoming,status:'qualified',tip:{selection:'Home',market:'1X2',odds:1.4,probability:0.7},categoryTips:[],htft:{pick:{label:'Home 1X',odds:1.3,selection:'Home or Draw',market:'Double Chance'}},reasons:['Kept']}]});
    let analysed=0;
    const failed={...upcoming,markets:[],marketFetchStatus:'failed'};
    const sporty={country:'test',dailyBooks:async()=>({fixtures:[failed],complete:false,diagnostics:['empty']})};
    const football={fixtures:async()=>[],enrich:async()=>{analysed+=1;return upcoming;}};
    const betexplorer={leagueTables:async()=>{analysed+=1;return {home:[],away:[],venueConfirmed:true};}};
    await refresh({sporty,football,betexplorer,dataDir:directory,today:date,days:1});
    const board=await readJSON(`${directory}/board-${date}.json`);
    assert.equal(analysed,0);
    assert.equal(board.matches[0].tip.selection,'Home');
    assert.equal(board.matches[0].htft.pick.label,'Home 1X');
    assert.equal(board.summary.qualified,1);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('SRL fixtures are dropped before statistics or HT/FT lookups',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'betynz-srl-'));
  try {
    const real=fixture(),date=addDays(day(),1);real.kickoff=`${date}T20:00:00Z`;real.oddsFetchedAt=new Date().toISOString();real.marketFetchStatus='complete';
    const srl=fixture();srl.id='sr:match:srl';srl.kickoff=real.kickoff;srl.oddsFetchedAt=real.oddsFetchedAt;srl.marketFetchStatus='complete';
    srl.league={...srl.league,country:'Simulated Reality League',name:'SRL Club Friendlies'};
    const seen=[];
    const sporty={country:'test',dailyBooks:async()=>({fixtures:[real,srl],complete:true,diagnostics:[]})};
    const football={fixtures:async()=>[],standings:async(f)=>{seen.push(f?.league?.name||f?.id);return [];},leagueHistory:async()=>[],enrich:async(f)=>{seen.push(f.id);return f;}};
    const betexplorer={leagueTables:async(league)=>{seen.push(league.name);return {home:[],away:[],venueConfirmed:true};}};
    await refresh({sporty,football,betexplorer,dataDir:directory,today:date,days:1});
    const board=await readJSON(`${directory}/board-${date}.json`);
    assert.equal(board.matches.some(m=>m.id==='sr:match:srl'),false);
    assert.equal(board.summary.fixtures,1);
    assert.equal(seen.includes('sr:match:srl'),false);
    assert.equal(seen.includes('SRL Club Friendlies'),false);
    assert.match((await readJSON(`${directory}/index.json`)).diagnostics.join(' '),/Skipped 1 simulated/);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('statistics outage does not publish a price under 1.20',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'betynz-all-'));
  try {
    const f=fixture(),date=addDays(day(),1);f.kickoff=`${date}T20:00:00Z`;f.oddsFetchedAt=new Date().toISOString();f.marketFetchStatus='complete';f.league.name='U19 Friendly';
    const sporty={country:'test',dailyBooks:async()=>({fixtures:[f],complete:true,diagnostics:[]})};
    const football={matchFixture:async()=>{throw new Error('No history');}};
    await refresh({sporty,football,betexplorer:{leagueTables:async()=>({home:[],away:[],venueConfirmed:true})},dataDir:directory,today:date,days:1});
    const board=await readJSON(`${directory}/board-${date}.json`);assert.equal(board.summary.qualified,0);assert.equal(board.matches[0].tip,null);
    assert.match(board.matches[0].reasons.join(' '),/1\.20/);
    assert.equal(board.busyDay,false);assert.equal(board.statistics.unavailable,1);assert.equal(board.status,'partial');
  } finally {await rm(directory,{recursive:true,force:true});}
});
