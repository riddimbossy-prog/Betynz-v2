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

export function analyzeMarketRoute(fixture = {}) {
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
  return {
    engine: 'MARKET_ROUTE',
    decision: best?.decision || 'NO_SIGNAL',
    selection: best?.selection || null,
    candidates,
    structure,
    explanation: best?.selection
      ? `${best.name} selected ${best.selection.label}${best.decision === 'SAFER' ? ` as the safer market after ${best.selection.missed} missed condition${best.selection.missed === 1 ? '' : 's'}` : ''}.`
      : 'No route passed. Three or more conditions were missing from every market direction, or the safer market was unavailable.'
  };
}

export function marketRouteSummary(result = {}) {
  return {
    decision: result.decision || 'NO_SIGNAL',
    selection: result.selection || null,
    structure: result.structure || null,
    closest: [...(result.candidates || [])].sort((a, b) => a.failures.length - b.failures.length || b.score - a.score)[0] || null,
    explanation: result.explanation || null
  };
}
