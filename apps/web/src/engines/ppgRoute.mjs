import { round } from '../lib/utils.mjs';

const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
const offered = value => number(value) !== null && number(value) > 1;
const fmt = value => offered(value) ? number(value).toFixed(2) : '—';

function normalizeSplit(split) {
  if (!split || typeof split !== 'object') return null;
  const played = Math.max(0, Math.min(5, Number(split.played) || 0));
  const points = Number.isFinite(Number(split.points))
    ? Number(split.points)
    : (Number(split.wins) || 0) * 3 + (Number(split.draws) || 0);
  const ppg = Number.isFinite(Number(split.ppg))
    ? Number(split.ppg)
    : played ? round(points / played, 2) : null;
  return {
    played,
    points,
    maximumPoints: played * 3,
    ppg,
    form: Array.isArray(split.form) ? split.form.slice(0, 5) : [],
    wins: Number(split.wins) || 0,
    draws: Number(split.draws) || 0,
    losses: Number(split.losses) || 0
  };
}

function selection({ routeId, routeName, market, label, odds, decision = 'FIRE', reasons = [], score = 100 }) {
  return {
    routeId,
    routeName,
    market,
    label,
    odds: number(odds),
    decision,
    grade: decision === 'FIRE' ? 'A+' : 'A',
    score,
    reasons
  };
}

function routeResult({ id, name, family, pass, checks, output = null, explanation }) {
  return { id, name, family, pass: Boolean(pass), checks, selection: output, explanation };
}

function sideOutput(side, odds, type) {
  if (type === 'WIN') {
    return side === 'home'
      ? { market: 'HOME_WIN', label: 'Home Team to Win', odds: odds.homeWin }
      : { market: 'AWAY_WIN', label: 'Away Team to Win', odds: odds.awayWin };
  }
  return side === 'home'
    ? { market: 'DOUBLE_CHANCE_1X', label: 'Home or Draw (1X)', odds: odds.doubleChance1X }
    : { market: 'DOUBLE_CHANCE_X2', label: 'Draw or Away (X2)', odds: odds.doubleChanceX2 };
}

function check(label, pass, actual, rule) {
  return { label, pass: Boolean(pass), actual, rule };
}

export function analyzePpgRoute(fixture = {}, stats = null) {
  const odds = fixture.odds || {};
  const home = normalizeSplit(stats?.homeSplit || stats?.home || fixture?.stats?.homeSplit);
  const away = normalizeSplit(stats?.awaySplit || stats?.away || fixture?.stats?.awaySplit);
  const draw = number(odds.draw);
  const base = {
    engine: 'PPG_ROUTE',
    home,
    away,
    routes: [],
    decision: 'NO_SIGNAL',
    selection: null,
    explanation: 'No PPG route qualified.'
  };

  if (!home || !away || home.played < 5 || away.played < 5) {
    return {
      ...base,
      decision: 'WAITING',
      explanation: `The PPG engine requires five home matches and five away matches. Home sample: ${home?.played || 0}/5; away sample: ${away?.played || 0}/5.`
    };
  }

  if (!offered(draw)) {
    return { ...base, decision: 'WAITING', explanation: 'The draw price is required before a PPG route can be selected.' };
  }

  const homePpg = Number(home.ppg);
  const awayPpg = Number(away.ppg);
  const routes = [];

  // 1. Both teams below 1.00 PPG with a compressed draw market.
  {
    const checks = [
      check('Home venue PPG', homePpg < 1, homePpg.toFixed(2), '< 1.00'),
      check('Away venue PPG', awayPpg < 1, awayPpg.toFixed(2), '< 1.00'),
      check('Draw price', draw <= 3.00, fmt(draw), '≤ 3.00'),
      check('Under 2.5 market', offered(odds.under25), fmt(odds.under25), 'available')
    ];
    const pass = checks.every(item => item.pass);
    routes.push(routeResult({
      id: 'TWO_WEAK_UNDER_2_5',
      name: 'Two weak teams',
      family: 'UNDER',
      pass,
      checks,
      output: pass ? selection({
        routeId: 'TWO_WEAK_UNDER_2_5', routeName: 'Two weak teams', market: 'UNDER_2_5', label: 'Under 2.5 Goals', odds: odds.under25,
        reasons: [`Home venue PPG is ${homePpg.toFixed(2)}.`, `Away venue PPG is ${awayPpg.toFixed(2)}.`, `The draw price is ${fmt(draw)}, supporting a compressed game.`]
      }) : null,
      explanation: 'Both teams earn fewer than one point per relevant venue match and the draw price supports a low-event game.'
    }));
  }

  // 2. Both teams above 1.50 PPG and a high draw price.
  {
    const checks = [
      check('Home venue PPG', homePpg > 1.5, homePpg.toFixed(2), '> 1.50'),
      check('Away venue PPG', awayPpg > 1.5, awayPpg.toFixed(2), '> 1.50'),
      check('Draw price', draw >= 3.70, fmt(draw), '≥ 3.70'),
      check('BTTS Yes market', offered(odds.bttsYes), fmt(odds.bttsYes), 'available')
    ];
    const pass = checks.every(item => item.pass);
    routes.push(routeResult({
      id: 'TWO_STRONG_BTTS',
      name: 'Two strong teams',
      family: 'BTTS',
      pass,
      checks,
      output: pass ? selection({
        routeId: 'TWO_STRONG_BTTS', routeName: 'Two strong teams', market: 'BTTS_YES', label: 'Both Teams to Score — Yes', odds: odds.bttsYes,
        reasons: [`Home venue PPG is ${homePpg.toFixed(2)}.`, `Away venue PPG is ${awayPpg.toFixed(2)}.`, `The draw price is ${fmt(draw)}, allowing a decisive match with goals from both sides.`]
      }) : null,
      explanation: 'Both teams have strong venue PPG and the draw price supports both teams scoring.'
    }));
  }

  // 3. Extreme PPG advantage in either direction.
  {
    let strongerSide = null;
    let strongerPpg = null;
    let weakerPpg = null;
    if (homePpg >= 2.5 && awayPpg < 1) {
      strongerSide = 'home'; strongerPpg = homePpg; weakerPpg = awayPpg;
    } else if (awayPpg >= 2.5 && homePpg < 1) {
      strongerSide = 'away'; strongerPpg = awayPpg; weakerPpg = homePpg;
    }
    if (strongerSide) {
      const useDoubleChance = draw <= 3.10;
      const target = sideOutput(strongerSide, odds, useDoubleChance ? 'DOUBLE_CHANCE' : 'WIN');
      const checks = [
        check('Stronger team PPG', strongerPpg >= 2.5, strongerPpg.toFixed(2), '≥ 2.50'),
        check('Opponent PPG', weakerPpg < 1, weakerPpg.toFixed(2), '< 1.00'),
        check(useDoubleChance ? 'Stronger-team double chance' : 'Stronger-team win market', offered(target.odds), fmt(target.odds), 'available')
      ];
      const pass = checks.every(item => item.pass);
      routes.push(routeResult({
        id: 'EXTREME_PPG_ADVANTAGE',
        name: 'Extreme PPG advantage',
        family: 'RESULT',
        pass,
        checks,
        output: pass ? selection({
          routeId: 'EXTREME_PPG_ADVANTAGE', routeName: 'Extreme PPG advantage', market: target.market, label: target.label, odds: target.odds,
          decision: useDoubleChance ? 'SAFER' : 'FIRE',
          reasons: [`The stronger side has ${strongerPpg.toFixed(2)} venue PPG.`, `The opponent has only ${weakerPpg.toFixed(2)} venue PPG.`, useDoubleChance ? `The draw price is ${fmt(draw)}, so the engine protects the stronger side with double chance.` : `The draw price is ${fmt(draw)}, so the engine takes the stronger side to win.`]
        }) : null,
        explanation: useDoubleChance
          ? 'The PPG gap is extreme, but the compressed draw price calls for double-chance protection.'
          : 'The PPG gap is extreme and the draw price supports a straight result.'
      }));
    }
  }

  // 4. Weak away team against a credible home team.
  {
    const baseRoute = awayPpg < 1 && homePpg >= 1.5;
    let target = null;
    let decision = 'FIRE';
    let drawRule = null;
    if (baseRoute && draw > 3.50) {
      target = sideOutput('home', odds, 'WIN');
      drawRule = '> 3.50';
    } else if (baseRoute && draw <= 3.10) {
      target = sideOutput('home', odds, 'DOUBLE_CHANCE');
      decision = 'SAFER';
      drawRule = '≤ 3.10';
    }
    const checks = [
      check('Away venue PPG', awayPpg < 1, awayPpg.toFixed(2), '< 1.00'),
      check('Home venue PPG', homePpg >= 1.5, homePpg.toFixed(2), '≥ 1.50'),
      check('Draw zone', Boolean(drawRule), fmt(draw), '> 3.50 for Home Win or ≤ 3.10 for 1X'),
      check('Selected home market', target ? offered(target.odds) : false, target ? fmt(target.odds) : '—', 'available')
    ];
    const pass = checks.every(item => item.pass);
    routes.push(routeResult({
      id: 'WEAK_AWAY_TEAM',
      name: 'Weak away team',
      family: 'RESULT',
      pass,
      checks,
      output: pass ? selection({
        routeId: 'WEAK_AWAY_TEAM', routeName: 'Weak away team', market: target.market, label: target.label, odds: target.odds, decision,
        reasons: [`The away side has ${awayPpg.toFixed(2)} away PPG.`, `The home side has ${homePpg.toFixed(2)} home PPG.`, decision === 'SAFER' ? `The draw price is ${fmt(draw)}, so the home side receives 1X protection.` : `The draw price is ${fmt(draw)}, supporting a home win.`]
      }) : null,
      explanation: pass
        ? (decision === 'SAFER' ? 'The away side is weak, but the low draw price requires 1X protection.' : 'The away side is weak and the draw price supports a home win.')
        : (baseRoute && draw > 3.10 && draw <= 3.50 ? 'The match sits in the 3.11–3.50 draw-price no-pick zone.' : 'The weak-away route did not qualify.')
    }));
  }

  const orderedIds = ['TWO_WEAK_UNDER_2_5', 'TWO_STRONG_BTTS', 'EXTREME_PPG_ADVANTAGE', 'WEAK_AWAY_TEAM'];
  const qualified = orderedIds.map(id => routes.find(route => route.id === id)).filter(route => route?.selection);
  const best = qualified[0] || null;

  return {
    ...base,
    routes,
    decision: best?.selection?.decision || 'NO_SIGNAL',
    selection: best?.selection || null,
    explanation: best?.explanation || 'Both teams fall outside the defined PPG routes, the draw price is in a no-pick zone, or the required market is unavailable.'
  };
}

export function ppgRouteSummary(result = {}) {
  return {
    decision: result.decision || 'NO_SIGNAL',
    selection: result.selection || null,
    home: result.home || null,
    away: result.away || null,
    closest: (result.routes || []).find(route => route.selection) || (result.routes || [])[0] || null,
    explanation: result.explanation || null
  };
}
