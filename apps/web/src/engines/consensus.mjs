const n = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
};

const MARKET_LABELS = {
  HOME_WIN: 'Home Team to Win',
  AWAY_WIN: 'Away Team to Win',
  DOUBLE_CHANCE_1X: 'Home or Draw (1X)',
  DOUBLE_CHANCE_X2: 'Draw or Away (X2)',
  OVER_1_5: 'Over 1.5 Goals',
  OVER_2_5: 'Over 2.5 Goals',
  UNDER_2_5: 'Under 2.5 Goals',
  UNDER_3_5: 'Under 3.5 Goals',
  BTTS_YES: 'Both Teams to Score — Yes',
  BTTS_NO: 'Both Teams to Score — No',
  HOME_OVER_0_5: 'Home Team Over 0.5 Goals',
  HOME_OVER_1_5: 'Home Team Over 1.5 Goals',
  AWAY_OVER_0_5: 'Away Team Over 0.5 Goals',
  AWAY_OVER_1_5: 'Away Team Over 1.5 Goals'
};

const ODDS_KEYS = {
  HOME_WIN: 'homeWin',
  AWAY_WIN: 'awayWin',
  DOUBLE_CHANCE_1X: 'doubleChance1X',
  DOUBLE_CHANCE_X2: 'doubleChanceX2',
  OVER_1_5: 'over15',
  OVER_2_5: 'over25',
  UNDER_2_5: 'under25',
  UNDER_3_5: 'under35',
  BTTS_YES: 'bttsYes',
  BTTS_NO: 'bttsNo',
  HOME_OVER_0_5: 'homeOver05',
  HOME_OVER_1_5: 'homeOver15',
  AWAY_OVER_0_5: 'awayOver05',
  AWAY_OVER_1_5: 'awayOver15'
};

function directionForMarket(market) {
  const code = String(market || '').toUpperCase();
  if (['HOME_WIN', 'DOUBLE_CHANCE_1X', 'HOME_DOUBLE_CHANCE', '1X'].includes(code)) return 'HOME_RESULT';
  if (['AWAY_WIN', 'DOUBLE_CHANCE_X2', 'AWAY_DOUBLE_CHANCE', 'X2'].includes(code)) return 'AWAY_RESULT';
  if (['OVER_1_5', 'OVER_2_5', 'BTTS_YES'].includes(code)) return 'GOALS_OVER';
  if (['UNDER_2_5', 'UNDER_3_5'].includes(code)) return 'GOALS_UNDER';
  if (code === 'BTTS_NO') return 'BTTS_NO';
  if (['HOME_OVER_0_5', 'HOME_OVER_1_5'].includes(code)) return 'HOME_GOALS';
  if (['AWAY_OVER_0_5', 'AWAY_OVER_1_5'].includes(code)) return 'AWAY_GOALS';
  return `EXACT:${code || 'UNKNOWN'}`;
}

function sharedMarket(direction, picks = []) {
  const markets = picks.map(item => String(item.market || '').toUpperCase());
  if (direction === 'HOME_RESULT') return markets.every(code => code === 'HOME_WIN') ? 'HOME_WIN' : 'DOUBLE_CHANCE_1X';
  if (direction === 'AWAY_RESULT') return markets.every(code => code === 'AWAY_WIN') ? 'AWAY_WIN' : 'DOUBLE_CHANCE_X2';
  if (direction === 'GOALS_OVER') return markets.every(code => code === 'OVER_2_5') ? 'OVER_2_5' : 'OVER_1_5';
  if (direction === 'GOALS_UNDER') return markets.every(code => code === 'UNDER_2_5') ? 'UNDER_2_5' : 'UNDER_3_5';
  if (direction === 'HOME_GOALS') return markets.every(code => code === 'HOME_OVER_1_5') ? 'HOME_OVER_1_5' : 'HOME_OVER_0_5';
  if (direction === 'AWAY_GOALS') return markets.every(code => code === 'AWAY_OVER_1_5') ? 'AWAY_OVER_1_5' : 'AWAY_OVER_0_5';
  if (direction === 'BTTS_NO') return 'BTTS_NO';
  if (direction.startsWith('EXACT:')) return direction.slice(6);
  return markets[0] || null;
}

function marketPrice(market, odds = {}, picks = []) {
  const key = ODDS_KEYS[market];
  const direct = key ? n(odds?.[key]) : null;
  if (direct) return direct;
  const exact = picks.find(item => String(item.market || '').toUpperCase() === market && n(item.odds));
  return exact ? n(exact.odds) : null;
}

function conflictReasons(picks = []) {
  const directions = new Set(picks.map(item => directionForMarket(item.market)));
  const markets = new Set(picks.map(item => String(item.market || '').toUpperCase()));
  const reasons = [];
  if (directions.has('HOME_RESULT') && directions.has('AWAY_RESULT')) reasons.push('Opposite team-result directions qualified.');
  if (directions.has('GOALS_OVER') && directions.has('GOALS_UNDER')) reasons.push('Over and Under goal directions qualified together.');
  if (markets.has('BTTS_YES') && markets.has('BTTS_NO')) reasons.push('BTTS Yes and BTTS No qualified together.');
  return reasons;
}

function publicEnginePick(pick) {
  return {
    engine: pick.engine,
    engineName: pick.engineName,
    decision: pick.decision,
    market: pick.market,
    label: pick.label,
    odds: n(pick.odds),
    score: Number(pick.score || 0),
    routeName: pick.routeName || null,
    reasons: Array.isArray(pick.reasons) ? pick.reasons.slice(0, 4) : [],
    missedCondition: pick.missedCondition || null
  };
}

export function buildConsensusForFixture({ fixture = {}, picks = [], odds = {} } = {}) {
  const usable = picks
    .filter(item => item?.engine && item?.market && ['FIRE', 'SAFER'].includes(String(item.decision || '').toUpperCase()))
    .filter((item, index, rows) => rows.findIndex(other => other.engine === item.engine) === index)
    .map(item => ({ ...item, direction: directionForMarket(item.market) }));

  const base = {
    fixtureId: fixture.fixtureId || fixture.id || null,
    date: fixture.date || null,
    kickoff: fixture.kickoff || null,
    country: fixture.country || fixture.league?.country || 'International',
    league: fixture.leagueName || fixture.league?.name || 'League',
    home: fixture.home || { name: fixture.homeName || 'Home' },
    away: fixture.away || { name: fixture.awayName || 'Away' },
    classification: 'NO_SIGNAL',
    agreementCount: 0,
    agreementDirection: null,
    final: null,
    engines: usable.map(item => item.engine),
    enginePicks: usable.map(publicEnginePick),
    score: 0,
    conflict: false,
    conflictReasons: [],
    status: 'PROVISIONAL'
  };

  if (!usable.length) return base;
  const conflicts = conflictReasons(usable);
  if (conflicts.length) return { ...base, classification: 'CONFLICT', conflict: true, conflictReasons: conflicts };

  const groups = new Map();
  for (const pick of usable) {
    if (!groups.has(pick.direction)) groups.set(pick.direction, []);
    groups.get(pick.direction).push(pick);
  }
  const ranked = [...groups.entries()].map(([direction, group]) => ({
    direction,
    picks: group,
    count: group.length,
    averageScore: group.reduce((sum, item) => sum + Number(item.score || 0), 0) / group.length,
    fireCount: group.filter(item => item.decision === 'FIRE').length
  })).sort((a, b) => b.count - a.count || b.fireCount - a.fireCount || b.averageScore - a.averageScore);

  const best = ranked[0];
  if (!best) return base;
  const finalMarket = sharedMarket(best.direction, best.picks);
  const finalOdds = marketPrice(finalMarket, odds, best.picks);
  const agreementCount = best.count;
  let classification = agreementCount >= 5 ? 'ELITE_BANKER' : agreementCount === 4 ? 'CONSENSUS_BANKER' : agreementCount >= 2 ? 'QUALIFIED_PICK' : best.picks[0]?.decision === 'FIRE' ? 'QUALIFIED_PICK' : 'SAFER_PICK';
  if (agreementCount >= 2 && !finalOdds) classification = 'HOLD_MISSING_SHARED_PRICE';

  return {
    ...base,
    classification,
    agreementCount,
    agreementDirection: best.direction,
    final: finalMarket ? { market: finalMarket, label: MARKET_LABELS[finalMarket] || best.picks[0]?.label || finalMarket, odds: finalOdds } : null,
    engines: best.picks.map(item => item.engine),
    enginePicks: usable.map(publicEnginePick),
    score: Number(best.averageScore.toFixed(1)),
    reasons: [
      `${agreementCount} independent engine${agreementCount === 1 ? '' : 's'} support ${best.direction.replaceAll('_', ' ').toLowerCase()}.`,
      finalMarket ? `The safest shared market is ${MARKET_LABELS[finalMarket] || finalMarket}.` : 'No common market could be selected.',
      agreementCount >= 5 ? 'Elite status requires complete five-engine agreement.' : agreementCount === 4 ? 'Four of five independent engines agree, so this qualifies as a consensus banker.' : agreementCount >= 2 ? `${agreementCount} engines agree, so this remains a shared qualified pick rather than a banker.` : 'This remains a single-engine qualified route.'
    ]
  };
}

export function buildConsensusWindow(enginePicks = []) {
  const groups = new Map();
  for (const pick of enginePicks) {
    const key = String(pick.fixtureId || '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pick);
  }
  const rows = [];
  for (const [fixtureId, picks] of groups.entries()) {
    const first = picks[0];
    const fixture = {
      fixtureId,
      date: first.date,
      kickoff: first.kickoff,
      country: first.country,
      leagueName: first.league,
      home: first.home,
      away: first.away
    };
    rows.push(buildConsensusForFixture({ fixture, picks, odds: first._odds || {} }));
  }
  rows.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff) || b.agreementCount - a.agreementCount || b.score - a.score);
  return rows;
}

export function consensusSummary(rows = []) {
  const count = classification => rows.filter(item => item.classification === classification).length;
  return {
    total: rows.length,
    elite: count('ELITE_BANKER'),
    consensus: count('CONSENSUS_BANKER'),
    qualified: count('QUALIFIED_PICK'),
    safer: count('SAFER_PICK'),
    conflicts: count('CONFLICT'),
    holds: count('HOLD_MISSING_SHARED_PRICE')
  };
}

export function marketDirection(market) {
  return directionForMarket(market);
}
