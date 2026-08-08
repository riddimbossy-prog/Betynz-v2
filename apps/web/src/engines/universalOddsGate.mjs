const MIN_ODDS = 1.20;
const MAX_ODDS = 2.00;

const n = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
};

const MARKET_SPECS = {
  HOME_WIN: ['homeWin', 'Home Team to Win'],
  AWAY_WIN: ['awayWin', 'Away Team to Win'],
  DRAW: ['draw', 'Draw'],
  DOUBLE_CHANCE_1X: ['doubleChance1X', 'Home or Draw (1X)'],
  DOUBLE_CHANCE_X2: ['doubleChanceX2', 'Draw or Away (X2)'],
  DOUBLE_CHANCE_12: ['doubleChance12', 'Home or Away (12)'],
  BTTS_YES: ['bttsYes', 'Both Teams to Score — Yes'],
  BTTS_NO: ['bttsNo', 'Both Teams to Score — No'],
  OVER_0_5: ['over05', 'Over 0.5 Goals'],
  OVER_1_5: ['over15', 'Over 1.5 Goals'],
  OVER_2_5: ['over25', 'Over 2.5 Goals'],
  OVER_3_5: ['over35', 'Over 3.5 Goals'],
  UNDER_0_5: ['under05', 'Under 0.5 Goals'],
  UNDER_1_5: ['under15', 'Under 1.5 Goals'],
  UNDER_2_5: ['under25', 'Under 2.5 Goals'],
  UNDER_3_5: ['under35', 'Under 3.5 Goals'],
  HOME_OVER_0_5: ['homeOver05', 'Home Team Over 0.5 Goals'],
  HOME_OVER_1_5: ['homeOver15', 'Home Team Over 1.5 Goals'],
  HOME_OVER_2_5: ['homeOver25', 'Home Team Over 2.5 Goals'],
  HOME_OVER_3_5: ['homeOver35', 'Home Team Over 3.5 Goals'],
  HOME_UNDER_0_5: ['homeUnder05', 'Home Team Under 0.5 Goals'],
  HOME_UNDER_1_5: ['homeUnder15', 'Home Team Under 1.5 Goals'],
  HOME_UNDER_2_5: ['homeUnder25', 'Home Team Under 2.5 Goals'],
  HOME_UNDER_3_5: ['homeUnder35', 'Home Team Under 3.5 Goals'],
  AWAY_OVER_0_5: ['awayOver05', 'Away Team Over 0.5 Goals'],
  AWAY_OVER_1_5: ['awayOver15', 'Away Team Over 1.5 Goals'],
  AWAY_OVER_2_5: ['awayOver25', 'Away Team Over 2.5 Goals'],
  AWAY_OVER_3_5: ['awayOver35', 'Away Team Over 3.5 Goals'],
  AWAY_UNDER_0_5: ['awayUnder05', 'Away Team Under 0.5 Goals'],
  AWAY_UNDER_1_5: ['awayUnder15', 'Away Team Under 1.5 Goals'],
  AWAY_UNDER_2_5: ['awayUnder25', 'Away Team Under 2.5 Goals'],
  AWAY_UNDER_3_5: ['awayUnder35', 'Away Team Under 3.5 Goals'],
  FIRST_HALF_OVER_0_5: ['firstHalfOver05', 'First Half Over 0.5 Goals'],
  FIRST_HALF_OVER_1_5: ['firstHalfOver15', 'First Half Over 1.5 Goals'],
  FIRST_HALF_OVER_2_5: ['firstHalfOver25', 'First Half Over 2.5 Goals'],
  FIRST_HALF_OVER_3_5: ['firstHalfOver35', 'First Half Over 3.5 Goals'],
  FIRST_HALF_UNDER_0_5: ['firstHalfUnder05', 'First Half Under 0.5 Goals'],
  FIRST_HALF_UNDER_1_5: ['firstHalfUnder15', 'First Half Under 1.5 Goals'],
  FIRST_HALF_UNDER_2_5: ['firstHalfUnder25', 'First Half Under 2.5 Goals'],
  FIRST_HALF_UNDER_3_5: ['firstHalfUnder35', 'First Half Under 3.5 Goals'],
  HTFT_HOME_HOME: ['htftHomeHome', 'Half Time / Full Time — Home / Home'],
  HTFT_DRAW_HOME: ['htftDrawHome', 'Half Time / Full Time — Draw / Home'],
  HTFT_AWAY_HOME: ['htftAwayHome', 'Half Time / Full Time — Away / Home'],
  HTFT_HOME_DRAW: ['htftHomeDraw', 'Half Time / Full Time — Home / Draw'],
  HTFT_DRAW_DRAW: ['htftDrawDraw', 'Half Time / Full Time — Draw / Draw'],
  HTFT_AWAY_DRAW: ['htftAwayDraw', 'Half Time / Full Time — Away / Draw'],
  HTFT_HOME_AWAY: ['htftHomeAway', 'Half Time / Full Time — Home / Away'],
  HTFT_DRAW_AWAY: ['htftDrawAway', 'Half Time / Full Time — Draw / Away'],
  HTFT_AWAY_AWAY: ['htftAwayAway', 'Half Time / Full Time — Away / Away']
};

const UPGRADE = {
  DOUBLE_CHANCE_1X: ['HOME_WIN'],
  DOUBLE_CHANCE_X2: ['AWAY_WIN'],
  OVER_0_5: ['OVER_1_5', 'OVER_2_5', 'OVER_3_5'],
  OVER_1_5: ['OVER_2_5', 'OVER_3_5'],
  OVER_2_5: ['OVER_3_5'],
  UNDER_3_5: ['UNDER_2_5', 'UNDER_1_5', 'UNDER_0_5'],
  UNDER_2_5: ['UNDER_1_5', 'UNDER_0_5'],
  UNDER_1_5: ['UNDER_0_5'],
  HOME_OVER_0_5: ['HOME_OVER_1_5', 'HOME_OVER_2_5', 'HOME_OVER_3_5'],
  HOME_OVER_1_5: ['HOME_OVER_2_5', 'HOME_OVER_3_5'],
  HOME_OVER_2_5: ['HOME_OVER_3_5'],
  HOME_UNDER_3_5: ['HOME_UNDER_2_5', 'HOME_UNDER_1_5', 'HOME_UNDER_0_5'],
  HOME_UNDER_2_5: ['HOME_UNDER_1_5', 'HOME_UNDER_0_5'],
  HOME_UNDER_1_5: ['HOME_UNDER_0_5'],
  AWAY_OVER_0_5: ['AWAY_OVER_1_5', 'AWAY_OVER_2_5', 'AWAY_OVER_3_5'],
  AWAY_OVER_1_5: ['AWAY_OVER_2_5', 'AWAY_OVER_3_5'],
  AWAY_OVER_2_5: ['AWAY_OVER_3_5'],
  AWAY_UNDER_3_5: ['AWAY_UNDER_2_5', 'AWAY_UNDER_1_5', 'AWAY_UNDER_0_5'],
  AWAY_UNDER_2_5: ['AWAY_UNDER_1_5', 'AWAY_UNDER_0_5'],
  AWAY_UNDER_1_5: ['AWAY_UNDER_0_5'],
  FIRST_HALF_OVER_0_5: ['FIRST_HALF_OVER_1_5', 'FIRST_HALF_OVER_2_5', 'FIRST_HALF_OVER_3_5'],
  FIRST_HALF_OVER_1_5: ['FIRST_HALF_OVER_2_5', 'FIRST_HALF_OVER_3_5'],
  FIRST_HALF_OVER_2_5: ['FIRST_HALF_OVER_3_5'],
  FIRST_HALF_UNDER_3_5: ['FIRST_HALF_UNDER_2_5', 'FIRST_HALF_UNDER_1_5', 'FIRST_HALF_UNDER_0_5'],
  FIRST_HALF_UNDER_2_5: ['FIRST_HALF_UNDER_1_5', 'FIRST_HALF_UNDER_0_5'],
  FIRST_HALF_UNDER_1_5: ['FIRST_HALF_UNDER_0_5']
};

const DOWNGRADE = {
  HOME_WIN: ['DOUBLE_CHANCE_1X'],
  AWAY_WIN: ['DOUBLE_CHANCE_X2'],
  OVER_3_5: ['OVER_2_5', 'OVER_1_5', 'OVER_0_5'],
  OVER_2_5: ['OVER_1_5', 'OVER_0_5'],
  OVER_1_5: ['OVER_0_5'],
  UNDER_0_5: ['UNDER_1_5', 'UNDER_2_5', 'UNDER_3_5'],
  UNDER_1_5: ['UNDER_2_5', 'UNDER_3_5'],
  UNDER_2_5: ['UNDER_3_5'],
  HOME_OVER_3_5: ['HOME_OVER_2_5', 'HOME_OVER_1_5', 'HOME_OVER_0_5'],
  HOME_OVER_2_5: ['HOME_OVER_1_5', 'HOME_OVER_0_5'],
  HOME_OVER_1_5: ['HOME_OVER_0_5'],
  HOME_UNDER_0_5: ['HOME_UNDER_1_5', 'HOME_UNDER_2_5', 'HOME_UNDER_3_5'],
  HOME_UNDER_1_5: ['HOME_UNDER_2_5', 'HOME_UNDER_3_5'],
  HOME_UNDER_2_5: ['HOME_UNDER_3_5'],
  AWAY_OVER_3_5: ['AWAY_OVER_2_5', 'AWAY_OVER_1_5', 'AWAY_OVER_0_5'],
  AWAY_OVER_2_5: ['AWAY_OVER_1_5', 'AWAY_OVER_0_5'],
  AWAY_OVER_1_5: ['AWAY_OVER_0_5'],
  AWAY_UNDER_0_5: ['AWAY_UNDER_1_5', 'AWAY_UNDER_2_5', 'AWAY_UNDER_3_5'],
  AWAY_UNDER_1_5: ['AWAY_UNDER_2_5', 'AWAY_UNDER_3_5'],
  AWAY_UNDER_2_5: ['AWAY_UNDER_3_5'],
  FIRST_HALF_OVER_3_5: ['FIRST_HALF_OVER_2_5', 'FIRST_HALF_OVER_1_5', 'FIRST_HALF_OVER_0_5'],
  FIRST_HALF_OVER_2_5: ['FIRST_HALF_OVER_1_5', 'FIRST_HALF_OVER_0_5'],
  FIRST_HALF_OVER_1_5: ['FIRST_HALF_OVER_0_5'],
  FIRST_HALF_UNDER_0_5: ['FIRST_HALF_UNDER_1_5', 'FIRST_HALF_UNDER_2_5', 'FIRST_HALF_UNDER_3_5'],
  FIRST_HALF_UNDER_1_5: ['FIRST_HALF_UNDER_2_5', 'FIRST_HALF_UNDER_3_5'],
  FIRST_HALF_UNDER_2_5: ['FIRST_HALF_UNDER_3_5'],
  BTTS_YES: ['OVER_1_5'],
  HTFT_HOME_HOME: ['HOME_WIN', 'DOUBLE_CHANCE_1X'],
  HTFT_DRAW_HOME: ['HOME_WIN', 'DOUBLE_CHANCE_1X'],
  HTFT_AWAY_HOME: ['HOME_WIN', 'DOUBLE_CHANCE_1X'],
  HTFT_HOME_AWAY: ['AWAY_WIN', 'DOUBLE_CHANCE_X2'],
  HTFT_DRAW_AWAY: ['AWAY_WIN', 'DOUBLE_CHANCE_X2'],
  HTFT_AWAY_AWAY: ['AWAY_WIN', 'DOUBLE_CHANCE_X2'],
  HTFT_HOME_DRAW: ['DRAW'],
  HTFT_DRAW_DRAW: ['DRAW'],
  HTFT_AWAY_DRAW: ['DRAW']
};


function directionForMarket(market) {
  const code = String(market || '').toUpperCase();
  if (['HOME_WIN','DOUBLE_CHANCE_1X','HTFT_HOME_HOME','HTFT_DRAW_HOME','HTFT_AWAY_HOME'].includes(code)) return 'HOME_RESULT';
  if (['AWAY_WIN','DOUBLE_CHANCE_X2','HTFT_HOME_AWAY','HTFT_DRAW_AWAY','HTFT_AWAY_AWAY'].includes(code)) return 'AWAY_RESULT';
  if (['DRAW','HTFT_HOME_DRAW','HTFT_DRAW_DRAW','HTFT_AWAY_DRAW'].includes(code)) return 'DRAW_RESULT';
  if (code === 'BTTS_YES' || /^OVER_/.test(code) || /^FIRST_HALF_OVER_/.test(code)) return 'GOALS_OVER';
  if (/^UNDER_/.test(code) || /^FIRST_HALF_UNDER_/.test(code)) return 'GOALS_UNDER';
  if (code === 'BTTS_NO') return 'BTTS_NO';
  if (/^HOME_OVER_/.test(code)) return 'HOME_GOALS';
  if (/^AWAY_OVER_/.test(code)) return 'AWAY_GOALS';
  if (/^HOME_UNDER_/.test(code)) return 'HOME_GOALS_UNDER';
  if (/^AWAY_UNDER_/.test(code)) return 'AWAY_GOALS_UNDER';
  return `EXACT:${code}`;
}

function compatibleMarket(fromMarket, toMarket) {
  return directionForMarket(fromMarket) === directionForMarket(toMarket);
}

function marketPrice(market, odds = {}) {
  const spec = MARKET_SPECS[String(market || '').toUpperCase()];
  return spec ? n(odds?.[spec[0]]) : null;
}

function marketLabel(market, fallback = null) {
  return MARKET_SPECS[String(market || '').toUpperCase()]?.[1] || fallback || market;
}

export function isUniversalOddsPublishable(value) {
  const price = n(value);
  return price !== null && price >= MIN_ODDS && price <= MAX_ODDS;
}

function routeAlternative(engineResult, selection, action) {
  const routeId = selection?.routeId;
  if (!routeId || !Array.isArray(engineResult?.candidates)) return null;
  const route = engineResult.candidates.find(item => item?.id === routeId || item?.selection?.routeId === routeId);
  if (!route) return null;
  if (action === 'UPGRADE') {
    const target = route.target;
    if (target?.market && target.market !== selection.market && compatibleMarket(selection.market, target.market) && isUniversalOddsPublishable(target.odds)) return target;
  }
  if (action === 'DOWNGRADE') {
    const safer = route.safer;
    if (safer?.market && safer.market !== selection.market && compatibleMarket(selection.market, safer.market) && isUniversalOddsPublishable(safer.odds)) return safer;
  }
  return null;
}

function mappedAlternative(selection, odds, action) {
  const current = String(selection?.market || '').toUpperCase();
  const candidates = action === 'UPGRADE' ? (UPGRADE[current] || []) : (DOWNGRADE[current] || []);
  for (const market of candidates) {
    const price = marketPrice(market, odds);
    if (!isUniversalOddsPublishable(price)) continue;
    return { market, label: marketLabel(market), odds: price };
  }
  return null;
}

export function gateSelection(selection, odds = {}, engineResult = null) {
  if (!selection?.market) return { accepted: false, selection: null, action: 'REJECTED', reason: 'No market was selected.' };
  const currentMarket = String(selection.market).toUpperCase();
  const currentOdds = n(selection.odds) ?? marketPrice(currentMarket, odds);
  if (isUniversalOddsPublishable(currentOdds)) {
    return {
      accepted: true,
      action: 'PASS',
      selection: { ...selection, market: currentMarket, odds: currentOdds, oddsGateAction: 'PASS' },
      reason: `Final odds ${currentOdds.toFixed(2)} are inside the universal 1.20–2.00 gate.`
    };
  }

  const action = currentOdds !== null && currentOdds < MIN_ODDS ? 'UPGRADE' : 'DOWNGRADE';
  const directAlternative = routeAlternative(engineResult, selection, action);
  const alternative = directAlternative || mappedAlternative(selection, odds, action);
  if (alternative && isUniversalOddsPublishable(alternative.odds)) {
    const adjusted = {
      ...selection,
      ...alternative,
      market: String(alternative.market).toUpperCase(),
      label: marketLabel(alternative.market, alternative.label),
      odds: n(alternative.odds),
      decision: action === 'DOWNGRADE' ? 'SAFER' : selection.decision,
      oddsGateAction: action === 'UPGRADE' ? 'UPGRADED' : 'DOWNGRADED',
      oddsGateOriginalMarket: currentMarket,
      oddsGateOriginalOdds: currentOdds,
      adjustedFrom: currentMarket,
      ...(action === 'DOWNGRADE' ? { downgradedFrom: currentMarket } : { upgradedFrom: currentMarket })
    };
    adjusted.reasons = [
      ...(Array.isArray(selection.reasons) ? selection.reasons : []),
      `Universal odds gate ${action === 'UPGRADE' ? 'upgraded' : 'downgraded'} ${marketLabel(currentMarket, selection.label)} (${currentOdds?.toFixed?.(2) || 'no price'}) to ${adjusted.label} at ${adjusted.odds.toFixed(2)}.`
    ];
    return {
      accepted: true,
      action: adjusted.oddsGateAction,
      selection: adjusted,
      reason: `Final market adjusted into the universal 1.20–2.00 gate.`
    };
  }

  const side = currentOdds === null ? 'has no usable price' : currentOdds < MIN_ODDS ? `is below 1.20 at ${currentOdds.toFixed(2)}` : `is above 2.00 at ${currentOdds.toFixed(2)}`;
  return {
    accepted: false,
    action: 'REJECTED',
    selection: null,
    reason: `${marketLabel(currentMarket, selection.label)} ${side}, and no compatible ${action.toLowerCase()} market is available inside 1.20–2.00.`,
    originalMarket: currentMarket,
    originalOdds: currentOdds
  };
}

export function applyUniversalOddsGate(engineResult = {}, odds = {}) {
  if (!engineResult?.selection) return engineResult;
  const gated = gateSelection(engineResult.selection, odds, engineResult);
  const oddsGate = {
    min: MIN_ODDS,
    max: MAX_ODDS,
    action: gated.action,
    accepted: gated.accepted,
    reason: gated.reason,
    originalMarket: gated.originalMarket || engineResult.selection.market || null,
    originalOdds: gated.originalOdds ?? n(engineResult.selection.odds)
  };
  if (!gated.accepted) {
    return {
      ...engineResult,
      decision: 'ODDS_GATE_REJECT',
      selection: null,
      oddsGate,
      explanation: `${engineResult.explanation || 'Engine route qualified.'} Universal odds gate rejected the final tip: ${gated.reason}`
    };
  }
  return {
    ...engineResult,
    decision: gated.selection.decision || engineResult.decision,
    selection: gated.selection,
    oddsGate,
    explanation: gated.action === 'PASS'
      ? engineResult.explanation
      : `${engineResult.explanation || 'Engine route qualified.'} ${gated.reason}`
  };
}

export const UNIVERSAL_ODDS_GATE = Object.freeze({ min: MIN_ODDS, max: MAX_ODDS });
