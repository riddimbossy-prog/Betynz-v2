import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeZeusIntelligence, applyZeusSupervisor } from '../src/engines/zeusIntelligence.mjs';
import { applyUniversalOddsGate } from '../src/engines/universalOddsGate.mjs';

const fixture = {
  id: 'z1',
  home: { name: 'Alpha' },
  away: { name: 'Beta' },
  odds: {
    homeWin: 1.65, doubleChance1X: 1.25, awayWin: 5.0, doubleChanceX2: 2.4,
    over15: 1.30, over25: 1.80, under25: 2.05, under35: 1.30,
    homeOver05: 1.20, homeOver15: 1.70, awayOver05: 1.45, awayOver15: 2.20
  }
};

const strongVenue = {
  homeSplit: { played:5, form:['W','W','W','D','W'], wins:4, draws:1, losses:0, ppg:2.6, goalsForAvg:2.0, goalsAgainstAvg:0.6, scoredIn:5, concededIn:2, cleanSheets:3, failedToScore:0, over15:5, over25:4, under35:4, btts:2, halfTimeAvailable:5, htft:{WW:3,DW:1,DD:1} },
  awaySplit: { played:5, form:['L','L','D','L','L'], wins:0, draws:1, losses:4, ppg:0.2, goalsForAvg:0.6, goalsAgainstAvg:2.0, scoredIn:2, concededIn:5, cleanSheets:0, failedToScore:3, over15:4, over25:3, under35:3, btts:2, halfTimeAvailable:5, htft:{LL:3,DL:1,DD:1} }
};

const strongEvidence = {
  home: { played:10, form:['W','W','W','D','W'], wins:8, draws:1, losses:1, ppg:2.5, goalsForAvg:2.0, goalsAgainstAvg:0.7, winRate:80, lossRate:10, xgFor:2.0, xgAgainst:0.8, xgSamples:5, strengthScore:86, classification:'BEST_FORM', streaks:{unbeaten:7, scoring:8, wins:3} },
  away: { played:10, form:['L','L','D','L','L'], wins:1, draws:2, losses:7, ppg:0.5, goalsForAvg:0.8, goalsAgainstAvg:1.9, winRate:10, lossRate:70, xgFor:0.8, xgAgainst:1.9, xgSamples:5, strengthScore:20, classification:'WORST_FORM', streaks:{winless:6, conceding:8, losses:2} },
  homeGoal: { xgFor:2.0, xgAgainst:0.8, xgSamples:5, sotFor:5.5, sotAgainst:2.5, sotSamples:4 },
  awayGoal: { xgFor:0.8, xgAgainst:1.9, xgSamples:5, sotFor:2.5, sotAgainst:5.2, sotSamples:4 }
};

const engines = ['MARKET_ROUTE','PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK','STREAK_VALUE','HTFT_MOMENTUM']
  .map(code => ({ code, result:{ decision:'FIRE', selection:{ market:'HOME_WIN', score:88 } } }));

test('Zeus waits when venue sample is incomplete', () => {
  const out = analyzeZeusIntelligence({ fixture, stats:{homeSplit:{played:2,form:['W','W']},awaySplit:{played:2,form:['L','L']}}, statsEvidence:strongEvidence, engineResults:engines });
  assert.equal(out.decision, 'WAITING');
  assert.equal(out.supervisor.verdict, 'WAIT');
});

test('Zeus approves a strong, complete home statistical edge', () => {
  const out = analyzeZeusIntelligence({ fixture, stats:strongVenue, statsEvidence:strongEvidence, engineResults:engines });
  assert.equal(out.decision, 'FIRE');
  assert.equal(out.selection.market, 'HOME_WIN');
  assert.equal(out.dominantDirection, 'HOME_RESULT');
  assert.ok(out.confidence >= 84);
  assert.ok(out.dataQuality >= 85);
  assert.equal(out.supervisor.verdict, 'APPROVE');
  assert.ok(out.evidenceFamilies.length >= 4);
});

test('Zeus can veto an apparently strong result when xG and attack evidence collapse', () => {
  const evidence = structuredClone(strongEvidence);
  evidence.home.xgFor = 0.55; evidence.home.xgAgainst = 1.8;
  evidence.homeGoal.xgFor = 0.55; evidence.homeGoal.xgAgainst = 1.8;
  evidence.homeGoal.sotFor = 1.6; evidence.homeGoal.sotAgainst = 5.1;
  evidence.away.xgFor = 1.9; evidence.away.xgAgainst = 0.7;
  evidence.awayGoal.xgFor = 1.9; evidence.awayGoal.xgAgainst = 0.7;
  evidence.awayGoal.sotFor = 5.0; evidence.awayGoal.sotAgainst = 2.1;
  const out = analyzeZeusIntelligence({ fixture, stats:strongVenue, statsEvidence:evidence, engineResults:engines });
  const homeControl = out.candidates.find(candidate => candidate.id === 'ZEUS_HOME_CONTROL');
  assert.ok(homeControl);
  assert.equal(homeControl.veto, true);
  assert.ok(homeControl.contradictions.some(item => item.level === 'HARD' && /xG/i.test(item.label)));
  assert.equal(homeControl.selection, null);
});

test('Zeus supervisor preserves the seven-engine agreement count when approving', () => {
  const zeus = analyzeZeusIntelligence({ fixture, stats:strongVenue, statsEvidence:strongEvidence, engineResults:engines });
  const base = { classification:'ELITE_BANKER', agreementCount:7, agreementDirection:'HOME_RESULT', final:{ market:'HOME_WIN', odds:1.65 }, reasons:['Seven engines agree.'] };
  const out = applyZeusSupervisor(base, zeus);
  assert.equal(out.agreementCount, 7);
  assert.equal(out.classification, 'ELITE_BANKER');
  assert.equal(out.zeusVerdict, 'APPROVED');
});

test('Zeus veto can hold Consensus without becoming an eighth vote', () => {
  const zeus = { dataQuality:92, confidence:90, dominantDirection:'AWAY_RESULT', decision:'FIRE', supervisor:{verdict:'APPROVE',reason:'Away statistical edge'}, selection:{market:'AWAY_WIN',odds:1.8} };
  const base = { classification:'CONSENSUS_BANKER', agreementCount:6, agreementDirection:'HOME_RESULT', final:{ market:'HOME_WIN', odds:1.65 }, reasons:['Six engines agree.'] };
  const out = applyZeusSupervisor(base, zeus);
  assert.equal(out.agreementCount, 6);
  assert.equal(out.classification, 'ZEUS_HOLD');
  assert.equal(out.final, null);
});

test('Zeus selection still passes the universal 1.20–2.00 publication gate', () => {
  const out = analyzeZeusIntelligence({ fixture, stats:strongVenue, statsEvidence:strongEvidence, engineResults:engines });
  const gated = applyUniversalOddsGate(out, fixture.odds);
  assert.ok(gated.selection);
  assert.ok(gated.selection.odds >= 1.20 && gated.selection.odds <= 2.00);
});
