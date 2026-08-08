import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeApexIntelligence } from '../src/engines/apexIntelligence.mjs';

const strong = (overrides = {}) => ({
  played: 5, form: ['W','W','W','D','W'], wins: 4, draws: 1, losses: 0, points: 13, ppg: 2.6,
  goalsForAvg: 2.0, goalsAgainstAvg: 0.6, goalsPerMatch: 2.6,
  scoredIn: 5, concededIn: 2, cleanSheets: 3, failedToScore: 0,
  over15: 4, over25: 3, under25: 2, under35: 5, btts: 2, scored2Plus: 4, conceded2Plus: 0,
  recent3: { played: 3, points: 9, wins: 3, losses: 0, scoredIn: 3, concededIn: 1, over15: 3, over25: 2, under35: 3, btts: 1 },
  ...overrides
});
const weak = (overrides = {}) => ({
  played: 5, form: ['L','L','D','L','L'], wins: 0, draws: 1, losses: 4, points: 1, ppg: 0.2,
  goalsForAvg: 0.6, goalsAgainstAvg: 2.0, goalsPerMatch: 2.6,
  scoredIn: 2, concededIn: 5, cleanSheets: 0, failedToScore: 3,
  over15: 4, over25: 3, under25: 2, under35: 4, btts: 2, scored2Plus: 0, conceded2Plus: 4,
  recent3: { played: 3, points: 0, wins: 0, losses: 3, scoredIn: 1, concededIn: 3, over15: 3, over25: 2, under35: 2, btts: 1 },
  ...overrides
});

function run(home, away, odds = {}) {
  return analyzeApexIntelligence({ odds: { homeWin:1.65, draw:3.8, awayWin:5.2, doubleChance1X:1.18, doubleChanceX2:2.2, over15:1.25, over25:1.78, under25:2.05, under35:1.30, bttsYes:1.82, bttsNo:1.90, ...odds } }, { homeSplit: home, awaySplit: away });
}

test('Apex waits for complete five-match venue samples', () => {
  const result = run({ ...strong(), played: 4 }, weak());
  assert.equal(result.decision, 'WAITING');
  assert.equal(result.selection, null);
});

test('Apex qualifies a dominant home-result route from multiple independent evidence families', () => {
  const result = run(strong(), weak());
  const route = result.candidates.find(item => item.id === 'APEX_HOME_EDGE');
  assert.equal(result.engine, 'APEX_INTELLIGENCE');
  assert.equal(route?.selection?.market, 'HOME_WIN');
  assert.equal(route?.selection?.decision, 'FIRE');
  assert.ok(route?.selection?.evidenceFamilies >= 4);
  assert.ok(route?.selection?.score >= 82);
  assert.ok(result.selection, 'Apex must publish exactly one strongest qualified route.');
});

test('Apex qualifies a composite attacking route while selecting the strongest compatible market', () => {
  const attack = strong({ form:['W','D','W','W','D'], wins:3, draws:2, points:11, ppg:2.2, goalsForAvg:2.1, goalsAgainstAvg:1.5, goalsPerMatch:3.6, scoredIn:5, concededIn:5, cleanSheets:0, failedToScore:0, over15:5, over25:4, under25:1, under35:3, btts:5, recent3:{ played:3, points:7, wins:2, losses:0, scoredIn:3, concededIn:3, over15:3, over25:3, under35:1, btts:3 } });
  const result = run(attack, attack, { over25:1.72, under25:2.15, bttsYes:1.65 });
  const route = result.candidates.find(item => item.id === 'APEX_OVER');
  assert.equal(route?.selection?.market, 'OVER_2_5');
  assert.ok(route?.selection?.score >= 82);
  assert.ok(['OVER_2_5', 'BTTS_YES'].includes(result.selection?.market));
});

test('Apex rejects a direct result when the opposing elite profile is a hard blocker', () => {
  const home = strong({ ppg:2.7, points:14 });
  const away = strong({ ppg:2.1, wins:4, points:12, goalsForAvg:1.8, scoredIn:5 });
  const result = run(home, away);
  assert.notEqual(result.selection?.market, 'HOME_WIN');
});

test('Apex summary exposes data quality and the closest composite route', async () => {
  const { apexIntelligenceSummary } = await import('../src/engines/apexIntelligence.mjs');
  const summary = apexIntelligenceSummary(run(strong(), weak()));
  assert.ok(summary.dataQuality >= 80);
  assert.ok(summary.closest?.id);
});
