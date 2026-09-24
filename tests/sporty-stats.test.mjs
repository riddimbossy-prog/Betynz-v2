import test from 'node:test';import assert from 'node:assert/strict';
import { SportyStats,sportyResult,sportyTable } from '../src/providers/sporty-stats.mjs';
import { HttpClient } from '../src/providers/http.mjs';

const match=()=>({_id:12,_utid:1,_tid:2,_seasonid:3,time:{uts:1700000000},teams:{home:{uid:11,_id:999},away:{uid:22,_id:888}},periods:{ft:{home:1,away:1},p1:{home:0,away:1}},result:{home:3,away:2,period:'et'}});
test('Sportybet statistics require actual regulation scores and stable competitor IDs',()=>{
  const m=match();assert.equal(sportyResult(m).home,1);assert.equal(sportyResult(m).homeId,'11');
  m.periods.ft.home=null;assert.equal(sportyResult(m),null);
  delete m.periods.ft;assert.equal(sportyResult(m),null);
  const cancelled=match();cancelled.canceled=true;assert.equal(sportyResult(cancelled),null);
  const upcoming=match();upcoming.time.uts=Date.now()/1000+3600;assert.equal(sportyResult(upcoming),null);
  const wrong=match();delete wrong.teams.home.uid;assert.equal(sportyResult(wrong),null);
});

const tableRows=()=>Array.from({length:10},(_,i)=>({team:{uid:i+1,name:`Team ${i+1}`},pos:i+1,pointsTotal:30-i,total:12,winTotal:8,drawTotal:2,lossTotal:2}));
const f={teams:{home:{id:'1'},away:{id:'8'}},league:{id:'1',season:'3',groupId:'2'}};
test('official positions and deducted points survive normalization; regional tables stay separate',()=>{
  const tablerows=tableRows();tablerows[0].pointsTotal=21;
  const data={tables:[{tournamentid:99,tablerows:tableRows()},{tournamentid:2,tablerows}]};
  const table=sportyTable(data,f);assert.equal(table.length,10);assert.equal(table[0].points,21);assert.equal(table[0].rank,1);
  assert.throws(()=>sportyTable({tables:[data.tables[0]]},f),/Comparable official/);
  assert.throws(()=>sportyTable({tables:[data.tables[1],data.tables[1]]},f),/Comparable official/);
  assert.throws(()=>sportyTable({tables:[{tournamentid:2,tablerows:tablerows.slice(0,3)}]},{...f,teams:{home:{id:'1'},away:{id:'2'}}}),/eight teams/);
});
test('exact Sportybet identity joins reject swapped competitor IDs even when names look similar',async()=>{
  const m=match();const provider=new SportyStats({client:{json:async()=>({doc:[{data:m}]})}});
  const sporty={id:'sr:match:12',home:{id:'sr:competitor:11'},away:{id:'sr:competitor:22'},kickoff:new Date(m.time.uts*1000).toISOString()};
  assert.equal((await provider.matchFixture(sporty)).teams.home.id,'11');
  await assert.rejects(provider.matchFixture({...sporty,home:sporty.away,away:sporty.home}),/identity mismatch/);
});
test('league history does not pool results from other regional groups or future matches',async()=>{
  const provider=new SportyStats();let requests=[];
  provider.get=async path=>{requests.push(path);return path.startsWith('stats_season_fixtures2')?{matches:[match(),{...match(),_id:13,_tid:99},{...match(),_id:14,time:{uts:Date.now()/1000+36000}}]}:{seasons:[]};};
  const history=await provider.leagueHistory({...f,fixture:{date:new Date().toISOString()}});
  assert.deepEqual(history.map(r=>r.id),['12']);assert.equal(requests.length,2);
});
test('transient empty JSON and network errors retry; denials and provider errors do not',async()=>{
  let calls=0;const client=new HttpClient({retryDelayMs:0,fetchImpl:async()=>{calls++;if(calls===1)throw new TypeError('connection reset');if(calls===2)return new Response('');return Response.json({ok:true});}});
  assert.deepEqual(await client.json('https://example.com/test'),{ok:true});assert.equal(calls,3);
  for(const status of [401,403]) {
    calls=0;const denied=new HttpClient({retryDelayMs:0,fetchImpl:async()=>{calls++;return new Response('denied',{status});}});
    await assert.rejects(denied.json('https://example.com/test'),new RegExp(`HTTP ${status}`));assert.equal(calls,1);
  }
  calls=0;const invalid=new HttpClient({retryDelayMs:0,fetchImpl:async()=>{calls++;return Response.json({error:'suspended'});}});
  await assert.rejects(invalid.json('https://example.com/test',{validate:()=>{throw new Error('account suspended');}}),/suspended/);assert.equal(calls,1);
});
