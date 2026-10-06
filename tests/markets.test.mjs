import test from 'node:test';import assert from 'node:assert/strict';
import { compileSelection,evaluate,lineResult,selections } from '../src/engine/markets.mjs';
import { fixture,market } from './helpers.mjs';
test('prices from 1.20 upward are candidates; anything under 1.20 is not',()=>{
  for(const odds of [null,'',0,-1,1,1.01,1.19,1.1999,1.20,1.35,1.50,1.51,2.4,8]) {
    const f=fixture();f.markets=[market(1,'1X2',[['Home',odds]])];
    assert.equal(selections(f).candidates.length,Number(odds)>=1.2?1:0,`odds ${odds}`);
  }
});
test('suspended markets and outcomes are excluded even at an eligible price',()=>{
  const f=fixture();f.markets=[market(1,'1X2',[['Home',1.5],['Draw',1.51],['Away',1]])];
  assert.deepEqual(selections(f).candidates.map(c=>c.odds),[1.5,1.51]);
  f.markets[0].outcomes[0].isActive=0;assert.deepEqual(selections(f).candidates.map(c=>c.odds),[1.51]);
  f.markets[0].outcomes[1].isActive=0;assert.equal(selections(f).candidates.length,0);
  f.markets[0].outcomes[0].isActive=1;f.markets[0].outcomes[1].isActive=1;f.markets[0].status=1;assert.equal(selections(f).candidates.length,0);
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
test('a club-named total is that club’s goals, not the match total',()=>{
  const teams={home:{name:'Colombia'},away:{name:'Peru'}};
  const peru=market(20,'Peru Over/Under',[['Over 0.5',2.10]],'total=0.5');
  const awayPick=compileSelection(peru,peru.outcomes[0],teams);
  assert.equal(awayPick.team,'away');
  assert.equal(awayPick.line,0.5);
  assert.equal(evaluate(awayPick,{home:1,away:0}),-1);
  assert.equal(evaluate(awayPick,{home:0,away:1}),1);
  const colombia=market(19,'Colombia Over/Under',[['Over 0.5',1.13]],'total=0.5');
  const homePick=compileSelection(colombia,colombia.outcomes[0],teams);
  assert.equal(homePick.team,'home');
  assert.equal(evaluate(homePick,{home:0,away:1}),-1);
  const match=market(18,'Over/Under',[['Over 0.5',1.06]],'total=0.5');
  assert.equal(compileSelection(match,match.outcomes[0],teams).team,null);
  assert.equal(evaluate(compileSelection(match,match.outcomes[0],teams),{home:1,away:0}),1);
  const half=market(70,'1st half - Peru Over/Under',[['Over 0.5',3.60]],'total=0.5');
  const halfPick=compileSelection(half,half.outcomes[0],teams);
  assert.equal(halfPick.team,'away');
  assert.equal(halfPick.period,'ht');
  assert.equal(evaluate(halfPick,{home:0,away:1,htHome:0,htAway:0}),-1);
  assert.equal(evaluate(halfPick,{home:0,away:1,htHome:0,htAway:1}),1);
  const named=market(999,'Beta FC Over/Under',[['Under 1.5',1.40]],'total=1.5');
  const namedPick=compileSelection(named,named.outcomes[0],fixture());
  assert.equal(namedPick.team,'away');
  assert.equal(evaluate(namedPick,{home:3,away:1}),1);
});
