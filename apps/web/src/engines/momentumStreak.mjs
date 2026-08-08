import { round } from '../lib/utils.mjs';

const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
const offered = value => num(value) !== null && num(value) > 1;
const fmt = value => offered(value) ? num(value).toFixed(2) : '—';

function normalizeForm(value) {
  return (Array.isArray(value) ? value : String(value || '').toUpperCase().match(/[WDL]/g) || [])
    .map(item => String(item).toUpperCase())
    .filter(item => ['W', 'D', 'L'].includes(item))
    .slice(0, 5);
}

function normalizeSplit(split) {
  if (!split || typeof split !== 'object') return null;
  const played = Math.max(0, Math.min(5, Number(split.played) || 0));
  const form = normalizeForm(split.form);
  const wins = Number(split.wins) || form.filter(value => value === 'W').length;
  const draws = Number(split.draws) || form.filter(value => value === 'D').length;
  const losses = Number(split.losses) || form.filter(value => value === 'L').length;
  const points = Number.isFinite(Number(split.points)) ? Number(split.points) : wins * 3 + draws;
  return {
    played,
    form,
    wins,
    draws,
    losses,
    points,
    ppg: Number.isFinite(Number(split.ppg)) ? Number(split.ppg) : played ? round(points / played, 2) : null,
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
    goalsForAvg: Number(split.goalsForAvg) || 0,
    goalsAgainstAvg: Number(split.goalsAgainstAvg) || 0,
    recent3: split.recent3 && typeof split.recent3 === 'object' ? split.recent3 : {}
  };
}

function streak(form, predicate) {
  let count = 0;
  for (const result of form || []) {
    if (!predicate(result)) break;
    count += 1;
  }
  return count;
}

function streakProfile(split) {
  return {
    wins: streak(split.form, value => value === 'W'),
    losses: streak(split.form, value => value === 'L'),
    unbeaten: streak(split.form, value => value !== 'L'),
    winless: streak(split.form, value => value !== 'W')
  };
}

function check(label, pass, actual, rule, family) {
  return { label, pass: Boolean(pass), actual, rule, family };
}

function buildCandidate({ id, name, direction, checks, target, safer = null, blockers = [], note }) {
  const activeChecks = checks.filter(Boolean);
  const passed = activeChecks.filter(item => item.pass).length;
  const families = new Set(activeChecks.filter(item => item.pass).map(item => item.family).filter(Boolean));
  const failures = activeChecks.filter(item => !item.pass);
  const activeBlockers = blockers.filter(Boolean);
  const score = round((passed / Math.max(1, activeChecks.length)) * 100, 1);
  let decision = 'REJECT';
  let selected = null;

  if (!activeBlockers.length && families.size >= 2 && score >= 82 && offered(target?.odds)) {
    decision = 'FIRE';
    selected = { ...target, decision: 'FIRE' };
  } else if (!activeBlockers.length && families.size >= 2 && score >= 70 && offered(safer?.odds)) {
    decision = 'SAFER';
    selected = { ...safer, decision: 'SAFER', downgradedFrom: target?.market || null };
  }

  const reasons = [
    note,
    ...activeChecks.filter(item => item.pass).slice(0, 5).map(item => `${item.label}: ${item.actual}.`),
    ...failures.slice(0, 3).map(item => `${item.label} missed: ${item.actual}; required ${item.rule}.`),
    ...activeBlockers.map(item => `Blocked: ${item}`)
  ].filter(Boolean);

  if (selected) {
    selected.routeId = id;
    selected.routeName = name;
    selected.score = score;
    selected.grade = score >= 92 ? 'A+' : score >= 86 ? 'A' : decision === 'FIRE' ? 'B+' : 'SAFER';
    selected.reasons = reasons;
    selected.streakFamilies = [...families];
  }

  return {
    id,
    name,
    direction,
    decision,
    score,
    checks: activeChecks,
    failures,
    blockers: activeBlockers,
    target,
    safer,
    selection: selected,
    reasons,
    streakFamilies: [...families]
  };
}

function sideMarkets(side, odds = {}) {
  if (side === 'home') return {
    win: { market: 'HOME_WIN', label: 'Home Team to Win', odds: num(odds.homeWin) },
    safer: { market: 'DOUBLE_CHANCE_1X', label: 'Home or Draw (1X)', odds: num(odds.doubleChance1X) }
  };
  return {
    win: { market: 'AWAY_WIN', label: 'Away Team to Win', odds: num(odds.awayWin) },
    safer: { market: 'DOUBLE_CHANCE_X2', label: 'Draw or Away (X2)', odds: num(odds.doubleChanceX2) }
  };
}

function choose(candidates) {
  const qualified = candidates.filter(item => item.selection);
  const directions = new Map();
  for (const item of qualified) {
    if (!directions.has(item.direction)) directions.set(item.direction, []);
    directions.get(item.direction).push(item);
  }
  const oppositePairs = [
    ['HOME_RESULT', 'AWAY_RESULT'],
    ['GOALS_OVER', 'GOALS_UNDER'],
    ['BTTS_YES', 'BTTS_NO']
  ];
  for (const [left, right] of oppositePairs) {
    const a = directions.get(left)?.sort((x, y) => y.score - x.score)[0];
    const b = directions.get(right)?.sort((x, y) => y.score - x.score)[0];
    if (a && b && Math.abs(a.score - b.score) <= 7) {
      return { conflict: true, reason: `${a.selection.label} and ${b.selection.label} have almost equal streak support.` };
    }
  }
  const priority = {
    MOM_HOME_DOMINANCE: 100,
    MOM_AWAY_DOMINANCE: 100,
    MOM_BTTS_WAVE: 95,
    MOM_BTTS_DRY: 95,
    MOM_GOAL_WAVE: 90,
    MOM_GOAL_DROUGHT: 90
  };
  const best = qualified.sort((a, b) => b.score - a.score || (priority[b.id] || 0) - (priority[a.id] || 0) || Number(a.selection?.odds || 99) - Number(b.selection?.odds || 99))[0] || null;
  return { conflict: false, best };
}

export function analyzeMomentumStreak(fixture = {}, stats = null) {
  const odds = fixture.odds || {};
  const home = normalizeSplit(stats?.homeSplit || stats?.home || fixture?.stats?.homeSplit);
  const away = normalizeSplit(stats?.awaySplit || stats?.away || fixture?.stats?.awaySplit);
  const base = {
    engine: 'MOMENTUM_STREAK',
    home,
    away,
    candidates: [],
    decision: 'NO_SIGNAL',
    selection: null,
    explanation: 'No momentum or streak route qualified.'
  };
  if (!home || !away || home.played < 5 || away.played < 5) {
    return {
      ...base,
      decision: 'WAITING',
      explanation: `Five home and five away venue matches are required. Home ${home?.played || 0}/5; away ${away?.played || 0}/5.`
    };
  }

  const hs = streakProfile(home);
  const as = streakProfile(away);
  const candidates = [];

  const homeMarkets = sideMarkets('home', odds);
  candidates.push(buildCandidate({
    id: 'MOM_HOME_DOMINANCE',
    name: 'Home momentum dominance',
    direction: 'HOME_RESULT',
    checks: [
      check('Home winning run', hs.wins >= 2 || home.wins >= 4, `${hs.wins} straight / ${home.wins}/5`, '2 straight or 4/5', 'FORM'),
      check('Home unbeaten run', hs.unbeaten >= 4, `${hs.unbeaten} matches`, '≥ 4', 'FORM'),
      check('Away winless run', as.winless >= 3 || away.losses >= 3, `${as.winless} straight / ${away.losses} losses`, '3 straight or 3 losses', 'OPPOSITION'),
      check('Venue strength gap', home.ppg >= 2.0 && away.ppg <= 1.0, `${home.ppg?.toFixed(2)} vs ${away.ppg?.toFixed(2)}`, 'home ≥ 2.00, away ≤ 1.00', 'STRENGTH'),
      check('Home scoring continuity', home.scoredIn >= 4 && away.concededIn >= 4, `${home.scoredIn}/5 scored · ${away.concededIn}/5 conceded`, 'both ≥ 4/5', 'GOALS'),
      check('Home win market', offered(homeMarkets.win.odds), fmt(homeMarkets.win.odds), 'available', 'MARKET')
    ],
    target: homeMarkets.win,
    safer: homeMarkets.safer,
    blockers: [away.wins >= 4 ? 'The away team also has a dominant winning profile.' : null, home.failedToScore >= 2 ? 'The home team failed to score too often.' : null],
    note: 'Home momentum, opponent weakness, venue strength and scoring continuity point in the same direction.'
  }));

  const awayMarkets = sideMarkets('away', odds);
  candidates.push(buildCandidate({
    id: 'MOM_AWAY_DOMINANCE',
    name: 'Away momentum dominance',
    direction: 'AWAY_RESULT',
    checks: [
      check('Away winning run', as.wins >= 2 || away.wins >= 4, `${as.wins} straight / ${away.wins}/5`, '2 straight or 4/5', 'FORM'),
      check('Away unbeaten run', as.unbeaten >= 4, `${as.unbeaten} matches`, '≥ 4', 'FORM'),
      check('Home winless run', hs.winless >= 3 || home.losses >= 3, `${hs.winless} straight / ${home.losses} losses`, '3 straight or 3 losses', 'OPPOSITION'),
      check('Venue strength gap', away.ppg >= 2.0 && home.ppg <= 1.0, `${away.ppg?.toFixed(2)} vs ${home.ppg?.toFixed(2)}`, 'away ≥ 2.00, home ≤ 1.00', 'STRENGTH'),
      check('Away scoring continuity', away.scoredIn >= 4 && home.concededIn >= 4, `${away.scoredIn}/5 scored · ${home.concededIn}/5 conceded`, 'both ≥ 4/5', 'GOALS'),
      check('Away win market', offered(awayMarkets.win.odds), fmt(awayMarkets.win.odds), 'available', 'MARKET')
    ],
    target: awayMarkets.win,
    safer: awayMarkets.safer,
    blockers: [home.wins >= 4 ? 'The home team also has a dominant winning profile.' : null, away.failedToScore >= 2 ? 'The away team failed to score too often.' : null],
    note: 'Away momentum, home weakness, venue strength and scoring continuity point in the same direction.'
  }));

  const combined = {
    over15: home.over15 + away.over15,
    over25: home.over25 + away.over25,
    under25: home.under25 + away.under25,
    under35: home.under35 + away.under35,
    btts: home.btts + away.btts,
    scoredIn: home.scoredIn + away.scoredIn,
    concededIn: home.concededIn + away.concededIn,
    cleanSheets: home.cleanSheets + away.cleanSheets,
    failedToScore: home.failedToScore + away.failedToScore,
    recentOver15: Number(home.recent3?.over15 || 0) + Number(away.recent3?.over15 || 0),
    recentOver25: Number(home.recent3?.over25 || 0) + Number(away.recent3?.over25 || 0),
    recentUnder35: Number(home.recent3?.under35 || 0) + Number(away.recent3?.under35 || 0),
    recentBtts: Number(home.recent3?.btts || 0) + Number(away.recent3?.btts || 0)
  };

  const highGoalTarget = combined.over25 >= 7 && combined.recentOver25 >= 4
    ? { market: 'OVER_2_5', label: 'Over 2.5 Goals', odds: num(odds.over25) }
    : { market: 'OVER_1_5', label: 'Over 1.5 Goals', odds: num(odds.over15) };
  candidates.push(buildCandidate({
    id: 'MOM_GOAL_WAVE',
    name: 'Sustained goal wave',
    direction: 'GOALS_OVER',
    checks: [
      check('Over 1.5 sequence', combined.over15 >= 8, `${combined.over15}/10`, '≥ 8/10', 'LONG_STREAK'),
      check('Recent three-match acceleration', combined.recentOver15 >= 5, `${combined.recentOver15}/6`, '≥ 5/6', 'RECENT_STREAK'),
      check('Both attacks scoring', combined.scoredIn >= 8, `${combined.scoredIn}/10`, '≥ 8/10', 'ATTACK'),
      check('Both defences conceding', combined.concededIn >= 8, `${combined.concededIn}/10`, '≥ 8/10', 'DEFENCE'),
      check('Selected over market', offered(highGoalTarget.odds), fmt(highGoalTarget.odds), 'available', 'MARKET')
    ],
    target: highGoalTarget,
    safer: { market: 'OVER_1_5', label: 'Over 1.5 Goals', odds: num(odds.over15) },
    blockers: [combined.failedToScore >= 5 ? 'Too many recent attacking blanks.' : null, offered(odds.under25) && num(odds.under25) <= 1.40 ? 'Under 2.5 is priced too strongly.' : null],
    note: 'Long-run totals, recent acceleration, attack and defensive vulnerability sustain the same goal wave.'
  }));

  const lowGoalTarget = combined.under25 >= 7
    ? { market: 'UNDER_2_5', label: 'Under 2.5 Goals', odds: num(odds.under25) }
    : { market: 'UNDER_3_5', label: 'Under 3.5 Goals', odds: num(odds.under35) };
  candidates.push(buildCandidate({
    id: 'MOM_GOAL_DROUGHT',
    name: 'Sustained goal drought',
    direction: 'GOALS_UNDER',
    checks: [
      check('Under 3.5 sequence', combined.under35 >= 9, `${combined.under35}/10`, '≥ 9/10', 'LONG_STREAK'),
      check('Recent three-match control', combined.recentUnder35 >= 5, `${combined.recentUnder35}/6`, '≥ 5/6', 'RECENT_STREAK'),
      check('Low Over 2.5 occurrence', combined.over25 <= 3, `${combined.over25}/10`, '≤ 3/10', 'TOTALS'),
      check('Blanks and clean sheets', combined.failedToScore + combined.cleanSheets >= 4, `${combined.failedToScore + combined.cleanSheets}`, '≥ 4', 'DEFENCE'),
      check('Selected under market', offered(lowGoalTarget.odds), fmt(lowGoalTarget.odds), 'available', 'MARKET')
    ],
    target: lowGoalTarget,
    safer: { market: 'UNDER_3_5', label: 'Under 3.5 Goals', odds: num(odds.under35) },
    blockers: [combined.over25 >= 7 ? 'The recent matches contain too many three-goal results.' : null, offered(odds.bttsYes) && num(odds.bttsYes) <= 1.55 ? 'BTTS Yes strongly contradicts a controlled match.' : null],
    note: 'Long-run control, recent control and repeated attacking blanks sustain a low-goal direction.'
  }));

  candidates.push(buildCandidate({
    id: 'MOM_BTTS_WAVE',
    name: 'Both-teams scoring wave',
    direction: 'BTTS_YES',
    checks: [
      check('BTTS sequence', combined.btts >= 8, `${combined.btts}/10`, '≥ 8/10', 'LONG_STREAK'),
      check('Recent BTTS continuation', combined.recentBtts >= 5, `${combined.recentBtts}/6`, '≥ 5/6', 'RECENT_STREAK'),
      check('Scoring continuity', home.scoredIn >= 4 && away.scoredIn >= 4, `${home.scoredIn}/5 · ${away.scoredIn}/5`, 'both ≥ 4/5', 'ATTACK'),
      check('Conceding continuity', home.concededIn >= 4 && away.concededIn >= 4, `${home.concededIn}/5 · ${away.concededIn}/5`, 'both ≥ 4/5', 'DEFENCE'),
      check('BTTS Yes market', offered(odds.bttsYes), fmt(odds.bttsYes), 'available', 'MARKET')
    ],
    target: { market: 'BTTS_YES', label: 'Both Teams to Score — Yes', odds: num(odds.bttsYes) },
    safer: { market: 'OVER_1_5', label: 'Over 1.5 Goals', odds: num(odds.over15) },
    blockers: [home.failedToScore >= 2 || away.failedToScore >= 2 ? 'One team has too many recent scoring blanks.' : null],
    note: 'BTTS is repeating in both long and recent samples while both teams continue to score and concede.'
  }));

  candidates.push(buildCandidate({
    id: 'MOM_BTTS_DRY',
    name: 'One-team blank streak',
    direction: 'BTTS_NO',
    checks: [
      check('Low BTTS sequence', combined.btts <= 2, `${combined.btts}/10`, '≤ 2/10', 'LONG_STREAK'),
      check('Recent BTTS suppression', combined.recentBtts <= 1, `${combined.recentBtts}/6`, '≤ 1/6', 'RECENT_STREAK'),
      check('Failed-to-score pressure', combined.failedToScore >= 3, `${combined.failedToScore}/10`, '≥ 3/10', 'ATTACK'),
      check('Clean-sheet pressure', combined.cleanSheets >= 3, `${combined.cleanSheets}/10`, '≥ 3/10', 'DEFENCE'),
      check('BTTS No market', offered(odds.bttsNo), fmt(odds.bttsNo), 'available', 'MARKET')
    ],
    target: { market: 'BTTS_NO', label: 'Both Teams to Score — No', odds: num(odds.bttsNo) },
    safer: { market: 'UNDER_3_5', label: 'Under 3.5 Goals', odds: num(odds.under35) },
    blockers: [home.scoredIn === 5 && away.scoredIn === 5 ? 'Both teams scored in every venue match.' : null],
    note: 'BTTS suppression, attacking blanks and clean-sheet pressure repeatedly point to one team failing to score.'
  }));

  const chosen = choose(candidates);
  if (chosen.conflict) {
    return {
      ...base,
      home: { ...home, streaks: hs },
      away: { ...away, streaks: as },
      candidates,
      decision: 'CONFLICT',
      explanation: chosen.reason
    };
  }
  if (!chosen.best) {
    return {
      ...base,
      home: { ...home, streaks: hs },
      away: { ...away, streaks: as },
      candidates,
      explanation: 'No route had two independent streak families, sufficient score and an offered market.'
    };
  }
  return {
    ...base,
    home: { ...home, streaks: hs },
    away: { ...away, streaks: as },
    candidates,
    decision: chosen.best.selection.decision,
    selection: chosen.best.selection,
    explanation: chosen.best.reasons[0]
  };
}

export function momentumStreakSummary(result = {}) {
  return {
    decision: result.decision || 'NO_SIGNAL',
    selection: result.selection || null,
    home: result.home || null,
    away: result.away || null,
    closest: (result.candidates || []).find(item => item.selection) || [...(result.candidates || [])].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0] || null,
    explanation: result.explanation || null
  };
}
