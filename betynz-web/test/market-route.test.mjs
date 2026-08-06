import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMarketRoute } from '../src/engines/marketRoute.mjs';

const fixture = odds => ({
  id: 'test-1', kickoff: '2099-01-01T12:00:00.000Z',
  league: { country: 'Test', name: 'League' },
  home: { name: 'Home' }, away: { name: 'Away' }, odds
});

test('fires favourite win route', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 1.40, draw: 4.00, awayWin: 7.00, under35: 1.55,
    homeOver15: 1.40, awayOver05: 1.80, bttsNo: 1.50,
    homeOver05: 1.10, awayOver15: 3.20, doubleChance1X: 1.10,
    under25: 2.10, over15: 1.25, over25: 1.85, bttsYes: 2.30
  }));
  assert.equal(result.decision, 'FIRE');
  assert.equal(result.selection.market, 'HOME_WIN');
});

test('very short favourite fires favourite team over 1.5', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 1.15, draw: 4.20, awayWin: 12.00, under35: 1.55,
    homeOver15: 1.40, awayOver05: 1.80, bttsNo: 1.50,
    homeOver05: 1.05, doubleChance1X: 1.02, under25: 2.20,
    over15: 1.20, over25: 1.70, bttsYes: 2.40
  }));
  assert.equal(result.decision, 'FIRE');
  assert.equal(result.selection.market, 'HOME_OVER_1_5');
});

test('balanced route fires BTTS Yes', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 2.50, draw: 3.80, awayWin: 2.60, under35: 1.55,
    homeOver05: 1.25, awayOver05: 1.28, bttsNo: 2.60, bttsYes: 1.50,
    over15: 1.25, under25: 2.20, over25: 1.70
  }));
  assert.equal(result.decision, 'FIRE');
  assert.equal(result.selection.market, 'BTTS_YES');
});

test('unbalanced route fires Over 2.5', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 1.45, draw: 4.00, awayWin: 7.00, under35: 1.65,
    homeOver15: 1.40, awayOver05: 1.25, over25: 1.70, over15: 1.20,
    bttsNo: 2.20, homeOver05: 1.10, under25: 2.30
  }));
  assert.equal(result.decision, 'FIRE');
  assert.equal(result.selection.market, 'OVER_2_5');
});

test('one missed Over 2.5 condition downgrades to Over 1.5', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 1.45, draw: 3.50, awayWin: 7.00, under35: 1.65,
    homeOver15: 1.40, awayOver05: 1.25, over25: 1.70, over15: 1.22,
    bttsNo: 2.20, homeOver05: 1.10, under25: 2.30
  }));
  assert.equal(result.decision, 'SAFER');
  assert.equal(result.selection.market, 'OVER_1_5');
  assert.equal(result.selection.missed, 1);
});

test('fires Under 2.5 when all five locked thresholds pass', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 2.80, draw: 2.90, awayWin: 2.90, under25: 1.50,
    over15: 1.50, bttsNo: 1.45, homeOver05: 1.60, awayOver05: 1.70,
    under35: 1.20, bttsYes: 2.50, over25: 2.50
  }));
  assert.equal(result.decision, 'FIRE');
  assert.equal(result.selection.market, 'UNDER_2_5');
});

test('one missed Under 2.5 condition downgrades to Under 3.5', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 2.80, draw: 3.10, awayWin: 2.90, under25: 1.50,
    over15: 1.50, bttsNo: 1.45, homeOver05: 1.60, awayOver05: 1.70,
    under35: 1.25, bttsYes: 2.50, over25: 2.50
  }));
  assert.equal(result.decision, 'SAFER');
  assert.equal(result.selection.market, 'UNDER_3_5');
});

test('two missed Under 2.5 conditions still downgrade to Under 3.5', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 2.80, draw: 3.10, awayWin: 2.90, under25: 1.50,
    over15: 1.50, bttsNo: 1.60, homeOver05: 1.60, awayOver05: 1.70,
    under35: 1.25, bttsYes: 2.20, over25: 2.30
  }));
  assert.equal(result.selection?.market, 'UNDER_3_5');
  assert.equal(result.decision, 'SAFER');
  assert.equal(result.selection?.missed, 2);
});


test('three missed Under 2.5 conditions reject the route', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 2.80, draw: 3.20, awayWin: 2.90, under25: 1.60,
    over15: 1.40, bttsNo: 1.60, homeOver05: 1.60, awayOver05: 1.70,
    under35: 1.25, bttsYes: 2.20, over25: 2.30
  }));
  assert.notEqual(result.selection?.routeId, 'UNDER_2_5');
});

test('average team Over 0.5 is calculated exactly from both prices', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 2.80, draw: 2.90, awayWin: 2.90, under25: 1.50,
    over15: 1.50, bttsNo: 1.45, homeOver05: 1.50, awayOver05: 1.70,
    under35: 1.20
  }));
  const route = result.candidates.find(item => item.id === 'UNDER_2_5');
  const average = route.checks.find(item => item.id === 'teamavg');
  assert.equal(average.actual, '1.60');
  assert.equal(average.pass, true);
});

test('balanced 1X2 is determined from margin-normalized prices', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 2.50, draw: 3.80, awayWin: 2.60, under35: 1.55,
    homeOver05: 1.25, awayOver05: 1.28, bttsNo: 2.60, bttsYes: 1.50,
    over15: 1.25
  }));
  assert.equal(result.structure.balance, 'BALANCED');
  assert.ok(result.structure.overround > 0);
  assert.ok(Math.abs(result.structure.fair.home + result.structure.fair.draw + result.structure.fair.away - 100) < 0.05);
});

test('safer Under 3.5 is not published when its market is missing', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 2.80, draw: 3.10, awayWin: 2.90, under25: 1.50,
    over15: 1.50, bttsNo: 1.45, homeOver05: 1.60, awayOver05: 1.70
  }));
  assert.equal(result.selection, null);
  assert.equal(result.decision, 'NO_SIGNAL');
});

test('a complete route cannot publish when the selected market price is absent', () => {
  const result = analyzeMarketRoute(fixture({
    homeWin: 1.45, draw: 4.00, awayWin: 7.00, under35: 1.65,
    homeOver15: 1.40, awayOver05: 1.25, over15: 1.20,
    bttsNo: 2.20, homeOver05: 1.10, under25: 2.30
  }));
  assert.notEqual(result.selection?.market, 'OVER_2_5');
});
