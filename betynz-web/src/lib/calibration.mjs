import { profitForSettlement } from '../engines/settlement.mjs';

const settledStatus = status => ['WON', 'LOST', 'VOID', 'PUSH'].includes(String(status || '').toUpperCase());
const pct = (a, b) => b ? Number((a / b * 100).toFixed(1)) : 0;
const round = value => Number((Number(value) || 0).toFixed(2));

function summarize(rows = []) {
  const settled = rows.filter(row => settledStatus(row.settlement_status));
  const decisions = settled.filter(row => ['WON', 'LOST'].includes(row.settlement_status));
  const wins = decisions.filter(row => row.settlement_status === 'WON').length;
  const losses = decisions.filter(row => row.settlement_status === 'LOST').length;
  const profit = settled.reduce((sum, row) => sum + (Number.isFinite(Number(row.profit_units)) ? Number(row.profit_units) : profitForSettlement(row.settlement_status, row.odds, 1)), 0);
  return {
    sample: settled.length,
    decisions: decisions.length,
    wins,
    losses,
    hitRate: pct(wins, wins + losses),
    profit: round(profit),
    roi: decisions.length ? round(profit / decisions.length * 100) : 0
  };
}

function group(rows, keyFn, describe) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  return [...buckets.entries()].map(([key, items]) => ({ key, ...describe(key, items), ...summarize(items) }));
}

function stage(sample) {
  if (sample < 20) return 'AUDIT';
  if (sample < 40) return 'PROVISIONAL';
  if (sample < 100) return 'CALIBRATED';
  return 'ESTABLISHED';
}

function recommendation(item) {
  if (item.sample < 20) return 'KEEP_AUDITING';
  if (item.hitRate >= 72 && item.roi > 0) return item.sample < 40 ? 'REVIEW_FOR_PROMOTION' : 'KEEP_ACTIVE';
  if (item.hitRate >= 66 && item.roi >= -2) return 'KEEP_WITH_GUARDRAILS';
  if (item.hitRate < 58 || item.roi <= -8) return 'SUSPEND_AND_REVIEW';
  return 'RECALIBRATE';
}

function routeName(row) {
  return row?.payload?.engine?.selection?.routeName
    || row?.payload?.engine?.closest?.name
    || row?.payload?.engine?.routeName
    || row.market
    || 'Unknown route';
}

function missedCount(row) {
  const selection = row?.payload?.engine?.selection || {};
  if (Number.isFinite(Number(selection.missedCount))) return Number(selection.missedCount);
  if (Array.isArray(selection.missedConditions)) return selection.missedConditions.length;
  const missed = selection.missedCondition;
  if (!missed) return String(row.decision || '').toUpperCase() === 'SAFER' ? 1 : 0;
  return String(missed).split(/\s*;\s*|\s*\|\s*/).filter(Boolean).length || 1;
}

function decorate(items) {
  return items.map(item => ({ ...item, stage: stage(item.sample), recommendation: recommendation(item) }));
}

export function buildAgreementPerformance(consensusRows = []) {
  return decorate(group(consensusRows, row => row.classification || 'UNKNOWN', key => ({ classification: key })))
    .sort((a, b) => b.sample - a.sample || b.hitRate - a.hitRate);
}

export function buildCalibrationReport(engineRows = [], consensusRows = []) {
  const settledEngines = engineRows.filter(row => settledStatus(row.settlement_status));
  const settledConsensus = consensusRows.filter(row => settledStatus(row.settlement_status));

  const byRoute = decorate(group(
    settledEngines,
    row => `${row.engine}|${routeName(row)}|${row.decision || 'UNKNOWN'}`,
    key => {
      const [engine, route, decision] = key.split('|');
      return { engine, route, decision };
    }
  )).sort((a, b) => b.sample - a.sample || b.roi - a.roi);

  const byDowngrade = decorate(group(
    settledEngines.filter(row => String(row.decision || '').toUpperCase() === 'SAFER'),
    row => `${row.engine}|${row.market}|${missedCount(row)}`,
    key => {
      const [engine, market, misses] = key.split('|');
      return { engine, market, missedConditions: Number(misses) };
    }
  )).sort((a, b) => b.sample - a.sample || b.hitRate - a.hitRate);

  const byAgreement = buildAgreementPerformance(settledConsensus);
  const allPatterns = [...byRoute, ...byDowngrade, ...byAgreement];
  const actionable = allPatterns
    .filter(item => item.sample >= 20 && item.recommendation !== 'KEEP_AUDITING')
    .sort((a, b) => {
      const priority = { SUSPEND_AND_REVIEW: 0, REVIEW_FOR_PROMOTION: 1, RECALIBRATE: 2, KEEP_WITH_GUARDRAILS: 3, KEEP_ACTIVE: 4 };
      return (priority[a.recommendation] ?? 9) - (priority[b.recommendation] ?? 9) || b.sample - a.sample;
    });

  const promotions = actionable.filter(item => ['REVIEW_FOR_PROMOTION', 'KEEP_ACTIVE'].includes(item.recommendation));
  const suspensions = actionable.filter(item => item.recommendation === 'SUSPEND_AND_REVIEW');
  const recalibration = actionable.filter(item => ['RECALIBRATE', 'KEEP_WITH_GUARDRAILS'].includes(item.recommendation));

  return {
    generatedAt: new Date().toISOString(),
    policy: {
      automaticSettlementAnalysis: true,
      automaticRuleChanges: false,
      minimumAuditSample: 20,
      promotionReviewSample: 40,
      note: 'The system measures settled performance automatically. Rule changes remain recommendations until an administrator approves them.'
    },
    summary: {
      engineSettled: settledEngines.length,
      consensusSettled: settledConsensus.length,
      routesMeasured: byRoute.length,
      downgradePatterns: byDowngrade.length,
      agreementPatterns: byAgreement.length,
      actionable: actionable.length
    },
    byRoute,
    byDowngrade,
    byAgreement,
    promotions: promotions.slice(0, 30),
    suspensions: suspensions.slice(0, 30),
    recalibration: recalibration.slice(0, 30),
    awaitingSample: allPatterns.filter(item => item.sample < 20).sort((a, b) => b.sample - a.sample).slice(0, 60)
  };
}
