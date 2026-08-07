import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverSelectionByMatchReasoning } from '../src/engines/adaptiveMarketRecovery.mjs';

const profile = (o={}) => ({
  played:5,wins:2,draws:1,losses:2,ppg:1.4,scoredIn:4,concededIn:4,cleanSheets:1,failedToScore:1,
  scored2Plus:2,scored3Plus:1,conceded2Plus:2,conceded3Plus:1,btts:3,over15:4,over25:3,under25:2,under35:4,
  goalsForAvg:1.4,goalsAgainstAvg:1.2,goalThresholds:{'1.5':{over:4,under:1},'2.5':{over:3,under:2},'3.5':{over:1,under:4}},...o
});
const evidence = (home={},away={}) => ({
  home:{played:10,ppg:2.1,strengthScore:72,streaks:{wins:3,unbeaten:5,losses:0,winless:0},...home},
  away:{played:10,ppg:1.0,strengthScore:35,streaks:{wins:0,unbeaten:0,losses:3,winless:5},...away},
  homeGoal:{xgFor:2.35,xgAgainst:.8,sotFor:5.8,sotAgainst:2.6},
  awayGoal:{xgFor:.8,xgAgainst:2.0,sotFor:2.1,sotAgainst:5.2}
});
const waiting = (market='OVER_2_5',odds=1.30) => ({engine:'MARKET_ROUTE',decision:'WAITING_DATA',selection:null,proposedSelection:{market,label:market,odds},dataValidation:{status:'INSUFFICIENT_DATA'},explanation:'Original route did not survive final validation.'});

test('failed weak-team goal threshold can recover to favourite 3+ goals when favourite alone has the data',()=>{
  const fixture={odds:{homeWin:1.12,draw:7.0,awayWin:15,homeOver05:1.01,homeOver15:1.14,homeOver25:1.62,awayOver05:1.82,bttsNo:1.48,under35:1.72,under25:2.25,over25:1.30}};
  const stats={homeSplit:profile({wins:4,losses:0,draws:1,ppg:2.6,scoredIn:5,scored2Plus:4,scored3Plus:3,goalsForAvg:2.6}),awaySplit:profile({wins:0,draws:1,losses:4,ppg:.2,failedToScore:3,conceded3Plus:3,goalsAgainstAvg:2.4})};
  const out=recoverSelectionByMatchReasoning(waiting(),{engine:'MARKET_ROUTE',selection:{market:'OVER_1_5',label:'Over 1.5 Goals',odds:1.10}},fixture,stats,evidence());
  assert.equal(out.selection?.market,'HOME_OVER_2_5');
  assert.equal(out.dataValidation?.status,'BACKED_BY_DATA');
  assert.equal(out.adaptiveRecovery?.recovered,true);
});

test('failed one-goal route can recover to clear favourite win when favourite clears 2+ and has strong PPG',()=>{
  const fixture={odds:{homeWin:1.56,draw:4.8,awayWin:6.8,homeOver05:1.08,homeOver15:1.16,homeOver25:2.30,awayOver05:1.78,bttsNo:1.50,under35:1.58,under25:2.15,over25:1.72}};
  const stats={homeSplit:profile({wins:4,draws:1,losses:0,ppg:2.6,scoredIn:5,scored2Plus:4,goalsForAvg:2.1}),awaySplit:profile({wins:0,draws:1,losses:4,ppg:.2,failedToScore:3,goalsForAvg:.5,goalsAgainstAvg:2.0})};
  const out=recoverSelectionByMatchReasoning(waiting(),{engine:'MARKET_ROUTE',selection:{market:'OVER_2_5',label:'Over 2.5 Goals',odds:1.72}},fixture,stats,evidence());
  assert.equal(out.selection?.market,'HOME_WIN');
  assert.match(out.explanation,/PPG|favourite/i);
});

test('neutral 1X2 can recover to under route when low-scoring data support compression',()=>{
  const fixture={odds:{homeWin:2.45,draw:3.05,awayWin:2.55,homeOver05:1.48,awayOver05:1.52,under25:1.72,under35:1.28,bttsYes:1.95,bttsNo:1.75,over15:1.42,over25:2.15}};
  const low=profile({wins:1,draws:3,losses:1,ppg:1.2,over25:1,under25:4,under35:5,btts:1,scoredIn:3,failedToScore:2,goalsForAvg:.7,goalsAgainstAvg:.8,goalsPerMatch:1.5,goalThresholds:{'1.5':{over:3,under:2},'2.5':{over:1,under:4},'3.5':{over:0,under:5}}});
  const out=recoverSelectionByMatchReasoning(waiting('OVER_2_5',2.15),{engine:'MARKET_ROUTE',selection:{market:'OVER_2_5',label:'Over 2.5 Goals',odds:2.15}},fixture,{homeSplit:low,awaySplit:low},{home:{played:10,ppg:1.3,streaks:{draws:2}},away:{played:10,ppg:1.2,streaks:{draws:2}}});
  assert.match(out.selection?.market||'',/^UNDER_/);
  assert.equal(out.dataValidation?.status,'BACKED_BY_DATA');
});

test('neutral 1X2 can recover to GG when both teams clear one-goal and BTTS data agree',()=>{
  const fixture={odds:{homeWin:2.40,draw:3.45,awayWin:2.50,homeOver05:1.24,awayOver05:1.27,bttsYes:1.68,bttsNo:2.20,over15:1.25,over25:1.78,under25:1.95}};
  const both=profile({wins:2,draws:2,losses:1,ppg:1.6,scoredIn:5,failedToScore:0,btts:4,goalsForAvg:1.5,goalsAgainstAvg:1.4});
  const out=recoverSelectionByMatchReasoning(waiting('DRAW',3.45),{engine:'MARKET_ROUTE',selection:{market:'DRAW',label:'Draw',odds:3.45}},fixture,{homeSplit:both,awaySplit:both},{home:{played:10,ppg:1.6,streaks:{}},away:{played:10,ppg:1.5,streaks:{}}});
  assert.equal(out.selection?.market,'BTTS_YES');
});

test('adaptive recovery withholds the match when no alternative is both logical and data-backed',()=>{
  const fixture={odds:{homeWin:1.10,draw:8,awayWin:18,homeOver15:1.12,awayOver05:1.85,over25:1.35}};
  const out=recoverSelectionByMatchReasoning(waiting(),{engine:'MARKET_ROUTE',selection:{market:'OVER_2_5',label:'Over 2.5 Goals',odds:1.35}},fixture,{homeSplit:profile({played:1}),awaySplit:profile({played:1})},null);
  assert.equal(out.selection,null);
  assert.equal(out.adaptiveRecovery?.recovered,false);
});
