import test from 'node:test';
import assert from 'node:assert/strict';
import { settleMarket } from '../src/engines/settlement.mjs';
const score = { status: 'FT', home: 2, away: 0, htHome: 1, htAway: 0 };
test('settles Market Route output markets', () => {
  assert.equal(settleMarket('HOME_WIN', score), 'WON');
  assert.equal(settleMarket('HOME_OVER_1_5', score), 'WON');
  assert.equal(settleMarket('OVER_1_5', score), 'WON');
  assert.equal(settleMarket('UNDER_2_5', score), 'WON');
  assert.equal(settleMarket('UNDER_3_5', score), 'WON');
  assert.equal(settleMarket('BTTS_YES', score), 'LOST');
});
