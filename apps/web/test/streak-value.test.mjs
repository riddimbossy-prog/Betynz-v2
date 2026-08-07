import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStreakValue } from '../src/engines/streakValue.mjs';

const fixture=odds=>({id:'atlas-1',kickoff:'2099-01-01T12:00:00Z',home:{name:'Home'},away:{name:'Away'},league:{name:'League',country:'Test'},odds});
const profile=(overrides={})=>({played:10,form:['W','W','W','W','D'],wins:8,draws:1,losses:1,ppg:2.5,goalsForAvg:2.1,goalsAgainstAvg:.7,strengthScore:88,classification:'BEST_FORM',streaks:{wins:4,losses:0,unbeaten:6,winless:0,scoring:7,conceding:2,cleanSheets:2,failedToScore:0,over15:5,over25:4,under15:0,under25:0,under35:1,teamOver05:7,teamOver15:4,teamUnder05:0,teamUnder15:0,...(overrides.streaks||{})},...overrides});

test('Atlas qualifies a best-vs-worst result only inside 1.20–1.55',()=>{const evidence={home:profile(),away:profile({classification:'WORST_FORM',strengthScore:18,form:['L','L','L','D','L'],wins:1,losses:8,ppg:.4,streaks:{losses:3,winless:6,unbeaten:0,wins:0,scoring:2,conceding:7,over15:3,over25:2,under35:4,teamOver05:2,teamUnder05:3}})};const r=analyzeStreakValue(fixture({homeWin:1.42,doubleChance1X:1.21}),evidence);assert.equal(r.selection?.market,'HOME_WIN');assert.equal(r.decision,'FIRE');});

test('Atlas rejects a target and safer market outside the value band',()=>{const evidence={home:profile(),away:profile({classification:'WORST_FORM',strengthScore:18,form:['L','L','L','L','D'],streaks:{losses:4,winless:5}})};const r=analyzeStreakValue(fixture({homeWin:1.16,doubleChance1X:1.10}),evidence);assert.equal(r.selection,null);});

test('xG and SOT confirm a goal streak route',()=>{const evidence={home:profile(),away:profile({classification:'STRONG',strengthScore:75}),homeGoal:{xgFor:1.65,xgAgainst:1.1,sotFor:4.6,sotAgainst:3.1},awayGoal:{xgFor:1.45,xgAgainst:1.2,sotFor:4.2,sotAgainst:3.4}};const r=analyzeStreakValue(fixture({over25:1.48,over15:1.23}),evidence);assert.ok(['OVER_2_5','OVER_1_5'].includes(r.selection?.market));assert.ok((r.selection?.evidenceFamilies||[]).includes('XG'));assert.ok((r.selection?.evidenceFamilies||[]).includes('SOT'));});

test('strong contradictory xG blocks a goal-over selection',()=>{const evidence={home:profile(),away:profile({classification:'STRONG'}),homeGoal:{xgFor:.65,xgAgainst:.6,sotFor:2.0,sotAgainst:2.1},awayGoal:{xgFor:.65,xgAgainst:.7,sotFor:2.0,sotAgainst:2.2}};const r=analyzeStreakValue(fixture({over25:1.48,over15:1.23}),evidence);assert.notEqual(r.selection?.market,'OVER_2_5');});
