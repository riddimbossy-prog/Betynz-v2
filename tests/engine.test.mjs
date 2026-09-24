import test from 'node:test';import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { eligibility,analyse } from '../src/engine/analyse.mjs';
import { scoreGrid,leagueReliability,modelFor,estimate,orient } from '../src/engine/model.mjs';
import { selections } from '../src/engine/markets.mjs';
import { fixture,now,standing,record,stable,market } from './helpers.mjs';
const policy=JSON.parse(await readFile('config/policy.json','utf8'));
test('only top four or bottom three; both-top-five and both-bottom-three are excluded',()=>{
  const f=fixture();assert.equal(eligibility(f,policy,20,now).eligible,true);
  f.homeStanding=standing(1,4);f.awayStanding=standing(18,5);assert.match(eligibility(f,policy,20,now).reasons.join(),/Top-five/);
  f.homeStanding=standing(1,18);f.awayStanding=standing(18,20);assert.match(eligibility(f,policy,20,now).reasons.join(),/Bottom-three/);
  f.homeStanding=standing(1,6);f.awayStanding=standing(18,17);assert.match(eligibility(f,policy,20,now).reasons.join(),/Neither/);
  f.homeStanding=standing(1,4);f.awayStanding=standing(18,6);assert.equal(eligibility(f,policy,20,now).eligible,true);
});
test('50 leagues activates the mismatch check; table and form must agree',()=>{
  const f=fixture();f.awayStanding=standing(18,7);
  assert.equal(eligibility(f,policy,49,now).eligible,true);
  f.awayStanding=standing(18,6);assert.equal(eligibility(f,policy,50,now).eligible,false);
  f.awayStanding=standing(18,18);assert.equal(eligibility(f,policy,50,now).eligible,true);
  f.homeHistory=Array.from({length:5},(_,i)=>record(i,1,4,0,2));assert.equal(eligibility(f,policy,50,now).eligible,false);
});
test('missing data, stale odds, started matches and unreliable leagues fail closed',()=>{
  let f=fixture();f.homeStanding=null;assert.equal(eligibility(f,policy,10,now).eligible,false);
  f=fixture();f.oddsFetchedAt='2026-09-23T07:00:00Z';assert.equal(eligibility(f,policy,10,now).eligible,false);
  f=fixture();f.kickoff='2026-09-23T09:00:00Z';assert.equal(eligibility(f,policy,10,now).eligible,false);
  f=fixture();assert.equal(analyse(f,policy,{now,reliability:{reliable:false,reason:'Unstable'}}).tip,null);
  f.league.name='Club Friendlies';assert.equal(eligibility(f,policy,10,now).eligible,false);
});
test('one highest-probability final pick, one candidate per category, all prices within cap',()=>{
  const f=fixture();f.markets.push(market(18,'Over/Under',[['Under 6.5',1.12]],'total=6.5'));
  const r=analyse(f,policy,{now,leagueCount:50,reliability:stable});
  assert.ok(r.tip);assert.equal(r.categoryTips.length,new Set(r.categoryTips.map(x=>x.category)).size);
  assert.equal(r.tip.probability,Math.max(...r.categoryTips.map(x=>x.probability)));
  assert.ok(r.categoryTips.every(x=>x.odds<=1.5&&x.odds>=1.2));
  assert.ok(r.tip.risk.score>=0&&r.tip.risk.score<=100);assert.equal(r.tip.scenarios.length,3);
  assert.ok(r.reasons.join(' ').includes('Alpha FC'));assert.ok(r.tip.lossProbability>=0);
});
test('a likely market below 1.20 cannot win a category or become the final pick',()=>{
  const f=fixture();f.markets=[market(18,'Over/Under',[['Under 9.5',1.19]],'total=9.5')];
  const skipped=analyse(f,policy,{now,leagueCount:20,reliability:stable});
  assert.equal(skipped.tip,null);assert.deepEqual(skipped.categoryTips,[]);
  f.markets.push(market(18,'Over/Under',[['Under 8.5',1.20]],'total=8.5'));
  const accepted=analyse(f,policy,{now,leagueCount:20,reliability:stable});
  assert.equal(accepted.tip.odds,1.20);assert.equal(accepted.tip.selection,'Under 8.5');
});
test('probability mass is normalized; Asian return calculation values pushes correctly',()=>{
  const grid=scoreGrid(2.5,0.8);assert.ok(Math.abs(grid.reduce((s,r)=>s+r.weight,0)-1)<1e-9);
  const f=fixture();f.markets=[market(11,'Draw No Bet',[['Home',1.3]])];const c=selections(f).candidates[0],e=estimate(c,modelFor(f));
  assert.ok(Math.abs(e.win+e.push+e.loss+e.halfWin+e.halfLoss-1)<1e-9);
  assert.ok(Math.abs(e.expectedReturn-(e.win*0.3-e.loss))<1e-9);assert.ok(e.push>0);
});
test('reversed H2H swaps scores, half-time scores and team statistics together',()=>{
  const r=record(1,18,1,0,3),o=orient(r,'1');assert.equal(o.home,3);assert.equal(o.away,0);assert.equal(o.stats.home.xg,r.stats['1'].xg);
});
test('goals cannot manufacture corners; small advanced samples are rejected',()=>{
  const f=fixture();f.markets=[market(99,'Corners Over/Under',[['Over 3.5',1.3]],'total=3.5')];for(const r of [...f.homeHistory,...f.awayHistory,...f.h2h])r.stats=null;
  const result=analyse(f,policy,{now,reliability:stable});assert.equal(result.tip,null);assert.match(result.excludedMarkets[0].reason,/corners records/);
});
test('unproven leagues do not inherit a hard-coded reliable-country label',()=>{
  assert.equal(leagueReliability([],policy).reliable,false);
  assert.equal(leagueReliability(fixture().leagueHistory,policy).reliable,false);
});
