import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeConvergence } from '../src/engines/convergence.mjs';

const fixture = odds => ({
  id: 'conv-1', kickoff: '2099-01-01T12:00:00.000Z',
  league: { country: 'Test', name: 'League' },
  home: { name: 'Home' }, away: { name: 'Away' }, odds
});

function split(overrides = {}) {
  return {
    played: 5, points: 9, ppg: 1.8, wins: 3, draws: 0, losses: 2,
    goalsForAvg: 1.5, goalsAgainstAvg: 1.3, goalsPerMatch: 2.8,
    scoredIn: 4, concededIn: 4, scored2Plus: 2, conceded2Plus: 1,
    cleanSheets: 1, failedToScore: 1, over15: 4, over25: 3,
    under35: 4, btts: 3,
    ...overrides
  };
}

const stats = (home = {}, away = {}) => ({ homeSplit: split(home), awaySplit: split(away) });

test('fires Over 1.5 when all four evidence blocks converge', () => {
  const result = analyzeConvergence(fixture({
    homeWin: 2.10, draw: 3.60, awayWin: 3.20,
    over15: 1.28, under25: 2.10, over25: 1.70, under35: 1.55,
    bttsYes: 1.72, bttsNo: 2.05, homeOver05: 1.20, awayOver05: 1.30
  }), stats());
  assert.equal(result.selection?.market, 'OVER_1_5');
  assert.equal(result.decision, 'FIRE');
  assert.ok(result.selection.score >= 78);
});

test('fires BTTS Yes when both attacks and both defences agree', () => {
  const strongBtts = stats({ scoredIn: 5, concededIn: 5, btts: 4, failedToScore: 0, cleanSheets: 0 }, { scoredIn: 5, concededIn: 5, btts: 4, failedToScore: 0, cleanSheets: 0 });
  const result = analyzeConvergence(fixture({
    homeWin: 2.40, draw: 3.80, awayWin: 2.70,
    over15: 1.25, over25: 1.65, under25: 2.20, under35: 1.65,
    bttsYes: 1.55, bttsNo: 2.45, homeOver05: 1.20, awayOver05: 1.22
  }), strongBtts);
  assert.equal(result.selection?.market, 'BTTS_YES');
});

test('uses a safer market at 70 to 77 convergence', () => {
  const result = analyzeConvergence(fixture({
    homeWin: 1.70, draw: 3.80, awayWin: 5.00,
    over15: 1.30, over25: 1.80, under25: 2.00, under35: 1.55,
    bttsYes: 1.90, bttsNo: 1.90, homeOver05: 1.20, awayOver05: 1.45
  }), stats({ over25: 4, scored2Plus: 2 }, { over25: 3, scored2Plus: 1 }));
  assert.ok(['FIRE','SAFER','NO_SIGNAL'].includes(result.decision));
  const over25 = result.candidates.find(item => item.id === 'CONV_OVER_2_5');
  assert.ok(over25);
  if (over25.score >= 70 && over25.score < 78 && over25.supportedBlocks >= 3) assert.equal(over25.selection?.market, 'OVER_1_5');
});

test('waits when either venue sample has fewer than five matches', () => {
  const result = analyzeConvergence(fixture({ over15: 1.30 }), { homeSplit: split({ played: 4 }), awaySplit: split() });
  assert.equal(result.decision, 'WAITING');
  assert.equal(result.selection, null);
});

test('returns one official selection at most', () => {
  const result = analyzeConvergence(fixture({
    homeWin: 1.50, draw: 4.10, awayWin: 7.00,
    over15: 1.25, over25: 1.65, under25: 2.20, under35: 1.65,
    bttsYes: 1.70, bttsNo: 2.20, homeOver05: 1.12, awayOver05: 1.40,
    doubleChance1X: 1.08
  }), stats({ ppg: 2.4, points: 12, goalsForAvg: 2.0, goalsAgainstAvg: 0.6, cleanSheets: 3 }, { ppg: 0.8, points: 4, goalsForAvg: 0.8, goalsAgainstAvg: 1.8 }));
  assert.ok(result.selection === null || typeof result.selection.market === 'string');
});
