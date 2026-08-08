import { round } from '../lib/utils.mjs';

const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
const offered = value => num(value) !== null && num(value) > 1;
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const fmt = value => offered(value) ? num(value).toFixed(2) : '—';

function normalizeSplit(split) {
  if (!split || typeof split !== 'object') return null;
  const played = Math.max(0, Math.min(5, Number(split.played) || 0));
  const wins = Number(split.wins) || 0;
  const draws = Number(split.draws) || 0;
  const losses = Number(split.losses) || 0;
  const points = Number.isFinite(Number(split.points)) ? Number(split.points) : wins * 3 + draws;
  const recent = split.recent3 && typeof split.recent3 === 'object' ? split.recent3 : {};
  const form = (Array.isArray(split.form) ? split.form : String(split.form || '').toUpperCase().match(/[WDL]/g) || [])
    .map(value => String(value).toUpperCase()).filter(value => ['W', 'D', 'L'].includes(value)).slice(0, 5);
  const recentForm = form.slice(0, 3);
  const recentPoints = recentForm.reduce((sum, result) => sum + (result === 'W' ? 3 : result === 'D' ? 1 : 0), 0);
  return {
    played,
    form,
    wins,
    draws,
    losses,
    points,
    ppg: num(split.ppg) ?? round(points / Math.max(1, played), 2),
    goalsForAvg: num(split.goalsForAvg) ?? 0,
    goalsAgainstAvg: num(split.goalsAgainstAvg) ?? 0,
    goalsPerMatch: num(split.goalsPerMatch) ?? round((num(split.goalsForAvg) || 0) + (num(split.goalsAgainstAvg) || 0), 2),
    scoredIn: Number(split.scoredIn) || 0,
    concededIn: Number(split.concededIn) || 0,
    cleanSheets: Number(split.cleanSheets) || 0,
    failedToScore: Number(split.failedToScore) || 0,
    over15: Number(split.over15) || 0,
    over25: Number(split.over25) || 0,
    under25: Number(split.under25) || 0,
    under35: Number(split.under35) || 0,
    btts: Number(split.btts) || 0,
    scored2Plus: Number(split.scored2Plus) || 0,
    conceded2Plus: Number(split.conceded2Plus) || 0,
    recent3: {
      played: Math.min(3, Number(recent.played) || recentForm.length),
      points: Number.isFinite(Number(recent.points)) ? Number(recent.points) : recentPoints,
      wins: Number(recent.wins) || recentForm.filter(value => value === 'W').length,
      losses: Number(recent.losses) || recentForm.filter(value => value === 'L').length,
      scoredIn: Number(recent.scoredIn) || 0,
      concededIn: Number(recent.concededIn) || 0,
      over15: Number(recent.over15) || 0,
      over25: Number(recent.over25) || 0,
      under35: Number(recent.under35) || 0,
      btts: Number(recent.btts) || 0
    },
    htft: split.htft && typeof split.htft === 'object' ? split.htft : {},
    halfTimeAvailable: Number(split.halfTimeAvailable) || 0
  };
}

function check(label, family, weight, pass, actual, rule, contradiction = false) {
  return { label, family, weight, pass: Boolean(pass), actual, rule, contradiction: Boolean(contradiction) };
}

function scoreCandidate(checks, blockers = []) {
  const applicable = checks.filter(item => item.weight > 0);
  const totalWeight = applicable.reduce((sum, item) => sum + item.weight, 0) || 1;
  const support = applicable.filter(item => item.pass && !item.contradiction).reduce((sum, item) => sum + item.weight, 0);
  const contradiction = applicable.filter(item => item.pass && item.contradiction).reduce((sum, item) => sum + item.weight, 0);
  const raw = support / totalWeight * 100 - contradiction * 0.8 - blockers.filter(Boolean).length * 12;
  const families = new Set(applicable.filter(item => item.pass && !item.contradiction && item.family !== 'MARKET').map(item => item.family));
  return { score: Math.round(clamp(raw)), familyCount: families.size, supportWeight: support, contradictionWeight: contradiction };
}

function candidate({ id, name, direction, checks, target, safer = null, blockers = [], explanation }) {
  const scored = scoreCandidate(checks, blockers);
  const hardBlockers = blockers.filter(Boolean);
  const directQualified = offered(target?.odds) && scored.familyCount >= 4 && scored.score >= 82 && hardBlockers.length === 0;
  const saferQualified = !directQualified && offered(safer?.odds) && scored.familyCount >= 3 && scored.score >= 72 && hardBlockers.length === 0;
  const selected = directQualified ? target : saferQualified ? safer : null;
  const decision = directQualified ? 'FIRE' : saferQualified ? 'SAFER' : 'NO_SIGNAL';
  return {
    id,
    name,
    direction,
    score: scored.score,
    familyCount: scored.familyCount,
    checks,
    blockers: hardBlockers,
    selection: selected ? {
      routeId: id,
      routeName: name,
      market: selected.market,
      label: selected.label,
      odds: num(selected.odds),
      decision,
      grade: scored.score >= 90 ? 'A+' : scored.score >= 82 ? 'A' : 'B+',
      score: scored.score,
      evidenceFamilies: scored.familyCount,
      reasons: checks.filter(item => item.pass && !item.contradiction && item.family !== 'MARKET').sort((a, b) => b.weight - a.weight).slice(0, 5).map(item => `${item.label}: ${item.actual}.`),
      warnings: hardBlockers
    } : null,
    explanation
  };
}

function resultMarkets(side, odds) {
  if (side === 'home') return {
    direct: { market: 'HOME_WIN', label: 'Home Team to Win', odds: odds.homeWin },
    safer: { market: 'DOUBLE_CHANCE_1X', label: 'Home or Draw (1X)', odds: odds.doubleChance1X }
  };
  return {
    direct: { market: 'AWAY_WIN', label: 'Away Team to Win', odds: odds.awayWin },
    safer: { market: 'DOUBLE_CHANCE_X2', label: 'Draw or Away (X2)', odds: odds.doubleChanceX2 }
  };
}

function choose(candidates) {
  const qualified = candidates.filter(item => item.selection);
  const opposite = [
    ['HOME_RESULT', 'AWAY_RESULT'],
    ['GOALS_OVER', 'GOALS_UNDER'],
    ['BTTS_YES', 'BTTS_NO']
  ];
  for (const [left, right] of opposite) {
    const a = qualified.filter(item => item.direction === left).sort((x, y) => y.score - x.score)[0];
    const b = qualified.filter(item => item.direction === right).sort((x, y) => y.score - x.score)[0];
    if (a && b && Math.abs(a.score - b.score) <= 8) {
      return { conflict: true, reason: `${a.name} and ${b.name} have nearly equal composite support.` };
    }
  }
  const priority = { APEX_HOME_EDGE: 100, APEX_AWAY_EDGE: 100, APEX_OVER: 95, APEX_UNDER: 95, APEX_BTTS_YES: 90, APEX_BTTS_NO: 90 };
  return { conflict: false, best: qualified.sort((a, b) => b.score - a.score || (priority[b.id] || 0) - (priority[a.id] || 0) || Number(a.selection?.odds || 99) - Number(b.selection?.odds || 99))[0] || null };
}

export function analyzeApexIntelligence(fixture = {}, stats = null) {
  const odds = fixture.odds || {};
  const home = normalizeSplit(stats?.homeSplit || stats?.home || fixture?.stats?.homeSplit);
  const away = normalizeSplit(stats?.awaySplit || stats?.away || fixture?.stats?.awaySplit);
  const base = {
    engine: 'APEX_INTELLIGENCE',
    home,
    away,
    candidates: [],
    decision: 'NO_SIGNAL',
    selection: null,
    dataQuality: 0,
    explanation: 'No Apex route qualified.'
  };
  if (!home || !away || home.played < 5 || away.played < 5) {
    return {
      ...base,
      decision: 'WAITING',
      explanation: `Apex requires five verified home matches and five verified away matches. Home ${home?.played || 0}/5; away ${away?.played || 0}/5.`
    };
  }

  const dataQuality = Math.round(clamp(60
    + (home.form.length >= 5 && away.form.length >= 5 ? 10 : 0)
    + (home.goalsForAvg >= 0 && away.goalsForAvg >= 0 ? 10 : 0)
    + (home.recent3.played >= 3 && away.recent3.played >= 3 ? 10 : 0)
    + (Object.keys(odds).filter(key => offered(odds[key])).length >= 5 ? 10 : 0)));

  const ppgGap = round(home.ppg - away.ppg, 2);
  const pointsGap = home.points - away.points;
  const recentGap = home.recent3.points - away.recent3.points;
  const homeAttackEdge = round(home.goalsForAvg + away.goalsAgainstAvg - (away.goalsForAvg + home.goalsAgainstAvg), 2);
  const awayAttackEdge = round(away.goalsForAvg + home.goalsAgainstAvg - (home.goalsForAvg + away.goalsAgainstAvg), 2);
  const candidates = [];

  const homeMarket = resultMarkets('home', odds);
  candidates.push(candidate({
    id: 'APEX_HOME_EDGE',
    name: 'Home composite superiority',
    direction: 'HOME_RESULT',
    target: homeMarket.direct,
    safer: homeMarket.safer,
    blockers: [away.ppg >= 2.0 && away.wins >= 3 ? 'The away team carries an opposing elite-strength profile.' : null, home.failedToScore >= 3 ? 'The home attack has too many blanks.' : null],
    checks: [
      check('Venue strength gap', 'STRENGTH', 15, ppgGap >= 0.65, `${home.ppg.toFixed(2)} vs ${away.ppg.toFixed(2)}`, 'gap ≥ 0.65'),
      check('Five-match points gap', 'FORM', 12, pointsGap >= 4, `${home.points} vs ${away.points}`, 'gap ≥ 4'),
      check('Recent-three acceleration', 'MOMENTUM', 12, recentGap >= 3, `${home.recent3.points} vs ${away.recent3.points}`, 'gap ≥ 3'),
      check('Attack-versus-defence edge', 'ATTACK', 13, home.goalsForAvg >= 1.35 && away.goalsAgainstAvg >= 1.15 && homeAttackEdge >= 0.45, `${home.goalsForAvg.toFixed(2)} GF · ${away.goalsAgainstAvg.toFixed(2)} GA`, 'credible positive mismatch'),
      check('Defensive control', 'DEFENCE', 11, home.goalsAgainstAvg <= 1.20 && (home.cleanSheets >= 2 || away.failedToScore >= 2), `${home.goalsAgainstAvg.toFixed(2)} GA · ${home.cleanSheets} CS`, 'GA ≤ 1.20 plus control'),
      check('Opponent vulnerability', 'OPPOSITION', 10, away.losses >= 3 || away.recent3.losses >= 2, `${away.losses}/5 losses`, '≥ 3/5 or 2/3'),
      check('Home result market', 'MARKET', 9, offered(homeMarket.direct.odds), fmt(homeMarket.direct.odds), 'available'),
      check('Draw-price room', 'PRICE', 8, num(odds.draw) >= 3.10 || num(odds.homeWin) <= 1.85, fmt(odds.draw), 'draw ≥ 3.10 or strong favourite'),
      check('Away-strength contradiction', 'CONTRADICTION', 12, away.ppg >= 1.8 && away.scoredIn >= 4, `${away.ppg.toFixed(2)} PPG`, 'opposing strength', true)
    ],
    explanation: 'Apex combines relative strength, current form, recent acceleration, attack-versus-defence fit, opponent weakness and price confirmation.'
  }));

  const awayMarket = resultMarkets('away', odds);
  candidates.push(candidate({
    id: 'APEX_AWAY_EDGE',
    name: 'Away composite superiority',
    direction: 'AWAY_RESULT',
    target: awayMarket.direct,
    safer: awayMarket.safer,
    blockers: [home.ppg >= 2.0 && home.wins >= 3 ? 'The home team carries an opposing elite-strength profile.' : null, away.failedToScore >= 3 ? 'The away attack has too many blanks.' : null],
    checks: [
      check('Venue strength gap', 'STRENGTH', 15, ppgGap <= -0.65, `${away.ppg.toFixed(2)} vs ${home.ppg.toFixed(2)}`, 'away gap ≥ 0.65'),
      check('Five-match points gap', 'FORM', 12, pointsGap <= -4, `${away.points} vs ${home.points}`, 'away gap ≥ 4'),
      check('Recent-three acceleration', 'MOMENTUM', 12, recentGap <= -3, `${away.recent3.points} vs ${home.recent3.points}`, 'away gap ≥ 3'),
      check('Attack-versus-defence edge', 'ATTACK', 13, away.goalsForAvg >= 1.35 && home.goalsAgainstAvg >= 1.15 && awayAttackEdge >= 0.45, `${away.goalsForAvg.toFixed(2)} GF · ${home.goalsAgainstAvg.toFixed(2)} GA`, 'credible positive mismatch'),
      check('Defensive control', 'DEFENCE', 11, away.goalsAgainstAvg <= 1.20 && (away.cleanSheets >= 2 || home.failedToScore >= 2), `${away.goalsAgainstAvg.toFixed(2)} GA · ${away.cleanSheets} CS`, 'GA ≤ 1.20 plus control'),
      check('Opponent vulnerability', 'OPPOSITION', 10, home.losses >= 3 || home.recent3.losses >= 2, `${home.losses}/5 losses`, '≥ 3/5 or 2/3'),
      check('Away result market', 'MARKET', 9, offered(awayMarket.direct.odds), fmt(awayMarket.direct.odds), 'available'),
      check('Draw-price room', 'PRICE', 8, num(odds.draw) >= 3.10 || num(odds.awayWin) <= 1.85, fmt(odds.draw), 'draw ≥ 3.10 or strong favourite'),
      check('Home-strength contradiction', 'CONTRADICTION', 12, home.ppg >= 1.8 && home.scoredIn >= 4, `${home.ppg.toFixed(2)} PPG`, 'opposing strength', true)
    ],
    explanation: 'Apex combines relative away strength, recent acceleration, attack-versus-defence fit, home vulnerability and price confirmation.'
  }));

  const totalOver25 = home.over25 + away.over25;
  const totalOver15 = home.over15 + away.over15;
  const recentOver = home.recent3.over25 + away.recent3.over25;
  const overTarget = totalOver25 >= 7 && recentOver >= 4
    ? { market: 'OVER_2_5', label: 'Over 2.5 Goals', odds: odds.over25 }
    : { market: 'OVER_1_5', label: 'Over 1.5 Goals', odds: odds.over15 };
  candidates.push(candidate({
    id: 'APEX_OVER',
    name: 'Composite attacking game',
    direction: 'GOALS_OVER',
    target: overTarget,
    safer: { market: 'OVER_1_5', label: 'Over 1.5 Goals', odds: odds.over15 },
    blockers: [home.failedToScore + away.failedToScore >= 5 ? 'The two attacks carry too many blanks.' : null],
    checks: [
      check('Long-run Over 1.5', 'TOTALS', 14, totalOver15 >= 8, `${totalOver15}/10`, '≥ 8/10'),
      check('Long-run Over 2.5', 'TOTALS_DEPTH', 11, totalOver25 >= 6, `${totalOver25}/10`, '≥ 6/10'),
      check('Recent goal acceleration', 'MOMENTUM', 12, recentOver >= 4, `${recentOver}/6`, '≥ 4/6'),
      check('Combined scoring continuity', 'ATTACK', 13, home.scoredIn + away.scoredIn >= 8, `${home.scoredIn + away.scoredIn}/10`, '≥ 8/10'),
      check('Combined defensive exposure', 'DEFENCE', 13, home.concededIn + away.concededIn >= 8, `${home.concededIn + away.concededIn}/10`, '≥ 8/10'),
      check('Goal-production average', 'PRODUCTION', 12, home.goalsPerMatch + away.goalsPerMatch >= 5.2, `${(home.goalsPerMatch + away.goalsPerMatch).toFixed(2)}`, 'combined ≥ 5.20'),
      check('Selected over market', 'MARKET', 10, offered(overTarget.odds), fmt(overTarget.odds), 'available'),
      check('Strong under contradiction', 'CONTRADICTION', 12, offered(odds.under25) && num(odds.under25) <= 1.45, fmt(odds.under25), 'Under 2.5 strongly priced', true)
    ],
    explanation: 'Apex requires long-run totals, recent acceleration, scoring continuity, defensive exposure and the offered market to align.'
  }));

  const totalUnder35 = home.under35 + away.under35;
  const totalUnder25 = home.under25 + away.under25;
  const recentUnder = home.recent3.under35 + away.recent3.under35;
  const underTarget = totalUnder25 >= 7
    ? { market: 'UNDER_2_5', label: 'Under 2.5 Goals', odds: odds.under25 }
    : { market: 'UNDER_3_5', label: 'Under 3.5 Goals', odds: odds.under35 };
  candidates.push(candidate({
    id: 'APEX_UNDER',
    name: 'Composite controlled game',
    direction: 'GOALS_UNDER',
    target: underTarget,
    safer: { market: 'UNDER_3_5', label: 'Under 3.5 Goals', odds: odds.under35 },
    blockers: [home.over25 + away.over25 >= 8 ? 'The two venue profiles contain too many high-scoring matches.' : null],
    checks: [
      check('Long-run Under 3.5', 'TOTALS', 14, totalUnder35 >= 9, `${totalUnder35}/10`, '≥ 9/10'),
      check('Long-run Under 2.5', 'TOTALS_DEPTH', 11, totalUnder25 >= 6, `${totalUnder25}/10`, '≥ 6/10'),
      check('Recent control', 'MOMENTUM', 12, recentUnder >= 5, `${recentUnder}/6`, '≥ 5/6'),
      check('Low combined production', 'ATTACK', 12, home.goalsForAvg + away.goalsForAvg <= 2.35, `${(home.goalsForAvg + away.goalsForAvg).toFixed(2)} GF`, '≤ 2.35'),
      check('Blanks and clean sheets', 'DEFENCE', 13, home.failedToScore + away.failedToScore + home.cleanSheets + away.cleanSheets >= 5, `${home.failedToScore + away.failedToScore + home.cleanSheets + away.cleanSheets}`, '≥ 5'),
      check('Low-event match average', 'PRODUCTION', 12, home.goalsPerMatch + away.goalsPerMatch <= 4.8, `${(home.goalsPerMatch + away.goalsPerMatch).toFixed(2)}`, 'combined ≤ 4.80'),
      check('Selected under market', 'MARKET', 10, offered(underTarget.odds), fmt(underTarget.odds), 'available'),
      check('Strong BTTS contradiction', 'CONTRADICTION', 12, offered(odds.bttsYes) && num(odds.bttsYes) <= 1.55 && home.btts + away.btts >= 7, fmt(odds.bttsYes), 'BTTS Yes strongly priced', true)
    ],
    explanation: 'Apex requires repeated low totals, recent control, low production, defensive evidence and the offered market to align.'
  }));

  candidates.push(candidate({
    id: 'APEX_BTTS_YES',
    name: 'Two-way scoring profile',
    direction: 'BTTS_YES',
    target: { market: 'BTTS_YES', label: 'Both Teams to Score — Yes', odds: odds.bttsYes },
    safer: { market: 'OVER_1_5', label: 'Over 1.5 Goals', odds: odds.over15 },
    blockers: [home.failedToScore >= 3 || away.failedToScore >= 3 ? 'One side has failed to score too often.' : null],
    checks: [
      check('Home scoring continuity', 'HOME_ATTACK', 12, home.scoredIn >= 4, `${home.scoredIn}/5`, '≥ 4/5'),
      check('Away scoring continuity', 'AWAY_ATTACK', 12, away.scoredIn >= 4, `${away.scoredIn}/5`, '≥ 4/5'),
      check('Home defensive exposure', 'HOME_DEFENCE', 11, home.concededIn >= 4, `${home.concededIn}/5`, '≥ 4/5'),
      check('Away defensive exposure', 'AWAY_DEFENCE', 11, away.concededIn >= 4, `${away.concededIn}/5`, '≥ 4/5'),
      check('BTTS history', 'TOTALS', 13, home.btts + away.btts >= 7, `${home.btts + away.btts}/10`, '≥ 7/10'),
      check('Recent BTTS continuation', 'MOMENTUM', 12, home.recent3.btts + away.recent3.btts >= 4, `${home.recent3.btts + away.recent3.btts}/6`, '≥ 4/6'),
      check('BTTS Yes market', 'MARKET', 10, offered(odds.bttsYes), fmt(odds.bttsYes), 'available')
    ],
    explanation: 'Both attacks and both defensive profiles must independently support two-way scoring.'
  }));

  candidates.push(candidate({
    id: 'APEX_BTTS_NO',
    name: 'One-side scoring suppression',
    direction: 'BTTS_NO',
    target: { market: 'BTTS_NO', label: 'Both Teams to Score — No', odds: odds.bttsNo },
    safer: { market: 'UNDER_3_5', label: 'Under 3.5 Goals', odds: odds.under35 },
    blockers: [home.scoredIn >= 5 && away.scoredIn >= 5 ? 'Both attacks have perfect scoring continuity.' : null],
    checks: [
      check('Repeated scoring blanks', 'ATTACK', 13, home.failedToScore + away.failedToScore >= 3, `${home.failedToScore + away.failedToScore}/10`, '≥ 3/10'),
      check('Clean-sheet support', 'DEFENCE', 13, home.cleanSheets + away.cleanSheets >= 3, `${home.cleanSheets + away.cleanSheets}/10`, '≥ 3/10'),
      check('Low BTTS history', 'TOTALS', 13, home.btts + away.btts <= 4, `${home.btts + away.btts}/10`, '≤ 4/10'),
      check('Under 3.5 control', 'CONTROL', 12, totalUnder35 >= 8, `${totalUnder35}/10`, '≥ 8/10'),
      check('Weakest attack output', 'OPPOSITION', 12, Math.min(home.goalsForAvg, away.goalsForAvg) <= 1.0, `${Math.min(home.goalsForAvg, away.goalsForAvg).toFixed(2)} GF`, '≤ 1.00'),
      check('Recent low-BTTS continuation', 'MOMENTUM', 11, home.recent3.btts + away.recent3.btts <= 2, `${home.recent3.btts + away.recent3.btts}/6`, '≤ 2/6'),
      check('BTTS No market', 'MARKET', 10, offered(odds.bttsNo), fmt(odds.bttsNo), 'available')
    ],
    explanation: 'Apex looks for repeated blanks, clean-sheet support, low BTTS frequency, recent control and a weak attacking side.'
  }));

  const selected = choose(candidates);
  if (selected.conflict) {
    return { ...base, dataQuality, candidates, decision: 'CONFLICT', explanation: selected.reason };
  }
  const best = selected.best;
  return {
    ...base,
    dataQuality,
    candidates,
    decision: best?.selection?.decision || 'NO_SIGNAL',
    selection: best?.selection || null,
    explanation: best?.explanation || 'No route reached the required composite score, evidence-family count and market confirmation.'
  };
}

export function apexIntelligenceSummary(result = {}) {
  return {
    decision: result.decision || 'NO_SIGNAL',
    selection: result.selection || null,
    home: result.home || null,
    away: result.away || null,
    dataQuality: result.dataQuality || 0,
    closest: (result.candidates || []).filter(item => item).sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0] || null,
    explanation: result.explanation || null
  };
}
