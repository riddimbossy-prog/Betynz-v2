import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSelectionByData, applyDataBackedValidation } from '../src/engines/dataBackedValidation.mjs';
function split(over25=4, goalsPerMatch=3.1){return {played:5,wins:3,draws:1,losses:1,ppg:2,scoredIn:5,concededIn:4,scored2Plus:3,scored3Plus:2,conceded2Plus:2,conceded3Plus:1,goalsForAvg:1.8,goalsAgainstAvg:1.3,goalsPerMatch,over15:5,over25,under25:5-over25,under35:4,btts:4,failedToScore:0,firstHalfOver05:4,halfTimeAvailable:5,htft:{WW:3,DW:1,LW:0,WD:0,DD:1,LD:0,WL:0,DL:0,LL:1},goalThresholds:{'2.5':{overRate:over25/5*100,underRate:(5-over25)/5*100},'1.5':{overRate:100,underRate:0},'3.5':{overRate:20,underRate:80}}};}
const strong={homeSplit:split(5,3.3),awaySplit:split(4,3)};
const low={homeSplit:{...split(0,1.3),goalsForAvg:.6,goalsAgainstAvg:.7},awaySplit:{...split(1,1.5),goalsForAvg:.7,goalsAgainstAvg:.8}};
const engine=selection=>({decision:'FIRE',selection:{decision:'FIRE',score:88,grade:'A',...selection}});
test('Over 2.5 is confirmed when venue goal data strongly support it',()=>{const v=validateSelectionByData({market:'OVER_2_5',label:'Over 2.5 Goals'},{},strong,null);assert.equal(v.status,'BACKED_BY_DATA');assert.ok(v.supporting.length>=2);});
test('Over 2.5 is rejected when the match profile is clearly low scoring',()=>{const v=validateSelectionByData({market:'OVER_2_5',label:'Over 2.5 Goals'},{},low,null);assert.equal(v.status,'REJECTED_BY_DATA');});

test('Over 2.5 is rejected when the weaker side fails O0.5 and the favourite lacks a 3-goal-alone profile',()=>{
  const h={...split(5,3.2),scored3Plus:0,goalsForAvg:1.45};
  const a={...split(4,3.0),failedToScore:3};
  const fixture={odds:{homeWin:1.10,draw:7.0,awayWin:14,homeOver05:1.04,awayOver05:1.91}};
  const v=validateSelectionByData({market:'OVER_2_5',label:'Over 2.5 Goals'},fixture,{homeSplit:h,awaySplit:a},null);
  assert.equal(v.status,'REJECTED_BY_DATA');
  assert.equal(v.guards?.soloThreeRequired,true);
});
test('Over 2.5 can remain backed when the weaker side fails O0.5 but the favourite can plausibly score all three',()=>{
  const h={...split(5,3.6),scored3Plus:3,goalsForAvg:2.6};
  const a={...split(4,3.0),failedToScore:3};
  const fixture={odds:{homeWin:1.10,draw:7.0,awayWin:14,homeOver05:1.04,awayOver05:1.91}};
  const v=validateSelectionByData({market:'OVER_2_5',label:'Over 2.5 Goals'},fixture,{homeSplit:h,awaySplit:a},null);
  assert.equal(v.status,'BACKED_BY_DATA');
  assert.ok(v.guards?.soloThreeCapability>=50);
});
test('missing match samples hold a tip instead of publishing it',()=>{const out=applyDataBackedValidation(engine({market:'OVER_2_5',label:'Over 2.5 Goals'}),{},null,null);assert.equal(out.selection,null);assert.equal(out.decision,'WAITING_DATA');});
test('home result is independently backed by venue strength',()=>{const h={...split(),wins:4,draws:1,losses:0,ppg:2.6};const a={...split(),wins:1,draws:1,losses:3,ppg:.8};assert.equal(validateSelectionByData({market:'HOME_WIN',label:'Home Win'},{},{homeSplit:h,awaySplit:a},null).status,'BACKED_BY_DATA');});
test('team goal routes are checked against scoring and opponent conceding data',()=>{const h={...split(),scoredIn:5,goalsForAvg:1.9};const a={...split(),concededIn:5,goalsAgainstAvg:1.6};assert.equal(validateSelectionByData({market:'HOME_OVER_0_5',label:'Home Team Over 0.5'},{},{homeSplit:h,awaySplit:a},null).status,'BACKED_BY_DATA');});
test('HT/FT routes require matching transition evidence',()=>{const h={...split(),halfTimeAvailable:5,htft:{WW:4,DD:1}};const a={...split(),halfTimeAvailable:5,htft:{LL:4,DD:1}};assert.equal(validateSelectionByData({market:'HTFT_HOME_HOME',label:'Home/Home'},{},{homeSplit:h,awaySplit:a},null).status,'BACKED_BY_DATA');});
test('draw market can be backed by draw frequency and balanced PPG',()=>{const h={...split(),draws:2,wins:2,losses:1,ppg:1.6};const a={...split(),draws:2,wins:1,losses:2,ppg:1.4};assert.equal(validateSelectionByData({market:'DRAW',label:'Draw'},{},{homeSplit:h,awaySplit:a},null).status,'BACKED_BY_DATA');});

import { buildConsensusForFixture } from '../src/engines/consensus.mjs';
const validation = market => ({status:'BACKED_BY_DATA',backed:true,score:82,market,supporting:[{label:'Verified',value:'yes',state:'SUPPORT',weight:2,source:'VENUE_HISTORY'}],opposing:[],neutral:[]});

test('Consensus holds a derived shared market until that exact market is data-backed',()=>{
  const picks=[
    {engine:'A',engineName:'A',decision:'FIRE',market:'OVER_2_5',label:'Over 2.5',odds:1.70,score:88,dataBacked:true,dataValidation:validation('OVER_2_5')},
    {engine:'B',engineName:'B',decision:'FIRE',market:'BTTS_YES',label:'BTTS Yes',odds:1.65,score:84,dataBacked:true,dataValidation:validation('BTTS_YES')}
  ];
  const row=buildConsensusForFixture({fixture:{fixtureId:'1',kickoff:'2099-01-01T12:00:00Z'},picks,odds:{over15:1.35}});
  assert.equal(row.classification,'HOLD_DATA_VALIDATION');
  assert.equal(row.final,null);
});

test('Consensus publishes the shared market when that exact market has data validation',()=>{
  const v=validation('OVER_1_5');
  const picks=[
    {engine:'A',engineName:'A',decision:'FIRE',market:'OVER_1_5',label:'Over 1.5',odds:1.35,score:88,dataBacked:true,dataValidation:v},
    {engine:'B',engineName:'B',decision:'FIRE',market:'OVER_2_5',label:'Over 2.5',odds:1.70,score:84,dataBacked:true,dataValidation:validation('OVER_2_5')}
  ];
  const row=buildConsensusForFixture({fixture:{fixtureId:'1',kickoff:'2099-01-01T12:00:00Z'},picks,odds:{over15:1.35}});
  assert.equal(row.classification,'QUALIFIED_PICK');
  assert.equal(row.final.market,'OVER_1_5');
  assert.equal(row.final.dataValidation.status,'BACKED_BY_DATA');
});
