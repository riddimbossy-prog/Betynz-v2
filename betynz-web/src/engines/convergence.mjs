import { round } from '../lib/utils.mjs';

const n = value => Number.isFinite(Number(value)) ? Number(value) : null;
const offered = value => n(value) !== null && n(value) > 1;
const fmt = value => offered(value) ? n(value).toFixed(2) : '—';

function normalizeSplit(split) {
  if (!split || typeof split !== 'object') return null;
  const played = Math.max(0, Math.min(5, Number(split.played) || 0));
  const points = Number.isFinite(Number(split.points)) ? Number(split.points) : (Number(split.wins) || 0) * 3 + (Number(split.draws) || 0);
  const goalsForAvg = Number(split.goalsForAvg) || 0;
  const goalsAgainstAvg = Number(split.goalsAgainstAvg) || 0;
  return {
    played,
    points,
    ppg: Number.isFinite(Number(split.ppg)) ? Number(split.ppg) : played ? round(points / played, 2) : null,
    wins: Number(split.wins) || 0,
    draws: Number(split.draws) || 0,
    losses: Number(split.losses) || 0,
    goalsForAvg,
    goalsAgainstAvg,
    goalsPerMatch: Number(split.goalsPerMatch) || round(goalsForAvg + goalsAgainstAvg, 2),
    scoredIn: Number(split.scoredIn) || 0,
    concededIn: Number(split.concededIn) || 0,
    scored2Plus: Number(split.scored2Plus) || 0,
    conceded2Plus: Number(split.conceded2Plus) || 0,
    cleanSheets: Number(split.cleanSheets) || 0,
    failedToScore: Number(split.failedToScore) || 0,
    over15: Number(split.over15) || 0,
    over25: Number(split.over25) || 0,
    under35: Number(split.under35) || 0,
    btts: Number(split.btts) || 0,
    recent3: split.recent3 && typeof split.recent3 === 'object' ? split.recent3 : {}
  };
}

function fair1x2(odds = {}) {
  const home = n(odds.homeWin); const draw = n(odds.draw); const away = n(odds.awayWin);
  if (![home, draw, away].every(offered)) return { available: false, favouriteSide: null, fair: {} };
  const raw = { home: 1 / home, draw: 1 / draw, away: 1 / away };
  const total = raw.home + raw.draw + raw.away;
  const fair = { home: raw.home / total, draw: raw.draw / total, away: raw.away / total };
  const favouriteSide = fair.home > fair.away ? 'home' : fair.away > fair.home ? 'away' : null;
  return {
    available: true,
    favouriteSide,
    fair: { home: round(fair.home * 100, 1), draw: round(fair.draw * 100, 1), away: round(fair.away * 100, 1) },
    gap: round(Math.abs(fair.home - fair.away) * 100, 1),
    overround: round((total - 1) * 100, 2)
  };
}

function check(label, pass, actual, rule, available = true) {
  return { label, pass: Boolean(pass), actual, rule, available: Boolean(available) };
}

function block(name, checks = []) {
  const available = checks.filter(item => item.available !== false);
  const passed = available.filter(item => item.pass).length;
  const score = available.length ? round((passed / available.length) * 25, 1) : 0;
  return { name, checks, passed, total: available.length, score };
}

function sideMarket(side, odds, type) {
  if (type === 'WIN') return side === 'home'
    ? { market: 'HOME_WIN', label: 'Home Team to Win', odds: n(odds.homeWin) }
    : { market: 'AWAY_WIN', label: 'Away Team to Win', odds: n(odds.awayWin) };
  if (type === 'DOUBLE_CHANCE') return side === 'home'
    ? { market: 'DOUBLE_CHANCE_1X', label: 'Home or Draw (1X)', odds: n(odds.doubleChance1X) }
    : { market: 'DOUBLE_CHANCE_X2', label: 'Draw or Away (X2)', odds: n(odds.doubleChanceX2) };
  if (type === 'TEAM_OVER_0_5') return side === 'home'
    ? { market: 'HOME_OVER_0_5', label: 'Home Team Over 0.5 Goals', odds: n(odds.homeOver05) }
    : { market: 'AWAY_OVER_0_5', label: 'Away Team Over 0.5 Goals', odds: n(odds.awayOver05) };
  return { market: null, label: null, odds: null };
}

function candidate({ id, name, family, blocks, target, safer = null, blockers = [], note }) {
  const score = round(blocks.reduce((sum, item) => sum + item.score, 0), 1);
  const supportedBlocks = blocks.filter(item => item.score >= 15).length;
  const activeBlockers = blockers.filter(Boolean);
  let decision = 'REJECT';
  let selected = null;
  if (!activeBlockers.length && supportedBlocks >= 3 && score >= 78 && offered(target?.odds)) {
    decision = 'FIRE';
    selected = { ...target, decision: 'FIRE' };
  } else if (!activeBlockers.length && supportedBlocks >= 3 && score >= 70 && offered(safer?.odds)) {
    decision = 'SAFER';
    selected = { ...safer, decision: 'SAFER', downgradedFrom: target?.market || null };
  }
  const reasons = [
    note,
    ...blocks.map(item => `${item.name}: ${item.score.toFixed(0)}/25 (${item.passed}/${item.total} checks).`),
    ...activeBlockers.map(value => `Blocked: ${value}`)
  ].filter(Boolean);
  if (selected) {
    selected.routeId = id;
    selected.routeName = name;
    selected.score = score;
    selected.grade = score >= 90 ? 'A+' : score >= 85 ? 'A' : score >= 78 ? 'B+' : 'SAFER';
    selected.reasons = reasons;
    selected.supportedBlocks = supportedBlocks;
  }
  return { id, name, family, blocks, score, supportedBlocks, blockers: activeBlockers, target, safer, decision, selection: selected, reasons };
}

function chooseBest(candidates) {
  const qualified = candidates.filter(item => item.selection);
  const byId = id => qualified.find(item => item.id === id) || null;
  const strictPairs = [
    [byId('CONV_OVER_2_5'), byId('CONV_UNDER_2_5')],
    [byId('CONV_BTTS_YES'), byId('CONV_BTTS_NO')]
  ];
  for (const [left, right] of strictPairs) {
    if (left && right && Math.abs(left.score - right.score) <= 5) {
      return { conflict: true, reason: `${left.selection.label} and ${right.selection.label} received almost equal independent support.` };
    }
  }
  const priority = {
    CONV_BTTS_YES: 100,
    CONV_BTTS_NO: 100,
    CONV_STRONGER_TEAM: 95,
    CONV_OVER_2_5: 90,
    CONV_UNDER_2_5: 90,
    CONV_OVER_1_5: 80,
    CONV_UNDER_3_5: 75
  };
  return {
    conflict: false,
    best: qualified.sort((a, b) => {
      const scoreGap = b.score - a.score;
      if (Math.abs(scoreGap) > 3) return scoreGap;
      const priorityGap = (priority[b.id] || 0) - (priority[a.id] || 0);
      if (priorityGap) return priorityGap;
      const fire = (b.decision === 'FIRE' ? 1 : 0) - (a.decision === 'FIRE' ? 1 : 0);
      return fire || (a.selection?.odds || 99) - (b.selection?.odds || 99);
    })[0] || null
  };
}

export function analyzeConvergence(fixture = {}, stats = null) {
  const odds = fixture.odds || {};
  const home = normalizeSplit(stats?.homeSplit || stats?.home || fixture?.stats?.homeSplit);
  const away = normalizeSplit(stats?.awaySplit || stats?.away || fixture?.stats?.awaySplit);
  const base = { engine: 'CONVERGENCE_ROUTE', home, away, candidates: [], decision: 'NO_SIGNAL', selection: null, explanation: 'No convergence route qualified.' };
  if (!home || !away || home.played < 5 || away.played < 5) {
    return { ...base, decision: 'WAITING', explanation: `Five home and five away venue matches are required. Home ${home?.played || 0}/5; away ${away?.played || 0}/5.` };
  }

  const market = fair1x2(odds);
  const combined = {
    gf: home.goalsForAvg + away.goalsForAvg,
    ga: home.goalsAgainstAvg + away.goalsAgainstAvg,
    gpm: (home.goalsPerMatch + away.goalsPerMatch) / 2,
    scoredIn: home.scoredIn + away.scoredIn,
    concededIn: home.concededIn + away.concededIn,
    over15: home.over15 + away.over15,
    over25: home.over25 + away.over25,
    under35: home.under35 + away.under35,
    btts: home.btts + away.btts,
    cleanSheets: home.cleanSheets + away.cleanSheets,
    failedToScore: home.failedToScore + away.failedToScore,
    scored2Plus: home.scored2Plus + away.scored2Plus,
    conceded2Plus: home.conceded2Plus + away.conceded2Plus
  };

  const candidates = [];
  candidates.push(candidate({
    id: 'CONV_OVER_1_5', name: 'Convergent two-goal route', family: 'OVER',
    blocks: [
      block('Attack', [check('Combined scoring rate', combined.scoredIn >= 8, `${combined.scoredIn}/10`, '≥ 8/10'), check('Combined goals scored', combined.gf >= 1.8, combined.gf.toFixed(2), '≥ 1.80')]),
      block('Defence', [check('Combined conceding rate', combined.concededIn >= 8, `${combined.concededIn}/10`, '≥ 8/10'), check('Clean-sheet resistance', combined.cleanSheets <= 3, `${combined.cleanSheets}/10`, '≤ 3/10')]),
      block('Venue', [check('Over 1.5 venue record', combined.over15 >= 8, `${combined.over15}/10`, '≥ 8/10'), check('Venue goal pace', combined.gpm >= 2.2, combined.gpm.toFixed(2), '≥ 2.20')]),
      block('Market', [check('Over 1.5 offered', offered(odds.over15), fmt(odds.over15), 'available'), check('Goal ceiling open', offered(odds.under35) && n(odds.under35) >= 1.35, fmt(odds.under35), '≥ 1.35')])
    ],
    target: { market: 'OVER_1_5', label: 'Over 1.5 Goals', odds: n(odds.over15) },
    blockers: [combined.failedToScore >= 6 ? 'Both attacks have too many failed-to-score results.' : null, offered(odds.under25) && n(odds.under25) <= 1.35 ? 'Under 2.5 is priced too strongly against the route.' : null],
    note: 'Attack, defensive vulnerability, venue goal frequency and the market independently point to at least two goals.'
  }));

  candidates.push(candidate({
    id: 'CONV_OVER_2_5', name: 'Convergent high-goal route', family: 'OVER',
    blocks: [
      block('Attack', [check('Combined goals scored', combined.gf >= 2.2, combined.gf.toFixed(2), '≥ 2.20'), check('Two-goal team events', combined.scored2Plus >= 3, `${combined.scored2Plus}/10`, '≥ 3/10')]),
      block('Defence', [check('Combined goals conceded', combined.ga >= 1.8, combined.ga.toFixed(2), '≥ 1.80'), check('Conceded two-plus', combined.conceded2Plus >= 2, `${combined.conceded2Plus}/10`, '≥ 2/10')]),
      block('Venue', [check('Over 2.5 venue record', combined.over25 >= 7, `${combined.over25}/10`, '≥ 7/10'), check('Venue goal pace', combined.gpm >= 2.7, combined.gpm.toFixed(2), '≥ 2.70')]),
      block('Market', [check('Over 2.5 offered', offered(odds.over25), fmt(odds.over25), 'available'), check('Under 3.5 price', offered(odds.under35) && n(odds.under35) >= 1.50, fmt(odds.under35), '≥ 1.50')])
    ],
    target: { market: 'OVER_2_5', label: 'Over 2.5 Goals', odds: n(odds.over25) },
    safer: { market: 'OVER_1_5', label: 'Over 1.5 Goals', odds: n(odds.over15) },
    blockers: [combined.over25 <= 3 ? 'Both venue profiles strongly oppose three goals.' : null, offered(odds.under25) && n(odds.under25) <= 1.45 ? 'The Under 2.5 market strongly contradicts the route.' : null],
    note: 'Multiple independent goal indicators converge on a three-goal match.'
  }));

  candidates.push(candidate({
    id: 'CONV_UNDER_3_5', name: 'Convergent controlled-game route', family: 'UNDER',
    blocks: [
      block('Attack', [check('Moderate scoring output', combined.gf <= 3.2, combined.gf.toFixed(2), '≤ 3.20'), check('Limited two-goal events', combined.scored2Plus <= 5, `${combined.scored2Plus}/10`, '≤ 5/10')]),
      block('Defence', [check('Moderate conceding output', combined.ga <= 3.0, combined.ga.toFixed(2), '≤ 3.00'), check('Clean sheets or blanks', combined.cleanSheets + combined.failedToScore >= 3, `${combined.cleanSheets + combined.failedToScore}/20`, '≥ 3')]),
      block('Venue', [check('Under 3.5 venue record', combined.under35 >= 8, `${combined.under35}/10`, '≥ 8/10'), check('Venue goal pace', combined.gpm <= 3.2, combined.gpm.toFixed(2), '≤ 3.20')]),
      block('Market', [check('Under 3.5 offered', offered(odds.under35), fmt(odds.under35), 'available'), check('Under protection', offered(odds.under35) && n(odds.under35) <= 1.65, fmt(odds.under35), '≤ 1.65')])
    ],
    target: { market: 'UNDER_3_5', label: 'Under 3.5 Goals', odds: n(odds.under35) },
    blockers: [combined.over25 >= 9 && offered(odds.over25) && n(odds.over25) <= 1.45 ? 'Venue history and the market both point strongly to high goals.' : null],
    note: 'Attack limits, defensive resistance, venue totals and the market converge on fewer than four goals.'
  }));

  candidates.push(candidate({
    id: 'CONV_UNDER_2_5', name: 'Convergent low-goal route', family: 'UNDER',
    blocks: [
      block('Attack', [check('Combined goals scored', combined.gf <= 2.2, combined.gf.toFixed(2), '≤ 2.20'), check('Failed-to-score events', combined.failedToScore >= 3, `${combined.failedToScore}/10`, '≥ 3/10')]),
      block('Defence', [check('Combined goals conceded', combined.ga <= 2.0, combined.ga.toFixed(2), '≤ 2.00'), check('Clean sheets', combined.cleanSheets >= 3, `${combined.cleanSheets}/10`, '≥ 3/10')]),
      block('Venue', [check('Over 2.5 venue record', combined.over25 <= 3, `${combined.over25}/10`, '≤ 3/10'), check('Venue goal pace', combined.gpm <= 2.4, combined.gpm.toFixed(2), '≤ 2.40')]),
      block('Market', [check('Under 2.5 offered', offered(odds.under25), fmt(odds.under25), 'available'), check('BTTS No support', offered(odds.bttsNo) && n(odds.bttsNo) <= 1.75, fmt(odds.bttsNo), '≤ 1.75')])
    ],
    target: { market: 'UNDER_2_5', label: 'Under 2.5 Goals', odds: n(odds.under25) },
    safer: { market: 'UNDER_3_5', label: 'Under 3.5 Goals', odds: n(odds.under35) },
    blockers: [combined.over25 >= 7 ? 'The venue profiles produce too many Over 2.5 matches.' : null, offered(odds.bttsYes) && n(odds.bttsYes) <= 1.55 ? 'BTTS Yes is too strongly supported by the market.' : null],
    note: 'Low attacking output, defensive resistance, venue totals and market protection converge on Under 2.5.'
  }));

  candidates.push(candidate({
    id: 'CONV_BTTS_YES', name: 'Convergent both-teams scoring route', family: 'OVER',
    blocks: [
      block('Attack', [check('Home scoring rate', home.scoredIn >= 4, `${home.scoredIn}/5`, '≥ 4/5'), check('Away scoring rate', away.scoredIn >= 4, `${away.scoredIn}/5`, '≥ 4/5')]),
      block('Defence', [check('Home conceding rate', home.concededIn >= 4, `${home.concededIn}/5`, '≥ 4/5'), check('Away conceding rate', away.concededIn >= 4, `${away.concededIn}/5`, '≥ 4/5')]),
      block('Venue', [check('BTTS venue record', combined.btts >= 7, `${combined.btts}/10`, '≥ 7/10'), check('Failed-to-score resistance', combined.failedToScore <= 2, `${combined.failedToScore}/10`, '≤ 2/10')]),
      block('Market', [check('BTTS Yes offered', offered(odds.bttsYes), fmt(odds.bttsYes), 'available'), check('Both team totals supported', offered(odds.homeOver05) && offered(odds.awayOver05) && n(odds.homeOver05) <= 1.45 && n(odds.awayOver05) <= 1.45, `${fmt(odds.homeOver05)} / ${fmt(odds.awayOver05)}`, 'both ≤ 1.45')])
    ],
    target: { market: 'BTTS_YES', label: 'Both Teams to Score — Yes', odds: n(odds.bttsYes) },
    safer: { market: 'OVER_1_5', label: 'Over 1.5 Goals', odds: n(odds.over15) },
    blockers: [home.failedToScore >= 3 || away.failedToScore >= 3 ? 'One attack failed to score in at least three relevant venue matches.' : null],
    note: 'Both attacks score, both defences concede, the venue pattern agrees, and team-goal prices confirm the route.'
  }));

  candidates.push(candidate({
    id: 'CONV_BTTS_NO', name: 'Convergent one-team blank route', family: 'UNDER',
    blocks: [
      block('Attack', [check('At least one restricted attack', home.failedToScore >= 2 || away.failedToScore >= 2, `${home.failedToScore}/5 / ${away.failedToScore}/5`, 'one side ≥ 2/5'), check('Scoring rate restriction', home.scoredIn <= 3 || away.scoredIn <= 3, `${home.scoredIn}/5 / ${away.scoredIn}/5`, 'one side ≤ 3/5')]),
      block('Defence', [check('At least one strong clean-sheet profile', home.cleanSheets >= 2 || away.cleanSheets >= 2, `${home.cleanSheets}/5 / ${away.cleanSheets}/5`, 'one side ≥ 2/5'), check('Defensive average', Math.min(home.goalsAgainstAvg, away.goalsAgainstAvg) <= 1.0, Math.min(home.goalsAgainstAvg, away.goalsAgainstAvg).toFixed(2), '≤ 1.00')]),
      block('Venue', [check('BTTS venue record', combined.btts <= 3, `${combined.btts}/10`, '≤ 3/10'), check('Under 3.5 record', combined.under35 >= 8, `${combined.under35}/10`, '≥ 8/10')]),
      block('Market', [check('BTTS No offered', offered(odds.bttsNo), fmt(odds.bttsNo), 'available'), check('One team goal price restricted', (offered(odds.homeOver05) && n(odds.homeOver05) >= 1.55) || (offered(odds.awayOver05) && n(odds.awayOver05) >= 1.55), `${fmt(odds.homeOver05)} / ${fmt(odds.awayOver05)}`, 'one side ≥ 1.55')])
    ],
    target: { market: 'BTTS_NO', label: 'Both Teams to Score — No', odds: n(odds.bttsNo) },
    safer: { market: 'UNDER_3_5', label: 'Under 3.5 Goals', odds: n(odds.under35) },
    blockers: [home.scoredIn === 5 && away.scoredIn === 5 && combined.btts >= 7 ? 'Both attacks and the venue pattern strongly support BTTS Yes.' : null],
    note: 'A restricted attack, defensive resistance, venue BTTS history and team-total prices converge on one team going blank.'
  }));

  const homeStrength = { ppg: home.ppg, gd: home.goalsForAvg - home.goalsAgainstAvg };
  const awayStrength = { ppg: away.ppg, gd: away.goalsForAvg - away.goalsAgainstAvg };
  const strongerSide = homeStrength.ppg > awayStrength.ppg ? 'home' : awayStrength.ppg > homeStrength.ppg ? 'away' : null;
  if (strongerSide) {
    const strong = strongerSide === 'home' ? home : away;
    const weak = strongerSide === 'home' ? away : home;
    const ppgGap = strong.ppg - weak.ppg;
    const gdGap = (strong.goalsForAvg - strong.goalsAgainstAvg) - (weak.goalsForAvg - weak.goalsAgainstAvg);
    const target = sideMarket(strongerSide, odds, 'WIN');
    const safer = sideMarket(strongerSide, odds, 'DOUBLE_CHANCE');
    candidates.push(candidate({
      id: 'CONV_STRONGER_TEAM', name: 'Convergent stronger-team route', family: 'RESULT',
      blocks: [
        block('Attack', [check('Scoring advantage', strong.goalsForAvg - weak.goalsForAvg >= 0.6, (strong.goalsForAvg - weak.goalsForAvg).toFixed(2), '≥ 0.60'), check('Strong side scoring rate', strong.scoredIn >= 4, `${strong.scoredIn}/5`, '≥ 4/5')]),
        block('Defence', [check('Defensive advantage', weak.goalsAgainstAvg - strong.goalsAgainstAvg >= 0.4, (weak.goalsAgainstAvg - strong.goalsAgainstAvg).toFixed(2), '≥ 0.40'), check('Strong-side clean sheets', strong.cleanSheets >= 2, `${strong.cleanSheets}/5`, '≥ 2/5')]),
        block('Venue', [check('PPG gap', ppgGap >= 1.0, ppgGap.toFixed(2), '≥ 1.00'), check('Goal-difference gap', gdGap >= 1.0, gdGap.toFixed(2), '≥ 1.00')]),
        block('Market', [check('Market favourite agrees', market.favouriteSide === strongerSide, market.favouriteSide || 'unknown', strongerSide), check('Straight-win market', offered(target.odds), fmt(target.odds), 'available')])
      ],
      target,
      safer,
      blockers: [ppgGap < 0.7 ? 'The venue-strength gap is too small.' : null, market.available && market.favouriteSide && market.favouriteSide !== strongerSide ? 'The market favours the opposite team.' : null],
      note: 'Attack, defence, venue performance and the normalized 1X2 market converge on the same stronger side.'
    }));
  }

  const choice = chooseBest(candidates);
  if (choice.conflict) return { ...base, candidates, market, decision: 'CONFLICT', explanation: choice.reason };
  const best = choice.best;
  return {
    ...base,
    candidates,
    market,
    decision: best?.decision || 'NO_SIGNAL',
    selection: best?.selection || null,
    explanation: best?.selection
      ? `${best.name} selected ${best.selection.label} with ${best.score.toFixed(0)}% cross-block agreement.`
      : 'No market received enough independent attack, defence, venue and market agreement.'
  };
}

export function convergenceSummary(result = {}) {
  return {
    decision: result.decision || 'NO_SIGNAL',
    selection: result.selection || null,
    market: result.market || null,
    closest: [...(result.candidates || [])].sort((a, b) => b.score - a.score)[0] || null,
    explanation: result.explanation || null
  };
}
