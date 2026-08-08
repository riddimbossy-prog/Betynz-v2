import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgreementPerformance, buildCalibrationReport } from '../src/lib/calibration.mjs';

function rows(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    engine: 'MARKET_ROUTE', market: 'OVER_1_5', decision: 'FIRE', odds: 1.4,
    settlement_status: index < Math.round(count * .75) ? 'WON' : 'LOST',
    payload: { engine: { selection: { routeName: 'Over 1.5 convergence', missedCount: 0 } } },
    ...overrides
  }));
}

test('calibration promotes a sufficiently large profitable engine pattern', () => {
  const report = buildCalibrationReport(rows(40), []);
  assert.equal(report.byRoute[0].sample, 40);
  assert.equal(report.byRoute[0].stage, 'CALIBRATED');
  assert.ok(['KEEP_ACTIVE','REVIEW_FOR_PROMOTION'].includes(report.byRoute[0].recommendation));
  assert.equal(report.policy.automaticRuleChanges, false);
});

test('poor settled patterns are marked suspend and review', () => {
  const poor = rows(25).map((row, index) => ({ ...row, settlement_status: index < 8 ? 'WON' : 'LOST' }));
  const report = buildCalibrationReport(poor, []);
  assert.equal(report.suspensions[0].recommendation, 'SUSPEND_AND_REVIEW');
});

test('safer picks are grouped by missed-condition count', () => {
  const safer = rows(22, { decision: 'SAFER', payload: { engine: { selection: { routeName: 'Under downgrade', missedCount: 2 } } } });
  const report = buildCalibrationReport(safer, []);
  assert.equal(report.byDowngrade[0].missedConditions, 2);
  assert.equal(report.byDowngrade[0].sample, 22);
});

test('agreement performance separates Elite and Consensus classifications', () => {
  const consensus = [
    ...rows(20, { classification: 'ELITE_BANKER' }),
    ...rows(20, { classification: 'CONSENSUS_BANKER', settlement_status: 'LOST' })
  ];
  const groups = buildAgreementPerformance(consensus);
  assert.equal(groups.length, 2);
  assert.ok(groups.some(row => row.classification === 'ELITE_BANKER'));
  assert.ok(groups.some(row => row.classification === 'CONSENSUS_BANKER'));
});
