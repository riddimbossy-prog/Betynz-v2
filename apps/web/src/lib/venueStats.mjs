import { mean, normalizeName, pct, round, similarity } from './utils.mjs';

const numeric = value => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

function pick(object, names) {
  if (!object || typeof object !== 'object') return null;
  for (const name of names) {
    if (object[name] !== undefined && object[name] !== null && object[name] !== '') return object[name];
  }
  const entries = Object.entries(object);
  for (const wanted of names) {
    const normalizedWanted = normalizeName(wanted);
    const found = entries.find(([key]) => normalizeName(key) === normalizedWanted);
    if (found && found[1] !== undefined && found[1] !== null && found[1] !== '') return found[1];
  }
  return null;
}

function nameOf(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!value || typeof value !== 'object') return '';
  return String(pick(value, ['name', 'team_name', 'teamName', 'title', 'label']) || '').trim();
}

function parseScoreString(value) {
  const text = String(value || '').trim();
  const match = text.match(/(?:^|\s)(\d{1,2})\s*[:\-]\s*(\d{1,2})(?:\s|$)/);
  return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

function parseScoreObject(value) {
  if (!value || typeof value !== 'object') return null;
  const home = numeric(pick(value, ['home', 'home_goals', 'homeGoals', 'team1', 'score_home', 'scoreHome', 'goals_home']));
  const away = numeric(pick(value, ['away', 'away_goals', 'awayGoals', 'team2', 'score_away', 'scoreAway', 'goals_away']));
  return home !== null && away !== null ? { home, away } : null;
}

function scoreFromMatch(match, half = false) {
  const names = half
    ? ['half_time_score', 'halftime_score', 'halfTimeScore', 'ht_score', 'htScore', 'score_ht', 'halftime', 'half_time']
    : ['full_time_score', 'fullTimeScore', 'ft_score', 'ftScore', 'score', 'result', 'final_score', 'finalScore'];
  const direct = pick(match, names);
  const parsedDirect = parseScoreObject(direct) || parseScoreString(direct);
  if (parsedDirect) return parsedDirect;

  const homeNames = half
    ? ['home_ht', 'homeHt', 'home_half_time', 'homeHalfTime', 'ht_home', 'halftime_home']
    : ['home_goals', 'homeGoals', 'goals_home', 'score_home', 'home_score', 'homeScore'];
  const awayNames = half
    ? ['away_ht', 'awayHt', 'away_half_time', 'awayHalfTime', 'ht_away', 'halftime_away']
    : ['away_goals', 'awayGoals', 'goals_away', 'score_away', 'away_score', 'awayScore'];
  const home = numeric(pick(match, homeNames));
  const away = numeric(pick(match, awayNames));
  return home !== null && away !== null ? { home, away } : null;
}

function dateValue(match) {
  const raw = pick(match, ['date', 'match_date', 'matchDate', 'kickoff', 'start_time', 'startTime', 'datetime', 'time']);
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function collectObjects(value, output = [], depth = 0, seen = new Set()) {
  if (depth > 10 || value == null || typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, output, depth + 1, seen);
    return output;
  }
  output.push(value);
  for (const item of Object.values(value)) collectObjects(item, output, depth + 1, seen);
  return output;
}

function resultOutcome(gf, ga) {
  if (!Number.isFinite(gf) || !Number.isFinite(ga)) return null;
  return gf > ga ? 'W' : gf === ga ? 'D' : 'L';
}

function directPerspective(match, teamName, expectedVenue) {
  const goalsFor = numeric(pick(match, ['goals_for', 'goalsFor', 'gf', 'team_goals', 'teamGoals', 'scored']));
  const goalsAgainst = numeric(pick(match, ['goals_against', 'goalsAgainst', 'ga', 'opponent_goals', 'opponentGoals', 'conceded']));
  if (goalsFor !== null && goalsAgainst !== null) {
    const htGF = numeric(pick(match, ['half_goals_for', 'halfGoalsFor', 'ht_goals_for', 'htGoalsFor', 'ht_gf', 'htGF']));
    const htGA = numeric(pick(match, ['half_goals_against', 'halfGoalsAgainst', 'ht_goals_against', 'htGoalsAgainst', 'ht_ga', 'htGA']));
    const halfTotal = numeric(pick(match, ['first_half_total_goals', 'firstHalfTotalGoals', 'half_goals', 'halfGoals']));
    return {
      gf: goalsFor,
      ga: goalsAgainst,
      htGF,
      htGA,
      halfGoals: halfTotal ?? (htGF !== null && htGA !== null ? htGF + htGA : null),
      htOutcome: resultOutcome(htGF, htGA),
      ftOutcome: resultOutcome(goalsFor, goalsAgainst),
      venue: expectedVenue,
      date: dateValue(match)
    };
  }

  const homeName = nameOf(pick(match, ['home_team', 'homeTeam', 'home', 'team_home', 'team1', 'participant1']));
  const awayName = nameOf(pick(match, ['away_team', 'awayTeam', 'away', 'team_away', 'team2', 'participant2']));
  const score = scoreFromMatch(match, false);
  if (!score || (!homeName && !awayName)) return null;

  const homeSimilarity = similarity(teamName, homeName);
  const awaySimilarity = similarity(teamName, awayName);
  const isHome = homeSimilarity >= Math.max(0.68, awaySimilarity + 0.08);
  const isAway = awaySimilarity >= Math.max(0.68, homeSimilarity + 0.08);
  if (!isHome && !isAway) return null;

  const ht = scoreFromMatch(match, true);
  const gf = isHome ? score.home : score.away;
  const ga = isHome ? score.away : score.home;
  const htGF = ht ? (isHome ? ht.home : ht.away) : null;
  const htGA = ht ? (isHome ? ht.away : ht.home) : null;
  return {
    gf,
    ga,
    htGF,
    htGA,
    halfGoals: ht ? ht.home + ht.away : null,
    htOutcome: resultOutcome(htGF, htGA),
    ftOutcome: resultOutcome(gf, ga),
    venue: isHome ? 'home' : 'away',
    date: dateValue(match)
  };
}

function isMatchLike(object) {
  if (!object || typeof object !== 'object') return false;
  if (scoreFromMatch(object, false)) return true;
  return numeric(pick(object, ['goals_for', 'goalsFor', 'gf'])) !== null && numeric(pick(object, ['goals_against', 'goalsAgainst', 'ga'])) !== null;
}

function normalizeForm(value) {
  const list = Array.isArray(value) ? value : String(value || '').toUpperCase().match(/[WDL]/g) || [];
  return list.map(item => String(item).toUpperCase()).filter(item => ['W', 'D', 'L'].includes(item)).slice(0, 5);
}


const GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
const HTFT_CODES = ['WW', 'DW', 'LW', 'WD', 'DD', 'LD', 'WL', 'DL', 'LL'];

function advancedRowsProfile(rows) {
  const played = rows.length;
  const totalGoals = rows.reduce((sum, row) => sum + row.gf + row.ga, 0);
  const goalThresholds = {};
  for (const line of GOAL_LINES) {
    const sequence = rows.map(row => row.gf + row.ga > line ? 'O' : 'U');
    const over = sequence.filter(value => value === 'O').length;
    goalThresholds[line.toFixed(1)] = {
      line,
      over,
      under: played - over,
      overRate: pct(over, played),
      underRate: pct(played - over, played),
      totalGoals,
      goalsPerMatch: round(played ? totalGoals / played : 0, 2),
      sequence
    };
  }
  const htft = Object.fromEntries(HTFT_CODES.map(code => [code, 0]));
  let halfTimeAvailable = 0;
  for (const row of rows) {
    const htOutcome = row.htOutcome || resultOutcome(row.htGF, row.htGA);
    const ftOutcome = row.ftOutcome || resultOutcome(row.gf, row.ga);
    if (!htOutcome || !ftOutcome) continue;
    const code = `${htOutcome}${ftOutcome}`;
    if (Object.prototype.hasOwnProperty.call(htft, code)) htft[code] += 1;
    halfTimeAvailable += 1;
  }
  const points = rows.filter(row => row.gf > row.ga).length * 3 + rows.filter(row => row.gf === row.ga).length;
  return {
    points,
    ppg: round(played ? points / played : 0, 2),
    totalGoals,
    goalsPerMatch: round(played ? totalGoals / played : 0, 2),
    firstHalfGoalsAvg: round(mean(rows.filter(row => Number.isFinite(row.halfGoals)).map(row => row.halfGoals)) || 0, 2),
    goalThresholds,
    htft,
    halfTimeAvailable,
    heldLead: htft.WW,
    lostLead: htft.WD + htft.WL,
    comebackWins: htft.LW,
    recoveredDraws: htft.LD
  };
}

function normalizedHtft(value) {
  const source = value && typeof value === 'object' ? value : {};
  const output = {};
  for (const code of HTFT_CODES) {
    const slash = `${code[0]}/${code[1]}`;
    output[code] = numeric(pick(source, [code, slash, code.toLowerCase(), slash.toLowerCase()])) || 0;
  }
  return output;
}

function normalizedThresholds(value, fallback, played) {
  const source = value && typeof value === 'object' ? value : {};
  const output = {};
  for (const line of GOAL_LINES) {
    const key = line.toFixed(1);
    const direct = source[key] ?? source[String(line).replace('.', '_')] ?? source[`over${String(line).replace('.', '')}`];
    let over = null;
    let under = null;
    let sequence = [];
    if (direct && typeof direct === 'object') {
      over = numeric(pick(direct, ['over', 'o', 'countOver', 'overCount']));
      under = numeric(pick(direct, ['under', 'u', 'countUnder', 'underCount']));
      sequence = Array.isArray(direct.sequence) ? direct.sequence.map(item => String(item).toUpperCase()).filter(item => ['O', 'U'].includes(item)).slice(0, 5) : [];
    } else if (numeric(direct) !== null) {
      over = numeric(direct);
    }
    if (over === null) {
      if (line === 1.5) over = fallback.over15;
      if (line === 2.5) over = fallback.over25;
      if (line === 3.5) over = played - fallback.under35;
    }
    if (under === null && over !== null) under = Math.max(0, played - over);
    output[key] = {
      line,
      over,
      under,
      overRate: over === null ? null : pct(over, played),
      underRate: under === null ? null : pct(under, played),
      totalGoals: fallback.totalGoals,
      goalsPerMatch: fallback.goalsPerMatch,
      sequence
    };
  }
  return output;
}

function normalizeSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const playedRaw = numeric(pick(summary, ['played', 'matches_played', 'matchesPlayed', 'games', 'games_played', 'gamesPlayed']));
  if (!playedRaw || playedRaw < 1) return null;
  const played = Math.min(5, playedRaw);
  const rawValue = (...names) => numeric(pick(summary, names));
  const value = (...names) => rawValue(...names) ?? 0;
  const recentSource = pick(summary, ['recent3', 'recent_3', 'last3', 'last_3']) || {};
  const rawRecent = (...names) => numeric(pick(recentSource, names));
  const recentValue = (...names) => rawRecent(...names) ?? 0;

  // Keep presence information. Some providers expose goal-line counts only inside
  // goalThresholds/overUnder. Treating a missing flat value as zero made the
  // engines disagree with the statistics table even though both used the same feed.
  const rawFlat = {
    over15: rawValue('over15', 'over_1_5'),
    over25: rawValue('over25', 'over_2_5'),
    under25: rawValue('under25', 'under_2_5'),
    under35: rawValue('under35', 'under_3_5')
  };
  const rawRecentGoal = {
    over15: rawRecent('over15', 'over_1_5'),
    over25: rawRecent('over25', 'over_2_5'),
    under35: rawRecent('under35', 'under_3_5')
  };

  const result = {
    played,
    form: normalizeForm(pick(summary, ['form', 'last5', 'last_5', 'results'])),
    wins: value('wins', 'won'), draws: value('draws', 'drawn'), losses: value('losses', 'lost'),
    scoredIn: value('scoredIn', 'scored_in', 'matches_scored', 'teamOver05', 'team_over_0_5'),
    concededIn: value('concededIn', 'conceded_in', 'matches_conceded', 'opponentOver05', 'opponent_over_0_5'),
    cleanSheets: value('cleanSheets', 'clean_sheets'), failedToScore: value('failedToScore', 'failed_to_score'),
    over15: rawFlat.over15 ?? 0, over25: rawFlat.over25 ?? 0,
    under25: rawFlat.under25 ?? 0, under35: rawFlat.under35 ?? 0,
    btts: value('btts', 'bttsYes', 'btts_yes'), scored2Plus: value('scored2Plus', 'scored_2_plus', 'teamOver15', 'team_over_1_5'),
    scored3Plus: value('scored3Plus', 'scored_3_plus', 'teamOver25', 'team_over_2_5'),
    conceded2Plus: value('conceded2Plus', 'conceded_2_plus', 'opponentOver15', 'opponent_over_1_5'),
    conceded3Plus: value('conceded3Plus', 'conceded_3_plus', 'opponentOver25', 'opponent_over_2_5'),
    firstHalfOver05: value('firstHalfOver05', 'first_half_over_0_5', 'fh_over_0_5'),
    goalsForAvg: value('goalsForAvg', 'goals_for_avg', 'average_goals_scored'),
    goalsAgainstAvg: value('goalsAgainstAvg', 'goals_against_avg', 'average_goals_conceded'),
    recent3: {
      played: recentValue('played', 'matches_played') || Math.min(3, played),
      wins: recentValue('wins'), draws: recentValue('draws'), losses: recentValue('losses'),
      scoredIn: recentValue('scoredIn', 'scored_in', 'teamOver05'), concededIn: recentValue('concededIn', 'conceded_in', 'opponentOver05'),
      scored2Plus: recentValue('scored2Plus', 'teamOver15'), scored3Plus: recentValue('scored3Plus', 'teamOver25'),
      conceded2Plus: recentValue('conceded2Plus', 'opponentOver15'), conceded3Plus: recentValue('conceded3Plus', 'opponentOver25'),
      over15: rawRecentGoal.over15 ?? 0, over25: rawRecentGoal.over25 ?? 0,
      under35: rawRecentGoal.under35 ?? 0, btts: recentValue('btts', 'bttsYes'),
      firstHalfOver05: recentValue('firstHalfOver05', 'first_half_over_0_5')
    }
  };
  if (!result.form.length && result.wins + result.draws + result.losses === result.played) {
    result.form = [...Array(result.wins).fill('W'), ...Array(result.draws).fill('D'), ...Array(result.losses).fill('L')].slice(0, 5);
  }
  result.points = numeric(pick(summary, ['points', 'form_points', 'formPoints'])) ?? (result.wins * 3 + result.draws);
  result.ppg = numeric(pick(summary, ['ppg', 'points_per_game', 'pointsPerGame'])) ?? round(result.points / played, 2);
  result.totalGoals = numeric(pick(summary, ['totalGoals', 'total_goals', 'goals'])) ?? round((result.goalsForAvg + result.goalsAgainstAvg) * played, 0);
  result.goalsPerMatch = numeric(pick(summary, ['goalsPerMatch', 'goals_per_match', 'gpm'])) ?? round(result.goalsForAvg + result.goalsAgainstAvg, 2);
  result.firstHalfGoalsAvg = numeric(pick(summary, ['firstHalfGoalsAvg', 'first_half_goals_avg', 'fh_goals_avg'])) ?? 0;
  result.htft = normalizedHtft(pick(summary, ['htft', 'halfTimeFullTime', 'half_time_full_time', 'transitions']));
  result.halfTimeAvailable = numeric(pick(summary, ['halfTimeAvailable', 'half_time_available', 'ht_samples'])) ?? Object.values(result.htft).reduce((sum, count) => sum + count, 0);
  result.heldLead = numeric(pick(summary, ['heldLead', 'held_lead'])) ?? result.htft.WW;
  result.lostLead = numeric(pick(summary, ['lostLead', 'lost_lead'])) ?? result.htft.WD + result.htft.WL;
  result.comebackWins = numeric(pick(summary, ['comebackWins', 'comeback_wins'])) ?? result.htft.LW;
  result.recoveredDraws = numeric(pick(summary, ['recoveredDraws', 'recovered_draws'])) ?? result.htft.LD;
  result.goalThresholds = normalizedThresholds(pick(summary, ['goalThresholds', 'goal_thresholds', 'overUnder', 'over_under']), result, played);

  const threshold = line => result.goalThresholds?.[line] || null;
  const recentFromSequence = (line, wanted) => {
    const sequence = Array.isArray(threshold(line)?.sequence) ? threshold(line).sequence.slice(0, 3) : [];
    return sequence.length >= Math.min(3, played) ? sequence.filter(item => item === wanted).length : null;
  };

  // Canonicalize engine fields from the exact same goal-line records rendered by the UI.
  if (rawFlat.over15 === null && numeric(threshold('1.5')?.over) !== null) result.over15 = numeric(threshold('1.5').over);
  if (rawFlat.over25 === null && numeric(threshold('2.5')?.over) !== null) result.over25 = numeric(threshold('2.5').over);
  if (rawFlat.under25 === null && numeric(threshold('2.5')?.under) !== null) result.under25 = numeric(threshold('2.5').under);
  if (rawFlat.under35 === null && numeric(threshold('3.5')?.under) !== null) result.under35 = numeric(threshold('3.5').under);

  if (rawRecentGoal.over15 === null) {
    const derived = recentFromSequence('1.5', 'O');
    if (derived !== null) result.recent3.over15 = derived;
  }
  if (rawRecentGoal.over25 === null) {
    const derived = recentFromSequence('2.5', 'O');
    if (derived !== null) result.recent3.over25 = derived;
  }
  if (rawRecentGoal.under35 === null) {
    const derived = recentFromSequence('3.5', 'U');
    if (derived !== null) result.recent3.under35 = derived;
  }

  const denominator = played || 1;
  result.rates = {
    wins: pct(result.wins, denominator), draws: pct(result.draws, denominator), losses: pct(result.losses, denominator),
    scoredIn: pct(result.scoredIn, denominator), concededIn: pct(result.concededIn, denominator),
    cleanSheets: pct(result.cleanSheets, denominator), failedToScore: pct(result.failedToScore, denominator),
    over15: pct(result.over15, denominator), over25: pct(result.over25, denominator), under25: pct(result.under25, denominator),
    under35: pct(result.under35, denominator), btts: pct(result.btts, denominator), scored2Plus: pct(result.scored2Plus, denominator),
    scored3Plus: pct(result.scored3Plus, denominator), conceded2Plus: pct(result.conceded2Plus, denominator),
    conceded3Plus: pct(result.conceded3Plus, denominator), firstHalfOver05: pct(result.firstHalfOver05, denominator)
  };
  return result;
}

function summarizeRows(rows) {
  const selected = rows.sort((a, b) => b.date - a.date).slice(0, 5);
  const played = selected.length;
  const count = fn => selected.filter(fn).length;
  const recent = selected.slice(0, 3);
  const recentCount = fn => recent.filter(fn).length;
  const advanced = advancedRowsProfile(selected);
  const result = {
    played,
    form: selected.map(row => row.gf > row.ga ? 'W' : row.gf === row.ga ? 'D' : 'L'),
    wins: count(row => row.gf > row.ga), draws: count(row => row.gf === row.ga), losses: count(row => row.gf < row.ga),
    points: advanced.points,
    ppg: advanced.ppg,
    totalGoals: advanced.totalGoals,
    goalsPerMatch: advanced.goalsPerMatch,
    firstHalfGoalsAvg: advanced.firstHalfGoalsAvg,
    goalThresholds: advanced.goalThresholds,
    htft: advanced.htft,
    halfTimeAvailable: advanced.halfTimeAvailable,
    heldLead: advanced.heldLead,
    lostLead: advanced.lostLead,
    comebackWins: advanced.comebackWins,
    recoveredDraws: advanced.recoveredDraws,
    scoredIn: count(row => row.gf > 0), concededIn: count(row => row.ga > 0), cleanSheets: count(row => row.ga === 0),
    failedToScore: count(row => row.gf === 0), over15: count(row => row.gf + row.ga >= 2), over25: count(row => row.gf + row.ga >= 3),
    under25: count(row => row.gf + row.ga <= 2), under35: count(row => row.gf + row.ga <= 3), btts: count(row => row.gf > 0 && row.ga > 0),
    scored2Plus: count(row => row.gf >= 2), scored3Plus: count(row => row.gf >= 3),
    conceded2Plus: count(row => row.ga >= 2), conceded3Plus: count(row => row.ga >= 3), firstHalfOver05: count(row => Number.isFinite(row.halfGoals) && row.halfGoals >= 1),
    goalsForAvg: round(mean(selected.map(row => row.gf)) || 0, 2), goalsAgainstAvg: round(mean(selected.map(row => row.ga)) || 0, 2),
    recent3: {
      played: recent.length,
      wins: recentCount(row => row.gf > row.ga), draws: recentCount(row => row.gf === row.ga), losses: recentCount(row => row.gf < row.ga),
      scoredIn: recentCount(row => row.gf > 0), concededIn: recentCount(row => row.ga > 0),
      scored2Plus: recentCount(row => row.gf >= 2), scored3Plus: recentCount(row => row.gf >= 3),
      conceded2Plus: recentCount(row => row.ga >= 2), conceded3Plus: recentCount(row => row.ga >= 3),
      over15: recentCount(row => row.gf + row.ga >= 2), over25: recentCount(row => row.gf + row.ga >= 3),
      under35: recentCount(row => row.gf + row.ga <= 3), btts: recentCount(row => row.gf > 0 && row.ga > 0),
      firstHalfOver05: recentCount(row => Number.isFinite(row.halfGoals) && row.halfGoals >= 1)
    }
  };
  result.rates = {
    wins: pct(result.wins, played), draws: pct(result.draws, played), losses: pct(result.losses, played),
    scoredIn: pct(result.scoredIn, played), concededIn: pct(result.concededIn, played), cleanSheets: pct(result.cleanSheets, played),
    failedToScore: pct(result.failedToScore, played), over15: pct(result.over15, played), over25: pct(result.over25, played),
    under25: pct(result.under25, played), under35: pct(result.under35, played), btts: pct(result.btts, played),
    scored2Plus: pct(result.scored2Plus, played), scored3Plus: pct(result.scored3Plus, played),
    conceded2Plus: pct(result.conceded2Plus, played), conceded3Plus: pct(result.conceded3Plus, played), firstHalfOver05: pct(result.firstHalfOver05, played)
  };
  return result;
}

function findDirectSummary(data, side) {
  const candidates = [
    data?.stats?.[`${side}Split`], data?.[side]?.history?.venue, data?.[side]?.venue,
    data?.fixture?.[side]?.venue, data?.[`${side}Split`], data?.[side]?.split
  ];
  for (const candidate of candidates) {
    const normalized = normalizeSummary(candidate);
    if (normalized?.played >= 1) return normalized;
  }
  return null;
}

function summaryFromHistory(data, side, teamName, expectedVenue) {
  const root = data?.[side]?.history ?? data?.[side] ?? data;
  const rows = [];
  const seen = new Set();
  for (const object of collectObjects(root)) {
    if (!isMatchLike(object)) continue;
    const key = JSON.stringify([
      pick(object, ['id', 'match_id', 'matchId', 'event_id', 'eventId']),
      pick(object, ['date', 'match_date', 'kickoff']),
      pick(object, ['score', 'full_time_score', 'ft_score']),
      pick(object, ['home_team', 'homeTeam']),
      pick(object, ['away_team', 'awayTeam'])
    ]);
    if (seen.has(key)) continue;
    const row = directPerspective(object, teamName, expectedVenue);
    if (!row || (row.venue && row.venue !== expectedVenue)) continue;
    seen.add(key);
    rows.push(row);
  }
  return summarizeRows(rows);
}

export function extractVenueStats(data, context = {}) {
  if (!data || typeof data !== 'object') return null;
  const homeSplit = findDirectSummary(data, 'home') || summaryFromHistory(data, 'home', context.homeName, 'home');
  const awaySplit = findDirectSummary(data, 'away') || summaryFromHistory(data, 'away', context.awayName, 'away');
  if (!homeSplit || !awaySplit) return null;
  return {
    homeSplit,
    awaySplit,
    samples: {
      home: homeSplit.played,
      away: awaySplit.played,
      required: 5,
      complete: homeSplit.played >= 5 && awaySplit.played >= 5
    }
  };
}

export function matchFixture(fixtures, context = {}) {
  if (!Array.isArray(fixtures) || !fixtures.length) return null;
  const eventId = String(context.sourceEventId || '');
  if (eventId) {
    const exact = fixtures.find(fixture => String(fixture.sourceId || fixture.id) === eventId || String(fixture.id) === eventId);
    if (exact) return exact;
  }
  let best = null;
  for (const fixture of fixtures) {
    const direct = (similarity(context.homeName, fixture.home?.name) + similarity(context.awayName, fixture.away?.name)) / 2;
    const reverse = (similarity(context.homeName, fixture.away?.name) + similarity(context.awayName, fixture.home?.name)) / 2;
    if (reverse > direct) continue;
    let score = direct;
    if (context.league && fixture.league?.name) score = score * 0.9 + similarity(context.league, fixture.league.name) * 0.1;
    if (!best || score > best.score) best = { fixture, score };
  }
  return best && best.score >= 0.72 ? best.fixture : null;
}
