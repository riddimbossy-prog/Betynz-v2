import test from 'node:test';import assert from 'node:assert/strict';
import { Sportybet,normalizeEvent } from '../src/providers/sportybet.mjs';
import { matchFixture,resultRecord,nameSimilarity,normalizeStats } from '../src/providers/football.mjs';
test('fixture matching requires both team identities and close kickoff; never swaps teams',()=>{
  const s={home:{name:'Alpha FC'},away:{name:'Beta FC'},kickoff:'2026-09-23T20:00:00Z'};
  const f={fixture:{id:1,date:s.kickoff},teams:{home:{name:'Alpha'},away:{name:'Beta'}}};
  assert.equal(matchFixture(s,[f]).fixture,f);
  assert.equal(matchFixture(s,[f,{...f,fixture:{id:2,date:s.kickoff}}]).fixture,null);
  assert.equal(matchFixture(s,[{...f,teams:{home:f.teams.away,away:f.teams.home}}]).fixture,null);
  assert.equal(nameSimilarity('Alpha Women','Alpha'),0);
  assert.equal(matchFixture(s,[{...f,fixture:{date:'2026-09-23T21:00:00Z'}}]).fixture,null);
});
test('missing scores are not zero; extra-time results do not substitute for 90-minute scores',()=>{
  const f={fixture:{id:1,date:'2026-09-01',status:{short:'FT'}},league:{id:1},teams:{home:{id:1},away:{id:2}},goals:{home:null,away:null},score:{fulltime:{home:null,away:null}}};
  assert.equal(resultRecord(f),null);
  f.fixture.status.short='AET';f.goals={home:3,away:2};assert.equal(resultRecord(f),null);
  f.score.fulltime={home:1,away:1};assert.equal(resultRecord(f).home,1);
  assert.equal(normalizeStats([{team:{id:1},statistics:[{type:'Corner Kicks',value:null}]}])['1'].corners,null);
});
test('Sportybet scans both books and every page, then downloads event markets without a whitelist',async()=>{
  const calls=[];
  const client={async json(url,{validate}) {
    calls.push(String(url));const u=new URL(url),today=u.searchParams.get('todayGames')==='true',page=Number(u.searchParams.get('pageNum'));
    const ev=id=>({eventId:`sr:match:${id}`,homeTeamName:'Alpha',awayTeamName:'Beta',estimateStartTime:Date.parse('2026-09-23T20:00:00Z'),status:0,markets:[]});
    let data;if(u.pathname.endsWith('/event'))data={...ev(1),markets:[{id:'unknown-new-market',outcomes:[]}]};
    else data={totalNum:today?2:1,tournaments:[{id:'league',name:'League',events:[ev(today?page:3)]}]};
    const body={bizCode:10000,data};validate(body);return body;
  }};
  const sporty=new Sportybet({client});const result=await sporty.fixtures();
  assert.equal(result.fixtures.length,3);assert.equal(result.complete,true);
  assert.ok(calls.every(c=>!c.includes('marketId=')));
  const detail=await sporty.eventMarkets(result.fixtures[0]);assert.equal(detail.markets[0].id,'unknown-new-market');
});
test('incomplete pagination and blocked feeds report incomplete, never false success',async()=>{
  let n=0;const client={async json(){n++;throw new Error('HTTP 403');}};
  const r=await new Sportybet({client}).fixtures();assert.equal(r.complete,false);assert.equal(r.fixtures.length,0);assert.equal(n,2);assert.equal(r.diagnostics.length,2);
});
test('normalization preserves unknown markets and requires a real kickoff',()=>{
  const r=normalizeEvent({eventId:'m',estimateStartTime:null,markets:[{id:12345}]});assert.equal(r.kickoff,null);assert.equal(r.markets.length,1);
});
