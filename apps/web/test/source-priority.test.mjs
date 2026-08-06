import test from 'node:test';
import assert from 'node:assert/strict';
import { combinePrimaryAndSecondaryStats, mergeMissingPrimaryFirst } from '../src/lib/sourcePriority.mjs';

test('SportyBet primary values cannot be overwritten by API-Football enrichment', () => {
  const primary = {
    homeSplit: { played: 5, ppg: 2.2, goalsForAvg: null, rates: { over25: 80 } },
    awaySplit: { played: 5, ppg: 0.8, rates: { over25: 40 } }
  };
  const secondary = {
    homeSplit: { played: 10, ppg: 0.4, goalsForAvg: 1.9, rates: { over25: 10, btts: 60 } },
    awaySplit: { played: 10, ppg: 2.5, rates: { over25: 90, btts: 55 } },
    standings: { home: 1, away: 8 }
  };
  const combined = combinePrimaryAndSecondaryStats(primary, secondary);
  assert.equal(combined.source, 'SPORTYBET_CUSTOM_API');
  assert.equal(combined.homeSplit.ppg, 2.2);
  assert.equal(combined.homeSplit.played, 5);
  assert.equal(combined.homeSplit.rates.over25, 80);
  assert.equal(combined.awaySplit.ppg, 0.8);
  assert.equal(combined.homeSplit.goalsForAvg, 1.9);
  assert.equal(combined.homeSplit.rates.btts, 60);
  assert.deepEqual(combined.standings, { home: 1, away: 8 });
});

test('API-Football is explicitly labelled fallback only when SportyBet statistics are missing', () => {
  const fallback = combinePrimaryAndSecondaryStats(null, { homeSplit: { played: 5, ppg: 1.5 }, awaySplit: { played: 5, ppg: 1.2 } });
  assert.equal(fallback.source, 'API_FOOTBALL_FALLBACK');
  assert.equal(fallback.primaryAvailable, false);
  assert.equal(fallback.enrichmentAvailable, true);
  assert.deepEqual(fallback.sourcePriority, ['SPORTYBET_CUSTOM_API', 'API_FOOTBALL']);
});

test('empty secondary arrays fill only empty primary arrays', () => {
  assert.deepEqual(mergeMissingPrimaryFirst([], [1, 2]), [1, 2]);
  assert.deepEqual(mergeMissingPrimaryFirst([3], [1, 2]), [3]);
});
