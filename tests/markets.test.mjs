import test from 'node:test';import assert from 'node:assert/strict';
import { compileSelection,evaluate,lineResult,selections } from '../src/engine/markets.mjs';
import { fixture,market } from './helpers.mjs';
test('odds filter includes 1.20 and 1.50 and rejects prices outside both boundaries',()=>{
  for(const odds of [null,'',0,-1,1,1.01,1.19,1.1999,1.20,1.35,1.50,1.5001,1.51]) {
    const f=fixture();f.markets=[market(1,'1X2',[['Home',odds]])];
    assert.equal(selections(f).candidates.length,odds>=1.20&&odds<=1.50?1:0,`odds ${odds}`);
  }
});
test('suspended markets and outcomes are excluded even at an eligible price',()=>{
  const f=fixture();f.markets=[market(1,'1X2',[['Home',1.5],['Draw',1.51],['Away',1]])];
  assert.deepEqual(selections(f).candidates.map(c=>c.odds),[1.5]);
  f.markets[0].outcomes[0].isActive=0;assert.equal(selections(f).candidates.length,0);
  f.markets[0].outcomes[0].isActive=1;f.markets[0].status=1;assert.equal(selections(f).candidates.length,0);
});
test('every market is retained in counts, unknown player markets receive an explicit exclusion',()=>{
  const f=fixture();f.markets.push(market(999,'Player to score',[['A player',1.4]]));
  const result=selections(f);assert.equal(result.counts.markets,5);assert.equal(result.excluded.length,1);
});
test('fulltime, half-time and second-half markets have distinct settlement',()=>{
  const r={home:3,away:1,htHome:1,htAway:1};
  for(const [name,expected] of [['1X2',1],['1st Half - 1X2',-1],['2nd Half - 1X2',1]]) {
    const m=market(1,name,[['Home',1.4]]);assert.equal(evaluate(compileSelection(m,m.outcomes[0]),r),expected);
  }
});
test('DNB refunds draws; Asian lines produce correct half-win, push and half-loss',()=>{
  assert.equal(evaluate({kind:'dnb',side:'home',stat:'goals',period:'ft'},{home:1,away:1}),0);
  assert.equal(lineResult(2,2.25,'over'),-0.5);assert.equal(lineResult(2,1.75,'over'),0.5);
  assert.equal(lineResult(2,2,'over'),0);assert.equal(lineResult(2,2.25,'under'),0.5);
  assert.equal(evaluate({kind:'asian-handicap',side:'home',line:-1.25,stat:'goals',period:'ft'},{home:2,away:1}),-0.5);
  assert.equal(evaluate({kind:'asian-handicap',side:'away',line:-1.25,stat:'goals',period:'ft'},{home:2,away:1}),0.5);
});
test('corner and card markets never use scoreline goals as statistics',()=>{
  const m=market(999,'Corners Over/Under',[['Over 8.5',1.4]],'total=8.5'),s=compileSelection(m,m.outcomes[0]);
  assert.equal(s.stat,'corners');assert.equal(evaluate(s,{home:5,away:5}),null);
  assert.equal(evaluate(s,{home:0,away:0,stats:{home:{corners:6},away:{corners:4}}}),1);
  assert.equal(compileSelection(market(1,'Total Cards',[['Over 3.5',1.4]]),{desc:'Over 3.5'}),null);
});
test('BTTS+result, HT/FT, clean sheets and no-goal shock have exact score semantics',()=>{
  const m=market(35,'1X2 & Both Teams To Score',[['Home & Yes',1.4]]),s=compileSelection(m,m.outcomes[0]);
  assert.equal(evaluate(s,{home:2,away:1}),1);assert.equal(evaluate(s,{home:2,away:0}),-1);
  const h=market(99,'HT/FT',[['Draw/Home',1.4]]),hs=compileSelection(h,h.outcomes[0]);
  assert.equal(evaluate(hs,{home:2,away:0,htHome:0,htAway:0}),1);
  assert.equal(evaluate(hs,{home:2,away:0,htHome:null,htAway:null}),null);
  assert.equal(evaluate({kind:'clean-sheet',team:'home',yes:true,stat:'goals',period:'ft'},{home:0,away:0}),1);
});
test('ambiguous sequence, scorer, time window and handicap markets are not guessed',()=>{
  for(const desc of ['First Goal','Home 2+ goals in a row','Next corner','Over/Under 10 minutes','Handicap']) {
    const m=market(800,desc,[['Home',1.3]],'hcp=1');assert.equal(compileSelection(m,m.outcomes[0]),null,desc);
  }
});
test('observed Sportybet compound markets preserve their actual win conditions',()=>{
  const noDraw=market(900041,'No Draw Both Teams To Score Yes/No',[['No',1.29]]);
  const s=compileSelection(noDraw,noDraw.outcomes[0]);
  assert.equal(evaluate(s,{home:1,away:1}),1); // A scoring draw makes No win.
  assert.equal(evaluate(s,{home:2,away:1}),-1);
  const both=market(59,'Both Halves Under 1.5',[['No',1.10]],'total=1.5');
  assert.equal(evaluate(compileSelection(both,both.outcomes[0]),{home:2,away:0,htHome:2,htAway:0}),1);
  const combo=market(854,'Home Team or Over 2.5',[['Yes',1.01]],'total=2.5');
  const c=compileSelection(combo,combo.outcomes[0]);
  assert.equal(evaluate(c,{home:0,away:3}),1);assert.equal(evaluate(c,{home:0,away:1}),-1);
  const f=fixture();f.markets=[{...noDraw,banned:true}];assert.equal(selections(f).candidates.length,0);
});
