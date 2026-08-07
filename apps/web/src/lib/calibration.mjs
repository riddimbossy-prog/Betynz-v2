import { profitForSettlement } from '../engines/settlement.mjs';

const settledStatus = status => ['WON', 'LOST', 'VOID', 'PUSH'].includes(String(status || '').toUpperCase());
const pct = (a, b) => b ? Number((a / b * 100).toFixed(1)) : 0;
const round = value => Number((Number(value) || 0).toFixed(2));

const clampProbability = value => Math.max(0.01, Math.min(0.99, Number(value)));

function scoreProbability(row) {
  const raw = Number(row?.engine_score ?? row?.consensus_score ?? row?.payload?.engine?.selection?.score ?? row?.payload?.consensus?.score);
  if (!Number.isFinite(raw)) return null;
  return clampProbability(raw > 1 ? raw / 100 : raw);
}

function marketProbability(row) {
  const odds = Number(row?.odds);
  return Number.isFinite(odds) && odds > 1 ? clampProbability(1 / odds) : null;
}

function closingOdds(row) {
  const candidates = [
    row?.closing_odds,
    row?.payload?.closingOdds,
    row?.payload?.closing_odds,
    row?.payload?.oddsMovement?.closing,
    row?.payload?.closingLine?.odds
  ];
  return candidates.map(Number).find(value => Number.isFinite(value) && value > 1) ?? null;
}

function wilsonInterval(wins, total, z = 1.96) {
  if (!total) return null;
  const p = wins / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total) / denominator;
  return { low: round(Math.max(0, center - margin) * 100), high: round(Math.min(1, center + margin) * 100), level: 95 };
}

function probabilisticMetrics(rows = []) {
  const decisions = rows.filter(row => ['WON', 'LOST'].includes(String(row?.settlement_status || '').toUpperCase()));
  const usable = decisions.map(row => ({
    y: String(row.settlement_status).toUpperCase() === 'WON' ? 1 : 0,
    model: scoreProbability(row),
    market: marketProbability(row),
    odds: Number(row.odds),
    closing: closingOdds(row)
  }));
  const modelRows = usable.filter(row => Number.isFinite(row.model));
  const marketRows = usable.filter(row => Number.isFinite(row.market));
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const brier = (items, key) => items.length ? average(items.map(row => (row[key] - row.y) ** 2)) : null;
  const logLoss = (items, key) => items.length ? -average(items.map(row => row.y * Math.log(row[key]) + (1 - row.y) * Math.log(1 - row[key]))) : null;
  const modelBrier = brier(modelRows, 'model');
  const marketBrier = brier(marketRows, 'market');
  const clvRows = usable.filter(row => Number.isFinite(row.odds) && row.odds > 1 && Number.isFinite(row.closing) && row.closing > 1);
  const averageClv = clvRows.length ? average(clvRows.map(row => (row.odds / row.closing - 1) * 100)) : null;
  const wins = decisions.filter(row => String(row.settlement_status).toUpperCase() === 'WON').length;
  return {
    probabilitySample: modelRows.length,
    scoreDerivedProbability: true,
    meanForecastProbability: modelRows.length ? round(average(modelRows.map(row => row.model)) * 100) : null,
    observedWinRate: decisions.length ? round(wins / decisions.length * 100) : null,
    calibrationGap: modelRows.length ? round((average(modelRows.map(row => row.model)) - average(modelRows.map(row => row.y))) * 100) : null,
    brierScore: modelBrier === null ? null : round(modelBrier, 4),
    logLoss: modelRows.length ? round(logLoss(modelRows, 'model'), 4) : null,
    marketImpliedSample: marketRows.length,
    meanMarketImpliedProbability: marketRows.length ? round(average(marketRows.map(row => row.market)) * 100) : null,
    marketBrierScore: marketBrier === null ? null : round(marketBrier, 4),
    marketLogLoss: marketRows.length ? round(logLoss(marketRows, 'market'), 4) : null,
    brierEdgeVsMarket: modelBrier !== null && marketBrier !== null ? round(marketBrier - modelBrier, 4) : null,
    closingLineSample: clvRows.length,
    averageClosingLineValue: averageClv === null ? null : round(averageClv, 2),
    observedWinRate95CI: wilsonInterval(wins, decisions.length)
  };
}

function pearsonBinary(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom ? num / denom : null;
}

export function buildEngineErrorCorrelation(rows = []) {
  const settled = rows.filter(row => ['WON', 'LOST'].includes(String(row?.settlement_status || '').toUpperCase()) && row?.engine && row?.fixture_id);
  const fixtureMap = new Map();
  for (const row of settled) {
    const key = `${row.fixture_id}|${row.fixture_date || ''}`;
    if (!fixtureMap.has(key)) fixtureMap.set(key, new Map());
    // error=1 means the engine lost. Correlating errors is more relevant than
    // correlating raw picks because two engines can agree for different reasons.
    fixtureMap.get(key).set(String(row.engine), String(row.settlement_status).toUpperCase() === 'LOST' ? 1 : 0);
  }
  const engines = [...new Set(settled.map(row => String(row.engine)))].sort();
  const pairs = [];
  for (let i = 0; i < engines.length; i += 1) {
    for (let j = i + 1; j < engines.length; j += 1) {
      const a = engines[i], b = engines[j], xs = [], ys = [];
      for (const map of fixtureMap.values()) {
        if (!map.has(a) || !map.has(b)) continue;
        xs.push(map.get(a)); ys.push(map.get(b));
      }
      const correlation = pearsonBinary(xs, ys);
      pairs.push({ engineA: a, engineB: b, sample: xs.length, errorCorrelation: correlation === null ? null : round(correlation, 3), stage: xs.length < 20 ? 'INSUFFICIENT' : xs.length < 100 ? 'PROVISIONAL' : 'ESTABLISHED' });
    }
  }
  return pairs.sort((a, b) => (b.sample - a.sample) || ((b.errorCorrelation ?? -2) - (a.errorCorrelation ?? -2)));
}

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
    roi: decisions.length ? round(profit / decisions.length * 100) : 0,
    ...probabilisticMetrics(settled)
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
  if (Number.isFinite(item.brierEdgeVsMarket) && item.brierEdgeVsMarket <= -0.025) return 'SUSPEND_AND_REVIEW';
  if (item.hitRate >= 72 && item.roi > 0 && (!Number.isFinite(item.brierEdgeVsMarket) || item.brierEdgeVsMarket >= -0.005)) return item.sample < 40 ? 'REVIEW_FOR_PROMOTION' : 'KEEP_ACTIVE';
  if (item.hitRate >= 66 && item.roi >= -2 && (!Number.isFinite(item.brierEdgeVsMarket) || item.brierEdgeVsMarket >= -0.015)) return 'KEEP_WITH_GUARDRAILS';
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
  const engineErrorCorrelation = buildEngineErrorCorrelation(settledEngines);
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
      note: 'The system measures settled performance automatically against outcomes and market-implied baselines. Rule changes remain recommendations until an administrator approves them.'
    },
    summary: {
      engineSettled: settledEngines.length,
      consensusSettled: settledConsensus.length,
      routesMeasured: byRoute.length,
      downgradePatterns: byDowngrade.length,
      agreementPatterns: byAgreement.length,
      correlationPairs: engineErrorCorrelation.length,
      actionable: actionable.length
    },
    byRoute,
    byDowngrade,
    byAgreement,
    engineErrorCorrelation,
    probabilityPolicy: {
      scoreDerivedProbability: true,
      note: 'Engine scores are evaluated as provisional probability surrogates. They are not presented as calibrated probabilities until forward-settled calibration demonstrates alignment.',
      metrics: ['Brier score','log loss','calibration gap','market-implied baseline','closing-line value','95% Wilson interval']
    },
    promotions: promotions.slice(0, 30),
    suspensions: suspensions.slice(0, 30),
    recalibration: recalibration.slice(0, 30),
    awaitingSample: allPatterns.filter(item => item.sample < 20).sort((a, b) => b.sample - a.sample).slice(0, 60)
  };
}
