import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePpgRoute } from '../src/engines/ppgRoute.mjs';

const split = (ppg, played = 5) => ({ played, ppg, points: Math.round(ppg * played), form: ['W','D','L','W','D'] });
const fixture = (odds, homePpg, awayPpg, homePlayed = 5, awayPlayed = 5) => ({
  id: 'ppg-test', kickoff: '2099-01-01T12:00:00.000Z',
  home: { name: 'Home' }, away: { name: 'Away' }, odds,
  stats: { homeSplit: split(homePpg, homePlayed), awaySplit: split(awayPpg, awayPlayed) }
});

function analyze(odds, homePpg, awayPpg, homePlayed = 5, awayPlayed = 5) {
  const match = fixture(odds, homePpg, awayPpg, homePlayed, awayPlayed);
  return analyzePpgRoute(match, match.stats);
}

test('two teams below 1 PPG fire Under 2.5 when draw is 3.00 or lower', () => {
  const result = analyze({ draw: 2.95, under25: 1.62 }, 0.8, 0.6);
  assert.equal(result.decision, 'FIRE');
  assert.equal(result.selection.market, 'UNDER_2_5');
});

test('two teams above 1.5 PPG fire BTTS Yes when draw is 3.70 or higher', () => {
  const result = analyze({ draw: 3.85, bttsYes: 1.72 }, 1.8, 2.0);
  assert.equal(result.decision, 'FIRE');
  assert.equal(result.selection.market, 'BTTS_YES');
});

test('extreme home PPG advantage fires Home Win when draw is above 3.10', () => {
  const result = analyze({ draw: 3.30, homeWin: 1.55, doubleChance1X: 1.18 }, 2.6, 0.8);
  assert.equal(result.decision, 'FIRE');
  assert.equal(result.selection.market, 'HOME_WIN');
});

test('extreme away PPG advantage uses X2 when draw is 3.10 or lower', () => {
  const result = analyze({ draw: 3.00, awayWin: 1.62, doubleChanceX2: 1.20 }, 0.6, 2.6);
  assert.equal(result.decision, 'SAFER');
  assert.equal(result.selection.market, 'DOUBLE_CHANCE_X2');
});

test('weak away team loses when home is strong and draw is above 3.50', () => {
  const result = analyze({ draw: 3.60, homeWin: 1.80, doubleChance1X: 1.22 }, 1.8, 0.8);
  assert.equal(result.decision, 'FIRE');
  assert.equal(result.selection.market, 'HOME_WIN');
});

test('weak away team uses 1X when draw is 3.10 or lower', () => {
  const result = analyze({ draw: 3.05, homeWin: 1.95, doubleChance1X: 1.28 }, 1.8, 0.8);
  assert.equal(result.decision, 'SAFER');
  assert.equal(result.selection.market, 'DOUBLE_CHANCE_1X');
});

test('weak away route avoids the 3.11 to 3.50 draw zone', () => {
  const result = analyze({ draw: 3.30, homeWin: 1.85, doubleChance1X: 1.25 }, 1.8, 0.8);
  assert.equal(result.decision, 'NO_SIGNAL');
  assert.equal(result.selection, null);
});

test('matches outside every PPG route return no signal', () => {
  const result = analyze({ draw: 3.40, homeWin: 2.30, awayWin: 3.10 }, 1.3, 1.2);
  assert.equal(result.decision, 'NO_SIGNAL');
});

test('five home and five away venue games are mandatory', () => {
  const result = analyze({ draw: 3.80, bttsYes: 1.70 }, 1.8, 1.8, 4, 5);
  assert.equal(result.decision, 'WAITING');
  assert.match(result.explanation, /Home sample: 4\/5/);
});

test('required output market must exist', () => {
  const result = analyze({ draw: 2.90 }, 0.8, 0.7);
  assert.equal(result.selection, null);
});
