const ENGINE_WEIGHTS = Object.freeze({
  MARKET_ROUTE: 1.00,
  PPG_ROUTE: 0.72,
  APEX_INTELLIGENCE: 0.68,
  CONVERGENCE_ROUTE: 0.68,
  MOMENTUM_STREAK: 0.72,
  STREAK_VALUE: 0.95,
  HTFT_MOMENTUM: 0.90
});

const ENGINE_FAMILIES = Object.freeze({
  MARKET_ROUTE: 'MARKET_STRUCTURE',
  PPG_ROUTE: 'VENUE_STRENGTH',
  APEX_INTELLIGENCE: 'COMPOSITE_QUALITY',
  CONVERGENCE_ROUTE: 'ATTACK_DEFENCE_FIT',
  MOMENTUM_STREAK: 'SEQUENTIAL_FORM',
  STREAK_VALUE: 'EXTERNAL_STATS_STREAKS',
  HTFT_MOMENTUM: 'MATCH_STATE_TRANSITIONS'
});

// Conservative prior overlap estimates. They are intentionally not presented as
// measured correlations; the calibration report separately computes empirical
// pairwise outcome correlation once enough forward-settled rows exist.
const PRIOR_OVERLAP = Object.freeze({
  'APEX_INTELLIGENCE|CONVERGENCE_ROUTE': 0.42,
  'APEX_INTELLIGENCE|MOMENTUM_STREAK': 0.38,
  'APEX_INTELLIGENCE|PPG_ROUTE': 0.46,
  'CONVERGENCE_ROUTE|MOMENTUM_STREAK': 0.34,
  'CONVERGENCE_ROUTE|PPG_ROUTE': 0.40,
  'MOMENTUM_STREAK|PPG_ROUTE': 0.44,
  'HTFT_MOMENTUM|MOMENTUM_STREAK': 0.22,
  'STREAK_VALUE|MOMENTUM_STREAK': 0.18,
  'APEX_INTELLIGENCE|STREAK_VALUE': 0.14,
  'CONVERGENCE_ROUTE|STREAK_VALUE': 0.12,
  'MARKET_ROUTE|PPG_ROUTE': 0.08,
  'MARKET_ROUTE|APEX_INTELLIGENCE': 0.08,
  'MARKET_ROUTE|CONVERGENCE_ROUTE': 0.08,
  'MARKET_ROUTE|MOMENTUM_STREAK': 0.08,
  'MARKET_ROUTE|STREAK_VALUE': 0.05,
  'MARKET_ROUTE|HTFT_MOMENTUM': 0.05
});

const round = (value, places = 2) => Number(Number(value || 0).toFixed(places));
const code = value => String(value || '').toUpperCase();
const pairKey = (a, b) => [code(a), code(b)].sort().join('|');

export function engineEvidenceFamily(engine) {
  return ENGINE_FAMILIES[code(engine)] || 'OTHER';
}

export function priorOverlap(a, b) {
  if (code(a) === code(b)) return 1;
  return Number(PRIOR_OVERLAP[pairKey(a, b)] || 0.1);
}

export function effectiveEvidence(picks = []) {
  const unique = [...new Map((picks || []).filter(Boolean).map(item => [code(item.engine), item])).values()];
  if (!unique.length) return { rawCount: 0, effectiveCount: 0, independenceRatio: 0, families: [], overlaps: [] };

  const weights = unique.map(item => Number(ENGINE_WEIGHTS[code(item.engine)] || 0.65));
  let base = weights.reduce((sum, value) => sum + value, 0);
  const overlaps = [];
  let penalty = 0;
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      const overlap = priorOverlap(unique[i].engine, unique[j].engine);
      const pairPenalty = overlap * Math.min(weights[i], weights[j]) * 0.12;
      penalty += pairPenalty;
      overlaps.push({ a: code(unique[i].engine), b: code(unique[j].engine), priorOverlap: round(overlap, 2), penalty: round(pairPenalty, 3) });
    }
  }
  // Avoid double-counting the same venue/form data while keeping genuine
  // cross-family support meaningful.
  const effectiveCount = Math.max(1, Math.min(unique.length, base - penalty));
  const families = [...new Set(unique.map(item => engineEvidenceFamily(item.engine)))];
  return {
    rawCount: unique.length,
    effectiveCount: round(effectiveCount, 2),
    independenceRatio: round(effectiveCount / unique.length, 3),
    familyCount: families.length,
    families,
    overlaps: overlaps.sort((a, b) => b.penalty - a.penalty).slice(0, 12)
  };
}

export function correlationAdjustedConfidence(picks = [], averageScore = 0) {
  const evidence = effectiveEvidence(picks);
  const score = Math.max(0, Math.min(100, Number(averageScore) || 0));
  if (!evidence.rawCount) return { confidence: 0, ...evidence };
  // Discount only the portion of confidence that is vulnerable to correlated
  // evidence. This is a ranking confidence, not a calibrated probability.
  const multiplier = 0.72 + 0.28 * evidence.independenceRatio;
  return { confidence: round(score * multiplier, 1), ...evidence };
}

export const EVIDENCE_INDEPENDENCE_POLICY = Object.freeze({
  engineWeights: ENGINE_WEIGHTS,
  engineFamilies: ENGINE_FAMILIES,
  note: 'Consensus reports both raw engine agreement and correlation-adjusted effective evidence. Prior overlap is conservative until empirical settled-error correlation has enough samples.'
});
