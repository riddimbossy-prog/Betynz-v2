import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMomentumStreak } from '../src/engines/momentumStreak.mjs';

const fixture = odds => ({
  id: 'mom-1', kickoff: '2099-01-01T12:00:00.000Z',
  league: { country: 'Test', name: 'League' },
  home: { name: 'Home' }, away: { name: 'Away' }, odds
});

function split(overrides = {}) {
  return {
    played: 5, form: ['W','W','W','W','D'], wins: 4, draws: 1, losses: 0,
    points: 13, ppg: 2.6, scoredIn: 5, concededIn: 3, cleanSheets: 2,
    failedToScore: 0, over15: 4, over25: 3, under25: 2, under35: 4,
    btts: 3, scored2Plus: 3, conceded2Plus: 1, goalsForAvg: 2.0,
    goalsAgainstAvg: 0.8, recent3: { over15: 3, over25: 2, under35: 3, btts: 2 },
    ...overrides
  };
}

const stats = (home = {}, away = {}) => ({ homeSplit: split(home), awaySplit: split(away) });

test('fires home result when winning, opposition and scoring streak families align', () => {
  const result = analyzeMomentumStreak(fixture({ homeWin: 1.62, draw: 3.90, awayWin: 5.80, doubleChance1X: 1.14 }), stats({}, {
    form: ['L','L','D','L','L'], wins: 0, draws: 1, losses: 4, points: 1, ppg: 0.2,
    scoredIn: 2, concededIn: 5, cleanSheets: 0, failedToScore: 3, goalsForAvg: 0.5, goalsAgainstAvg: 2.0
  }));
  assert.equal(result.selection?.market, 'HOME_WIN');
  assert.equal(result.decision, 'FIRE');
  assert.ok(result.selection.streakFamilies.length >= 2);
});

test('fires a goal wave when long and recent scoring sequences agree', () => {
  const high = stats({ over15: 5, over25: 4, btts: 4, concededIn: 5, recent3: { over15: 3, over25: 3, under35: 2, btts: 3 } }, {
    form: ['D','W','L','W','D'], wins: 2, draws: 2, losses: 1, ppg: 1.6,
    over15: 5, over25: 4, btts: 4, scoredIn: 5, concededIn: 5,
    recent3: { over15: 3, over25: 2, under35: 2, btts: 2 }
  });
  const result = analyzeMomentumStreak(fixture({ over15: 1.24, over25: 1.67, under25: 2.20, under35: 1.68, bttsYes: 1.62 }), high);
  assert.ok(['OVER_2_5','BTTS_YES'].includes(result.selection?.market));
  assert.equal(result.decision, 'FIRE');
});

test('fires a low-event route when under and blank streaks agree', () => {
  const low = stats({
    form: ['D','L','D','W','D'], wins: 1, draws: 3, losses: 1, ppg: 1.2,
    over15: 2, over25: 1, under25: 4, under35: 5, btts: 1, scoredIn: 2, concededIn: 2,
    cleanSheets: 3, failedToScore: 3, recent3: { over15: 1, over25: 0, under35: 3, btts: 0 }
  }, {
    form: ['D','D','L','D','W'], wins: 1, draws: 3, losses: 1, ppg: 1.2,
    over15: 2, over25: 1, under25: 4, under35: 5, btts: 1, scoredIn: 2, concededIn: 2,
    cleanSheets: 3, failedToScore: 3, recent3: { over15: 1, over25: 0, under35: 3, btts: 0 }
  });
  const result = analyzeMomentumStreak(fixture({ under25: 1.72, under35: 1.25, bttsNo: 1.60, bttsYes: 2.20 }), low);
  assert.ok(['UNDER_2_5','BTTS_NO'].includes(result.selection?.market));
});

test('waits until both venue samples contain five matches', () => {
  const result = analyzeMomentumStreak(fixture({ homeWin: 1.60 }), { homeSplit: split({ played: 4 }), awaySplit: split() });
  assert.equal(result.decision, 'WAITING');
  assert.equal(result.selection, null);
});

test('never publishes more than one official selection', () => {
  const result = analyzeMomentumStreak(fixture({
    homeWin: 1.55, draw: 4.10, awayWin: 6.80, doubleChance1X: 1.10,
    over15: 1.22, over25: 1.62, under25: 2.25, under35: 1.70,
    bttsYes: 1.60, bttsNo: 2.20
  }), stats({}, { form:['L','L','L','D','L'], wins:0, draws:1, losses:4, ppg:0.2, concededIn:5, scoredIn:4 }));
  assert.ok(result.selection === null || typeof result.selection.market === 'string');
});
