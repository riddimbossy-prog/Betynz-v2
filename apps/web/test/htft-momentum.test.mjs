import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtftMomentum } from '../src/engines/htftMomentum.mjs';
const fixture=odds=>({id:'htft-1',kickoff:'2099-01-01T12:00:00Z',home:{name:'Home'},away:{name:'Away'},odds});
const split=(overrides={})=>({played:5,form:['W','W','W','W','D'],wins:4,losses:0,ppg:2.6,halfTimeAvailable:5,firstHalfOver05:4,firstHalfGoalsAvg:1.2,htft:{WW:3,DW:1,LW:0,WD:0,DD:1,LD:0,WL:0,DL:0,LL:0},...overrides});

test('Chronos fires home lead-and-hold when WW opposes LL',()=>{const stats={homeSplit:split(),awaySplit:split({form:['L','L','L','D','L'],wins:0,losses:4,ppg:.2,htft:{WW:0,DW:0,LW:0,WD:0,DD:1,LD:0,WL:0,DL:1,LL:3}})};const r=analyzeHtftMomentum(fixture({htftHomeHome:2.1,homeWin:1.45}),stats);assert.ok(['HTFT_HOME_HOME','HOME_WIN'].includes(r.selection?.market));});

test('Chronos can use draw-to-home transition with safer 1X',()=>{const stats={homeSplit:split({htft:{WW:1,DW:3,LW:0,WD:0,DD:1,LD:0,WL:0,DL:0,LL:0},ppg:2.0}),awaySplit:split({form:['D','L','D','L','D'],wins:0,losses:2,ppg:.6,htft:{WW:0,DW:0,LW:0,WD:0,DD:2,LD:0,WL:0,DL:2,LL:1}})};const r=analyzeHtftMomentum(fixture({doubleChance1X:1.25}),stats);assert.equal(r.selection?.market,'DOUBLE_CHANCE_1X');});

test('Chronos waits for usable half-time samples',()=>{const r=analyzeHtftMomentum(fixture({homeWin:1.4}),{homeSplit:split({halfTimeAvailable:2}),awaySplit:split()});assert.equal(r.decision,'WAITING');});
