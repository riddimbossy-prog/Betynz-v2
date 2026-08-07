import test from 'node:test';
import assert from 'node:assert/strict';
import { applyUniversalOddsGate, gateSelection, isUniversalOddsPublishable, UNIVERSAL_ODDS_GATE } from '../src/engines/universalOddsGate.mjs';

const engine = selection => ({ engine:'TEST_ENGINE', decision:selection?.decision||'FIRE', selection, candidates:[], explanation:'Qualified route.' });

test('universal gate publishes inclusive 1.20 and 2.00 prices',()=>{
  assert.equal(isUniversalOddsPublishable(1.20),true);
  assert.equal(isUniversalOddsPublishable(2.00),true);
  assert.deepEqual(UNIVERSAL_ODDS_GATE,{min:1.2,max:2});
});

test('a low Over 1.5 is upgraded to Over 2.5 inside the band',()=>{
  const result=applyUniversalOddsGate(engine({market:'OVER_1_5',label:'Over 1.5 Goals',odds:1.10,decision:'FIRE',score:88}),{over15:1.10,over25:1.52});
  assert.equal(result.selection?.market,'OVER_2_5'); assert.equal(result.selection?.odds,1.52); assert.equal(result.selection?.oddsGateAction,'UPGRADED');
});

test('a high Over 2.5 is downgraded to Over 1.5 inside the band',()=>{
  const result=applyUniversalOddsGate(engine({market:'OVER_2_5',label:'Over 2.5 Goals',odds:2.35,decision:'FIRE',score:88}),{over25:2.35,over15:1.44});
  assert.equal(result.selection?.market,'OVER_1_5'); assert.equal(result.selection?.decision,'SAFER'); assert.equal(result.selection?.oddsGateAction,'DOWNGRADED');
});

test('a low double-chance result upgrades to straight win when possible',()=>{
  const result=applyUniversalOddsGate(engine({market:'DOUBLE_CHANCE_1X',label:'Home or Draw (1X)',odds:1.12,decision:'SAFER',score:80}),{doubleChance1X:1.12,homeWin:1.61});
  assert.equal(result.selection?.market,'HOME_WIN'); assert.equal(result.selection?.odds,1.61); assert.equal(result.selection?.oddsGateAction,'UPGRADED');
});

test('a high straight win downgrades to double chance when possible',()=>{
  const result=applyUniversalOddsGate(engine({market:'AWAY_WIN',label:'Away Team to Win',odds:2.28,decision:'FIRE',score:84}),{awayWin:2.28,doubleChanceX2:1.54});
  assert.equal(result.selection?.market,'DOUBLE_CHANCE_X2'); assert.equal(result.selection?.odds,1.54); assert.equal(result.selection?.decision,'SAFER');
});

test('high HTFT result downgrades to compatible full-time result',()=>{
  const result=applyUniversalOddsGate(engine({market:'HTFT_HOME_HOME',label:'Half Time / Full Time — Home / Home',odds:3.10,decision:'FIRE',score:90}),{htftHomeHome:3.10,homeWin:1.72,doubleChance1X:1.28});
  assert.equal(result.selection?.market,'HOME_WIN'); assert.equal(result.selection?.odds,1.72); assert.equal(result.selection?.decision,'SAFER');
});

test('tip is rejected when no compatible market can be moved into 1.20–2.00',()=>{
  const result=applyUniversalOddsGate(engine({market:'HOME_WIN',label:'Home Team to Win',odds:1.08,decision:'FIRE',score:90}),{homeWin:1.08,doubleChance1X:1.03});
  assert.equal(result.selection,null); assert.equal(result.decision,'ODDS_GATE_REJECT'); assert.equal(result.oddsGate?.action,'REJECTED');
});

test('engine-provided compatible safer market is preferred for a high-price downgrade',()=>{
  const result=applyUniversalOddsGate({engine:'TEST_ENGINE',decision:'FIRE',explanation:'Qualified.',selection:{market:'OVER_2_5',label:'Over 2.5 Goals',odds:2.22,decision:'FIRE',routeId:'R1',score:88},candidates:[{id:'R1',target:{market:'OVER_2_5',label:'Over 2.5 Goals',odds:2.22},safer:{market:'OVER_1_5',label:'Over 1.5 Goals',odds:1.48}}]},{over25:2.22,over15:1.48});
  assert.equal(result.selection?.market,'OVER_1_5'); assert.equal(result.selection?.odds,1.48);
});

test('opposite-direction route alternatives are ignored by the gate',()=>{
  const result=applyUniversalOddsGate({engine:'TEST_ENGINE',decision:'FIRE',explanation:'Qualified.',selection:{market:'OVER_2_5',label:'Over 2.5 Goals',odds:2.22,decision:'FIRE',routeId:'R1',score:88},candidates:[{id:'R1',target:{market:'OVER_2_5',label:'Over 2.5 Goals',odds:2.22},safer:{market:'UNDER_3_5',label:'Under 3.5 Goals',odds:1.48}}]},{over25:2.22,over15:1.44,under35:1.48});
  assert.equal(result.selection?.market,'OVER_1_5'); assert.notEqual(result.selection?.market,'UNDER_3_5');
});

test('gateSelection reports rejection for missing price',()=>{
  const gated=gateSelection({market:'DRAW',label:'Draw',odds:null,decision:'FIRE'},{},null); assert.equal(gated.accepted,false);
});
