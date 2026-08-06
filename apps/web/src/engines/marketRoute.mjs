import { round } from '../lib/utils.mjs';

const n = value => Number.isFinite(Number(value)) ? Number(value) : null;
const offered = value => n(value) !== null && n(value) > 1;
const fmt = value => offered(value) ? n(value).toFixed(2) : '—';

function check(id, label, pass, actual, rule, options = {}) {
  return {
    id,
    label,
    pass: Boolean(pass),
    actual,
    rule,
    critical: options.critical !== false,
    available: options.available !== false
  };
}

function implied1x2(odds = {}) {
  const home = n(odds.homeWin);
  const draw = n(odds.draw);
  const away = n(odds.awayWin);
  if (![home, draw, away].every(offered)) {
    return {
      available: false,
      overround: null,
      fair: { home: null, draw: null, away: null },
      favouriteSide: home && away ? (home < away ? 'home' : away < home ? 'away' : null) : null,
      favouriteOdds: home && away ? Math.min(home, away) : null,
      underdogOdds: home && away ? Math.max(home, away) : null,
      balance: 'UNKNOWN'
    };
  }
  const raw = { home: 1 / home, draw: 1 / draw, away: 1 / away };
  const total = raw.home + raw.draw + raw.away;
  const fair = {
    home: raw.home / total,
    draw: raw.draw / total,
    away: raw.away / total
  };
  const favouriteSide = home < away ? 'home' : away < home ? 'away' : null;
  const favouriteOdds = favouriteSide === 'home' ? home : favouriteSide === 'away' ? away : null;
  const favouriteFair = favouriteSide ? fair[favouriteSide] : null;
  const weakerFair = favouriteSide === 'home' ? fair.away : favouriteSide === 'away' ? fair.home : null;
  const gap = favouriteFair !== null && weakerFair !== null ? favouriteFair - weakerFair : null;
  const unbalanced = favouriteSide && (favouriteOdds <= 1.55 || (favouriteFair >= 0.55 && gap >= 0.12));
  const balanced = Math.abs(fair.home - fair.away) <= 0.08 && Math.max(fair.home, fair.away) <= 0.52;
  return {
    available: true,
    overround: round((total - 1) * 100, 2),
    fair: {
      home: round(fair.home * 100, 2),
      draw: round(fair.draw * 100, 2),
      away: round(fair.away * 100, 2)
    },
    favouriteSide,
    favouriteOdds,
    underdogOdds: favouriteSide === 'home' ? away : favouriteSide === 'away' ? home : null,
    favouriteFair: favouriteFair !== null ? round(favouriteFair * 100, 2) : null,
    gap: gap !== null ? round(gap * 100, 2) : null,
    balance: unbalanced ? 'UNBALANCED' : balanced ? 'BALANCED' : 'NEUTRAL'
  };
}

function sideMarket(structure, odds, type) {
  const side = structure.favouriteSide;
  if (!side) return { market: null, odds: null, label: null };
  if (type === 'WIN') {
    return side === 'home'
      ? { market: 'HOME_WIN', odds: n(odds.homeWin), label: 'Home Team to Win' }
      : { market: 'AWAY_WIN', odds: n(odds.awayWin), label: 'Away Team to Win' };
  }
  if (type === 'OVER_1_5') {
    return side === 'home'
      ? { market: 'HOME_OVER_1_5', odds: n(odds.homeOver15), label: 'Home Team Over 1.5 Goals' }
      : { market: 'AWAY_OVER_1_5', odds: n(odds.awayOver15), label: 'Away Team Over 1.5 Goals' };
  }
  if (type === 'OVER_0_5') {
    return side === 'home'
      ? { market: 'HOME_OVER_0_5', odds: n(odds.homeOver05), label: 'Home Team Over 0.5 Goals' }
      : { market: 'AWAY_OVER_0_5', odds: n(odds.awayOver05), label: 'Away Team Over 0.5 Goals' };
  }
  if (type === 'DOUBLE_CHANCE') {
    return side === 'home'
      ? { market: 'DOUBLE_CHANCE_1X', odds: n(odds.doubleChance1X), label: 'Home or Draw (1X)' }
      : { market: 'DOUBLE_CHANCE_X2', odds: n(odds.doubleChanceX2), label: 'Draw or Away (X2)' };
  }
  return { market: null, odds: null, label: null };
}

function favouriteTeamTotal(structure, odds, line) {
  if (!structure.favouriteSide) return null;
  if (line === '1.5') return n(structure.favouriteSide === 'home' ? odds.homeOver15 : odds.awayOver15);
  return n(structure.favouriteSide === 'home' ? odds.homeOver05 : odds.awayOver05);
}

function weakerTeamTotal(structure, odds, line = '0.5') {
  if (!structure.favouriteSide) return null;
  if (line === '1.5') return n(structure.favouriteSide === 'home' ? odds.awayOver15 : odds.homeOver15);
  return n(structure.favouriteSide === 'home' ? odds.awayOver05 : odds.homeOver05);
}

function buildCandidate({ id, name, family, checks, target, safer, note }) {
  const failures = checks.filter(item => !item.pass);
  const passed = checks.length - failures.length;
  const score = round(passed / Math.max(1, checks.length) * 100, 1);
  let decision = 'REJECT';
  let selection = null;

  if (!failures.length && offered(target?.odds)) {
    decision = 'FIRE';
    selection = { ...target, decision: 'FIRE' };
  } else if (failures.length >= 1 && failures.length <= 2 && offered(safer?.odds)) {
    decision = 'SAFER';
    selection = {
      ...safer,
      decision: 'SAFER',
      downgradedFrom: target?.market || null,
      missedCondition: failures.map(item => item.label).join(' + '),
      missedConditions: failures.map(item => item.label)
    };
  }

  const reasons = [
    note,
    ...checks.filter(item => item.pass).slice(0, 4).map(item => `${item.label}: ${item.actual}.`),
    ...failures.map(item => `${item.label} missed: ${item.actual}; required ${item.rule}.`)
  ].filter(Boolean);

  if (selection) {
    selection.routeId = id;
    selection.routeName = name;
    selection.score = score;
    selection.grade = decision === 'FIRE' ? (score === 100 ? 'A+' : 'A') : 'SAFER';
    selection.checksPassed = passed;
    selection.checksTotal = checks.length;
    selection.missed = failures.length;
    selection.reasons = reasons;
  }

  return {
    id,
    name,
    family,
    decision,
    score,
    checks,
    failures,
    target,
    safer,
    selection,
    reasons
  };
}

function conflictResult(candidates) {
  const qualified = candidates.filter(item => item.selection);
  const over = qualified.filter(item => item.family === 'OVER');
  const under = qualified.filter(item => item.family === 'UNDER');
  if (over.length && under.length) {
    return {
      conflict: true,
      reason: `An over route (${over[0].selection.label}) and an under route (${under[0].selection.label}) both qualified.`
    };
  }
  return { conflict: false, reason: null };
}


function statNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitRate(split, key) {
  if (!split || typeof split !== 'object') return null;
  const direct = statNumber(split?.rates?.[key]);
  if (direct !== null) return direct;
  const played = statNumber(split.played);
  const count = statNumber(split[key]);
  return played && count !== null ? round((count / played) * 100, 1) : null;
}

function averageAvailable(...values) {
  const valid = values.map(statNumber).filter(value => value !== null);
  return valid.length ? round(valid.reduce((sum, value) => sum + value, 0) / valid.length, 1) : null;
}

function statisticsSource(stats, fixture) {
  const source = stats?.source || fixture?.stats?.source || 'SPORTYBET_CUSTOM_API';
  return String(source).toUpperCase();
}

function statisticsLabel(source) {
  return source === 'SPORTYBET_CUSTOM_API' ? 'SportyBet primary statistics'
    : source === 'API_FOOTBALL_FALLBACK' ? 'API-Football fallback statistics'
      : 'Enriched statistics';
}

function statisticalValidation(selection, fixture, stats, structure) {
  const source = statisticsSource(stats, fixture);
  const sourceLabel = statisticsLabel(source);
  const home = stats?.homeSplit || stats?.home || fixture?.stats?.homeSplit || null;
  const away = stats?.awaySplit || stats?.away || fixture?.stats?.awaySplit || null;
  const homePlayed = statNumber(home?.played) || 0;
  const awayPlayed = statNumber(away?.played) || 0;
  const samples = { home: homePlayed, away: awayPlayed, required: 3 };
  if (!selection || homePlayed < 3 || awayPlayed < 3) {
    return {
      source,
      status: 'UNAVAILABLE',
      samples,
      score: null,
      reasons: [`${sourceLabel} venue samples are incomplete (${homePlayed}/3 home, ${awayPlayed}/3 away).`]
    };
  }

  const market = String(selection.market || '').toUpperCase();
  const homeOver15 = splitRate(home, 'over15');
  const awayOver15 = splitRate(away, 'over15');
  const homeOver25 = splitRate(home, 'over25');
  const awayOver25 = splitRate(away, 'over25');
  const homeUnder25 = splitRate(home, 'under25');
  const awayUnder25 = splitRate(away, 'under25');
  const homeUnder35 = splitRate(home, 'under35');
  const awayUnder35 = splitRate(away, 'under35');
  const homeBtts = splitRate(home, 'btts');
  const awayBtts = splitRate(away, 'btts');
  const goalPace = averageAvailable(home?.goalsPerMatch, away?.goalsPerMatch);
  const checks = [];
  let contradicted = false;
  let supported = false;

  const evidence = (label, value, supportRule, contradictionRule) => {
    if (value === null) return;
    const support = supportRule(value);
    const contradiction = contradictionRule(value);
    checks.push({ label, value, support, contradiction });
    supported ||= support;
    contradicted ||= contradiction;
  };

  if (market === 'OVER_2_5') {
    evidence('Combined Over 2.5 venue rate', averageAvailable(homeOver25, awayOver25), value => value >= 60, value => value <= 25);
    evidence('Combined venue goal pace', goalPace, value => value >= 2.8, value => value <= 2.1);
  } else if (market === 'OVER_1_5') {
    evidence('Combined Over 1.5 venue rate', averageAvailable(homeOver15, awayOver15), value => value >= 70, value => value <= 40);
    evidence('Combined venue goal pace', goalPace, value => value >= 2.4, value => value <= 1.7);
  } else if (market === 'UNDER_2_5') {
    evidence('Combined Under 2.5 venue rate', averageAvailable(homeUnder25, awayUnder25), value => value >= 60, value => value <= 25);
    evidence('Combined venue goal pace', goalPace, value => value <= 2.4, value => value >= 3.2);
  } else if (market === 'UNDER_3_5') {
    evidence('Combined Under 3.5 venue rate', averageAvailable(homeUnder35, awayUnder35), value => value >= 70, value => value <= 45);
    evidence('Combined venue goal pace', goalPace, value => value <= 3.0, value => value >= 3.8);
  } else if (market === 'BTTS_YES') {
    evidence('Combined BTTS venue rate', averageAvailable(homeBtts, awayBtts), value => value >= 60, value => value <= 25);
    evidence('Both teams scoring frequency', averageAvailable(splitRate(home, 'scoredIn'), splitRate(away, 'scoredIn')), value => value >= 80, value => value <= 45);
  } else if (market === 'BTTS_NO') {
    evidence('Combined BTTS venue rate', averageAvailable(homeBtts, awayBtts), value => value <= 35, value => value >= 75);
    evidence('Combined failed-to-score rate', averageAvailable(splitRate(home, 'failedToScore'), splitRate(away, 'failedToScore')), value => value >= 30, value => value <= 10);
  } else if (market.includes('OVER_1_5') && (market.startsWith('HOME_') || market.startsWith('AWAY_'))) {
    const selected = market.startsWith('HOME_') ? home : away;
    evidence('Selected team two-goal frequency', splitRate(selected, 'scored2Plus'), value => value >= 60, value => value <= 20);
    evidence('Selected team venue scoring average', statNumber(selected?.goalsForAvg), value => value >= 1.7, value => value < 0.9);
  } else if (market.includes('OVER_0_5') && (market.startsWith('HOME_') || market.startsWith('AWAY_'))) {
    const selected = market.startsWith('HOME_') ? home : away;
    evidence('Selected team scoring frequency', splitRate(selected, 'scoredIn'), value => value >= 80, value => value <= 40);
    evidence('Selected team venue scoring average', statNumber(selected?.goalsForAvg), value => value >= 1.2, value => value < 0.6);
  } else if (['HOME_WIN', 'AWAY_WIN', 'DOUBLE_CHANCE_1X', 'DOUBLE_CHANCE_X2'].includes(market)) {
    const selectedSide = market.startsWith('HOME') || market.endsWith('1X') ? 'home' : 'away';
    const selected = selectedSide === 'home' ? home : away;
    const opponent = selectedSide === 'home' ? away : home;
    const selectedPpg = statNumber(selected?.ppg);
    const opponentPpg = statNumber(opponent?.ppg);
    const ppgGap = selectedPpg !== null && opponentPpg !== null ? round(selectedPpg - opponentPpg, 2) : null;
    evidence('Selected-side venue PPG gap', ppgGap, value => value >= 0.6, value => value <= -0.7);
    evidence('Selected-side win rate', splitRate(selected, 'wins'), value => value >= 60, value => value <= 20 && splitRate(opponent, 'losses') !== null && splitRate(opponent, 'losses') <= 20);
    if (structure?.favouriteSide && structure.favouriteSide !== selectedSide && market.includes('WIN')) {
      contradicted = true;
      checks.push({ label: 'Odds/stat direction', value: structure.favouriteSide, support: false, contradiction: true });
    }
  }

  const contradictionCount = checks.filter(item => item.contradiction).length;
  const supportCount = checks.filter(item => item.support).length;
  const status = contradicted && contradictionCount >= 1 ? 'CONTRADICTED' : supported ? 'SUPPORTED' : 'NEUTRAL';
  const score = checks.length ? round((supportCount / checks.length) * 100, 1) : null;
  const reasons = checks.map(item => {
    const printable = typeof item.value === 'number' ? item.value.toFixed(1) : String(item.value);
    return `${item.label}: ${printable}${typeof item.value === 'number' && item.label.includes('rate') ? '%' : ''}${item.contradiction ? ' (strong contradiction)' : item.support ? ' (supports)' : ' (neutral)'}.`;
  });
  return { source, status, samples, score, checks, reasons };
}

function pickBest(candidates) {
  const priority = {
    FAV_TEAM_OVER_1_5: 100,
    FAVOURITE_WIN: 95,
    BTTS_YES: 90,
    OVER_2_5: 85,
    UNDER_2_5: 85
  };
  return candidates
    .filter(item => item.selection)
    .sort((a, b) => {
      const fireGap = (b.decision === 'FIRE' ? 1 : 0) - (a.decision === 'FIRE' ? 1 : 0);
      if (fireGap) return fireGap;
      const priorityGap = (priority[b.id] || 0) - (priority[a.id] || 0);
      if (priorityGap) return priorityGap;
      return b.score - a.score || (a.selection.odds || 99) - (b.selection.odds || 99);
    })[0] || null;
}

export function analyzeMarketRoute(fixture = {}, stats = null) {
  const odds = fixture.odds || {};
  const structure = implied1x2(odds);
  const favouriteWin = sideMarket(structure, odds, 'WIN');
  const favouriteOver15 = sideMarket(structure, odds, 'OVER_1_5');
  const favouriteOver05 = sideMarket(structure, odds, 'OVER_0_5');
  const favouriteDoubleChance = sideMarket(structure, odds, 'DOUBLE_CHANCE');
  const favTt15 = favouriteTeamTotal(structure, odds, '1.5');
  const weakerTt05 = weakerTeamTotal(structure, odds, '0.5');
  const team05Average = offered(odds.homeOver05) && offered(odds.awayOver05)
    ? round((n(odds.homeOver05) + n(odds.awayOver05)) / 2, 2)
    : null;

  const candidates = [];

  if (structure.favouriteSide) {
    candidates.push(buildCandidate({
      id: 'FAVOURITE_WIN',
      name: 'Favourite control route',
      family: 'RESULT',
      checks: [
        check('u35', 'Under 3.5 opens the route', n(odds.under35) >= 1.50, `Under 3.5 ${fmt(odds.under35)}`, '≥ 1.50'),
        check('shape', '1X2 is unbalanced', structure.balance === 'UNBALANCED', structure.balance, 'UNBALANCED'),
        check('favtt15', 'Favourite Team Over 1.5', offered(favTt15) && favTt15 < 1.55, fmt(favTt15), '< 1.55'),
        check('weaktt05', 'Weaker Team Over 0.5', offered(weakerTt05) && weakerTt05 >= 1.65, fmt(weakerTt05), '≥ 1.65'),
        check('draw', 'Draw price', n(odds.draw) >= 3.70, fmt(odds.draw), '≥ 3.70'),
        check('ng', 'BTTS No price', offered(odds.bttsNo) && n(odds.bttsNo) <= 1.55, fmt(odds.bttsNo), '≤ 1.55'),
        check('favwin', 'Favourite 1X2 price', structure.favouriteOdds >= 1.20 && structure.favouriteOdds <= 1.55, fmt(structure.favouriteOdds), '1.20–1.55')
      ],
      target: favouriteWin,
      safer: favouriteDoubleChance,
      note: 'The favourite is strongly priced, expected to provide the goals, and the weaker team has a restricted scoring route.'
    }));

    candidates.push(buildCandidate({
      id: 'FAV_TEAM_OVER_1_5',
      name: 'Very short favourite goals route',
      family: 'OVER',
      checks: [
        check('u35', 'Under 3.5 opens the route', n(odds.under35) >= 1.50, `Under 3.5 ${fmt(odds.under35)}`, '≥ 1.50'),
        check('shape', '1X2 is unbalanced', structure.balance === 'UNBALANCED', structure.balance, 'UNBALANCED'),
        check('favprice', 'Favourite 1X2 price', offered(structure.favouriteOdds) && structure.favouriteOdds < 1.20, fmt(structure.favouriteOdds), '< 1.20'),
        check('draw', 'Draw price', n(odds.draw) > 4.00, fmt(odds.draw), '> 4.00'),
        check('favtt15', 'Favourite Team Over 1.5', offered(favTt15) && favTt15 < 1.55, fmt(favTt15), '< 1.55'),
        check('weaktt05', 'Weaker Team Over 0.5', offered(weakerTt05) && weakerTt05 >= 1.65, fmt(weakerTt05), '≥ 1.65'),
        check('ng', 'BTTS No price', offered(odds.bttsNo) && n(odds.bttsNo) <= 1.55, fmt(odds.bttsNo), '≤ 1.55')
      ],
      target: favouriteOver15,
      safer: favouriteOver05,
      note: 'The straight-win price is too short, so the engine follows the favourite’s two-goal route instead.'
    }));
  }

  candidates.push(buildCandidate({
    id: 'BTTS_YES',
    name: 'Balanced both-teams scoring route',
    family: 'OVER',
    checks: [
      check('u35', 'Under 3.5 opens the route', n(odds.under35) >= 1.50, `Under 3.5 ${fmt(odds.under35)}`, '≥ 1.50'),
      check('shape', '1X2 is balanced', structure.balance === 'BALANCED', structure.balance, 'BALANCED'),
      check('home05', 'Home Team Over 0.5', offered(odds.homeOver05) && n(odds.homeOver05) <= 1.30, fmt(odds.homeOver05), '≤ 1.30'),
      check('away05', 'Away Team Over 0.5', offered(odds.awayOver05) && n(odds.awayOver05) <= 1.30, fmt(odds.awayOver05), '≤ 1.30'),
      check('draw', 'Draw price', n(odds.draw) >= 3.70, fmt(odds.draw), '≥ 3.70'),
      check('ng', 'BTTS No price', n(odds.bttsNo) >= 2.50, fmt(odds.bttsNo), '≥ 2.50'),
      check('gg', 'BTTS Yes price', n(odds.bttsYes) >= 1.20 && n(odds.bttsYes) <= 1.55, fmt(odds.bttsYes), '1.20–1.55')
    ],
    target: { market: 'BTTS_YES', odds: n(odds.bttsYes), label: 'Both Teams to Score — Yes' },
    safer: { market: 'OVER_1_5', odds: n(odds.over15), label: 'Over 1.5 Goals' },
    note: 'The 1X2 market is balanced and both team-total prices point to a goal from each side.'
  }));

  candidates.push(buildCandidate({
    id: 'OVER_2_5',
    name: 'Unbalanced high-goal route',
    family: 'OVER',
    checks: [
      check('u35', 'Under 3.5 opens the route', n(odds.under35) >= 1.60, `Under 3.5 ${fmt(odds.under35)}`, '≥ 1.60'),
      check('shape', '1X2 is unbalanced', structure.balance === 'UNBALANCED', structure.balance, 'UNBALANCED'),
      check('favtt15', 'Favourite Team Over 1.5', offered(favTt15) && favTt15 < 1.50, fmt(favTt15), '< 1.50'),
      check('weaktt05', 'Weaker Team Over 0.5', offered(weakerTt05) && weakerTt05 <= 1.30, fmt(weakerTt05), '≤ 1.30'),
      check('draw', 'Draw price', n(odds.draw) >= 3.70, fmt(odds.draw), '≥ 3.70')
    ],
    target: { market: 'OVER_2_5', odds: n(odds.over25), label: 'Over 2.5 Goals' },
    safer: { market: 'OVER_1_5', odds: n(odds.over15), label: 'Over 1.5 Goals' },
    note: 'The favourite has a two-goal route while the weaker team is also strongly expected to score.'
  }));

  candidates.push(buildCandidate({
    id: 'UNDER_2_5',
    name: 'Compressed under route',
    family: 'UNDER',
    checks: [
      check('u25', 'Under 2.5 price', offered(odds.under25) && n(odds.under25) <= 1.55, fmt(odds.under25), '≤ 1.55'),
      check('o15', 'Over 1.5 price', offered(odds.over15) && n(odds.over15) >= 1.45, fmt(odds.over15), '≥ 1.45'),
      check('ng', 'BTTS No price', offered(odds.bttsNo) && n(odds.bttsNo) <= 1.50, fmt(odds.bttsNo), '≤ 1.50'),
      check('teamavg', 'Average Team Over 0.5 price', team05Average !== null && team05Average >= 1.60, team05Average !== null ? team05Average.toFixed(2) : '—', '≥ 1.60'),
      check('draw', 'Draw price', offered(odds.draw) && n(odds.draw) <= 3.00, fmt(odds.draw), '≤ 3.00')
    ],
    target: { market: 'UNDER_2_5', odds: n(odds.under25), label: 'Under 2.5 Goals' },
    safer: { market: 'UNDER_3_5', odds: n(odds.under35), label: 'Under 3.5 Goals' },
    note: 'The market expects a compressed game with a low draw price and weak combined team-scoring confidence.'
  }));

  const conflict = conflictResult(candidates);
  if (conflict.conflict) {
    return {
      engine: 'MARKET_ROUTE',
      decision: 'CONFLICT',
      selection: null,
      candidates,
      structure,
      explanation: conflict.reason
    };
  }

  const best = pickBest(candidates);
  const validation = statisticalValidation(best?.selection || null, fixture, stats, structure);
  if (best?.selection && validation.status === 'CONTRADICTED') {
    return {
      engine: 'MARKET_ROUTE',
      decision: 'STAT_CONFLICT',
      selection: null,
      candidates,
      structure,
      statisticalValidation: validation,
      explanation: `${best.name} passed the SportyBet odds route, but ${statisticsLabel(validation.source)} strongly contradict ${best.selection.label}. The engine rejected the pick.`
    };
  }
  const selected = best?.selection
    ? {
        ...best.selection,
        statisticalValidation: validation,
        reasons: [
          ...(best.selection.reasons || []),
          ...(validation.status === 'SUPPORTED' ? [`${statisticsLabel(validation.source)} support the route (${validation.score ?? 0}% evidence agreement).`] : validation.status === 'NEUTRAL' ? [`${statisticsLabel(validation.source)} are neutral and do not oppose the SportyBet route.`] : [])
        ]
      }
    : null;
  return {
    engine: 'MARKET_ROUTE',
    decision: best?.decision || 'NO_SIGNAL',
    selection: selected,
    candidates,
    structure,
    statisticalValidation: validation,
    explanation: selected
      ? `${best.name} selected ${selected.label}${best.decision === 'SAFER' ? ` as the safer market after ${selected.missed} missed condition${selected.missed === 1 ? '' : 's'}` : ''}. ${validation.status === 'SUPPORTED' ? `${statisticsLabel(validation.source)} support the direction.` : validation.status === 'NEUTRAL' ? `${statisticsLabel(validation.source)} do not strongly oppose the direction.` : 'The statistical gate is waiting for enough venue history.'}`
      : 'No route passed. Three or more conditions were missing from every market direction, or the safer market was unavailable.'
  };
}

export function marketRouteSummary(result = {}) {
  return {
    decision: result.decision || 'NO_SIGNAL',
    selection: result.selection || null,
    structure: result.structure || null,
    statisticalValidation: result.statisticalValidation || null,
    closest: [...(result.candidates || [])].sort((a, b) => a.failures.length - b.failures.length || b.score - a.score)[0] || null,
    explanation: result.explanation || null
  };
}
