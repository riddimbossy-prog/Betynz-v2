import { canonical, isoDate, number, safeDate, stripProviderId, text } from './core.mjs';

function getPath(object, path) {
  let current = object;
  for (const part of String(path).split('.')) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

export function firstValue(object, keys) {
  for (const key of keys) {
    const value = key.includes('.') ? getPath(object, key) : object?.[key];
    if (value !== undefined && value !== null && text(value) !== '') return value;
  }
  return null;
}

function teamName(value) {
  if (typeof value === 'string' || typeof value === 'number') return text(value);
  if (!value || typeof value !== 'object') return '';
  return text(firstValue(value, ['name','teamName','team_name','displayName','display_name','shortName','short_name','competitorName','participantName','title','label']));
}

function splitEventName(value) {
  const raw = text(value);
  for (const separator of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+[–—-]\s+/]) {
    const parts = raw.split(separator).map(text).filter(Boolean);
    if (parts.length === 2) return { home: parts[0], away: parts[1] };
  }
  return { home: '', away: '' };
}

function extractTeams(row) {
  let home = teamName(firstValue(row, ['home_team','homeTeam','home','team_home','teamHome','homeTeamName','home_team_name','homeName','team1','participant1','competitors.0']));
  let away = teamName(firstValue(row, ['away_team','awayTeam','away','team_away','teamAway','awayTeamName','away_team_name','awayName','team2','participant2','competitors.1']));
  const competitors = [row?.competitors,row?.teams,row?.participants,row?.competitorList,row?.participantList].find(Array.isArray);
  if ((!home || !away) && competitors) {
    for (const item of competitors) {
      const role = canonical(firstValue(item, ['qualifier','side','type','position','role','homeAway']));
      if (!home && /^(home|1|team 1)$/.test(role)) home = teamName(item);
      if (!away && /^(away|2|team 2)$/.test(role)) away = teamName(item);
    }
    home ||= teamName(competitors[0]);
    away ||= teamName(competitors[1]);
  }
  if (!home || !away) {
    const split = splitEventName(firstValue(row, ['eventName','matchName','fixtureName','displayName','name','title']));
    home ||= split.home;
    away ||= split.away;
  }
  return { home, away };
}

function epochMs(value) {
  const date = safeDate(value);
  return date?.getTime() || 0;
}

function marketArrays(row) {
  const out = [];
  for (const key of ['markets','market','betOffers','bet_offers','mainMarkets','displayMarkets','marketList','betMarkets','marketGroups']) {
    const value = row?.[key];
    if (Array.isArray(value)) out.push(...value);
  }
  return out;
}

function outcomeArrays(market) {
  for (const key of ['outcomes','selections','options','values','choices','outcomeList','selectionList']) {
    if (Array.isArray(market?.[key])) return market[key];
  }
  return [];
}

function outcomePrice(outcome) {
  const value = number(firstValue(outcome, ['odds','odd','price','decimal_odds','decimalOdds','decimalPrice','value','currentOdds','currentOdd']));
  return value && value > 1 && value < 1000 ? value : null;
}

function parseLine(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = text(value);
    const match = raw.match(/(?:^|[^\d])([+-]?\d+(?:[.,]\d+)?)(?:$|[^\d])/);
    if (match) {
      const n = number(match[1]);
      if (n !== null && Math.abs(n) <= 20) return n;
    }
  }
  return null;
}

function normalizeMarkets(row) {
  return marketArrays(row).map((market, marketIndex) => {
    const id = text(firstValue(market, ['id','marketId','market_id','key','templateId'])) || `market-${marketIndex + 1}`;
    const name = text(firstValue(market, ['name','desc','description','market_name','marketName','title'])) || id;
    const specifier = text(firstValue(market, ['specifier','specifiers','line','handicap','total'])) || null;
    const line = parseLine(firstValue(market, ['line','handicap','total','points']), specifier, name);
    const outcomes = outcomeArrays(market).map((outcome, index) => ({
      id: text(firstValue(outcome, ['id','outcomeId','outcome_id','selectionId','selection_id','key'])) || String(index + 1),
      name: text(firstValue(outcome, ['name','desc','description','label','outcomeName','outcome_name','selectionName','shortName'])) || String(index + 1),
      odds: outcomePrice(outcome),
      status: text(firstValue(outcome, ['status','state','active'])) || null,
      line: parseLine(firstValue(outcome, ['line','handicap','total','points']), name)
    })).filter(outcome => outcome.name || outcome.odds);
    return { id, name, specifier, line, outcomes };
  }).filter(market => market.outcomes.length);
}

function outcomeSlot(label, index, count) {
  const value = canonical(label);
  if (['home','home win','1','team 1'].includes(value)) return 'home';
  if (['draw','x','tie'].includes(value)) return 'draw';
  if (['away','away win','2','team 2'].includes(value)) return 'away';
  if (count === 3) return ['home','draw','away'][index] || null;
  return null;
}

function lineKey(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return String(n).replace('.', '');
}

function resultKey(outcome) {
  const label = canonical(outcome.name);
  if (/^(yes|gg|both teams to score yes)$/.test(label)) return 'Yes';
  if (/^(no|ng|both teams to score no)$/.test(label)) return 'No';
  return null;
}

export function normalizedOddsFromMarkets(markets = []) {
  const odds = {};
  const set = (key, value) => { if (key && value && !odds[key]) odds[key] = value; };
  for (const market of markets) {
    const name = canonical(market.name);
    const isFirstHalf = /(?:1st|first) half|half time/.test(name) && !/full time|ht ft|half time full time/.test(name);
    const isHtFt = /ht\s*ft|half time\s*full time|halftime\s*fulltime/.test(name);
    const isTeamTotalHome = /home.*total|team 1.*total/.test(name);
    const isTeamTotalAway = /away.*total|team 2.*total/.test(name);
    const isDoubleChance = /double chance|1x x2 12/.test(name);
    const isBtts = /both teams.*score|btts|gg ng/.test(name);
    const isTotal = /total goals|over under|goals over under|match goals/.test(name) && !isTeamTotalHome && !isTeamTotalAway;
    const isResult = /^(1x2|match result|full time result|3 way|winner|result)$/.test(name) || /1x2/.test(name);

    if (isHtFt) {
      for (const outcome of market.outcomes) {
        const label = canonical(outcome.name).replace(/\s+/g, '');
        const compact = label.replace(/home/g,'1').replace(/draw|x/g,'x').replace(/away/g,'2').replace(/[^12x]/g,'');
        if (compact.length >= 2) set(`htft${compact.slice(0,2).toUpperCase()}`, outcome.odds);
      }
      continue;
    }

    if (isResult && !isFirstHalf) {
      market.outcomes.forEach((outcome, index) => {
        const slot = outcomeSlot(outcome.name, index, market.outcomes.length);
        if (slot === 'home') set('homeWin', outcome.odds);
        if (slot === 'draw') set('draw', outcome.odds);
        if (slot === 'away') set('awayWin', outcome.odds);
      });
      continue;
    }

    if (isResult && isFirstHalf) {
      market.outcomes.forEach((outcome, index) => {
        const slot = outcomeSlot(outcome.name, index, market.outcomes.length);
        if (slot === 'home') set('firstHalfHome', outcome.odds);
        if (slot === 'draw') set('firstHalfDraw', outcome.odds);
        if (slot === 'away') set('firstHalfAway', outcome.odds);
      });
      continue;
    }

    if (isDoubleChance) {
      for (const outcome of market.outcomes) {
        const label = canonical(outcome.name).replace(/\s+/g,'').toUpperCase();
        if (/^(1X|HOMEORDRAW)$/.test(label)) set('doubleChance1X', outcome.odds);
        if (/^(12|HOMEORAWAY)$/.test(label)) set('doubleChance12', outcome.odds);
        if (/^(X2|DRAWORAWAY)$/.test(label)) set('doubleChanceX2', outcome.odds);
      }
      continue;
    }

    if (isBtts) {
      for (const outcome of market.outcomes) {
        const slot = resultKey(outcome);
        if (slot === 'Yes') set(isFirstHalf ? 'firstHalfBttsYes' : 'bttsYes', outcome.odds);
        if (slot === 'No') set(isFirstHalf ? 'firstHalfBttsNo' : 'bttsNo', outcome.odds);
      }
      continue;
    }

    if (isTotal || isTeamTotalHome || isTeamTotalAway || (isFirstHalf && /total|over under/.test(name))) {
      for (const outcome of market.outcomes) {
        const label = canonical(outcome.name);
        const direction = /\bover\b/.test(label) ? 'Over' : /\bunder\b/.test(label) ? 'Under' : null;
        const line = outcome.line ?? market.line ?? parseLine(outcome.name, market.name, market.specifier);
        const keyLine = lineKey(line);
        if (!direction || !keyLine) continue;
        let prefix = '';
        if (isTeamTotalHome) prefix = 'home';
        else if (isTeamTotalAway) prefix = 'away';
        else if (isFirstHalf) prefix = 'firstHalf';
        const key = `${prefix}${direction}${keyLine}`;
        set(`${key.charAt(0).toLowerCase()}${key.slice(1)}`, outcome.odds);
      }
    }
  }
  return odds;
}

function parseScorePair(value) {
  if (value && typeof value === 'object') {
    const home = number(firstValue(value, ['home','homeScore','home_score','team1','score1']));
    const away = number(firstValue(value, ['away','awayScore','away_score','team2','score2']));
    if (home !== null || away !== null) return { home, away };
  }
  const match = text(value).match(/(\d+)\s*[:\-]\s*(\d+)/);
  return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

export function normalizeScore(row) {
  const current = parseScorePair(firstValue(row, ['score','currentScore','current_score','scores.current','result','goals'])) || {
    home: number(firstValue(row, ['homeScore','home_score','scoreHome','score_home','goals.home','scores.home','scores.fulltime.home','fullTimeScore.home'])),
    away: number(firstValue(row, ['awayScore','away_score','scoreAway','score_away','goals.away','scores.away','scores.fulltime.away','fullTimeScore.away']))
  };
  const half = parseScorePair(firstValue(row, ['halfTimeScore','halftimeScore','half_time_score','partial','scores.halftime'])) || {
    home: number(firstValue(row, ['halfTimeHome','halftimeHome','htHome','scores.halftime.home'])),
    away: number(firstValue(row, ['halfTimeAway','halftimeAway','htAway','scores.halftime.away']))
  };
  if (current.home === null && current.away === null && half.home === null && half.away === null) return null;
  return {
    home: current.home,
    away: current.away,
    halftimeHome: half.home,
    halftimeAway: half.away
  };
}

function normalizeStatus(raw, minute, score) {
  const value = canonical(raw);
  if (/cancel/.test(value)) return 'CANC';
  if (/postpon/.test(value)) return 'PST';
  if (/abandon|suspend/.test(value)) return 'SUSP';
  if (/penalt/.test(value)) return 'PEN';
  if (/extra time|aet/.test(value)) return 'AET';
  if (/finished|full time|ended|completed|\bft\b/.test(value)) return 'FT';
  if (/half time|halftime|\bht\b|break/.test(value)) return 'HT';
  if (/second half|2nd half|2h/.test(value)) return '2H';
  if (/first half|1st half|1h/.test(value)) return '1H';
  if (/live|in play|inplay/.test(value) || (minute && minute > 0)) return 'LIVE';
  if (/not start|scheduled|upcoming|prematch|pre match|ns/.test(value)) return 'NS';
  if (score && score.home !== null && score.away !== null && value) return 'LIVE';
  return text(raw) || 'NS';
}

function extractMinute(row) {
  const direct = number(firstValue(row, ['minute','minutes','matchMinute','match_minute','clock.minute','timer.minute','liveTime']));
  if (direct !== null) return direct;
  const match = text(firstValue(row, ['time','clock','statusDesc','eventStatusDesc'])).match(/(\d{1,3})\s*['′]/);
  return match ? Number(match[1]) : null;
}

function eventIncidents(row) {
  const arrays = [];
  for (const key of ['events','incidents','timeline','matchEvents','eventList']) {
    const value = row?.[key];
    if (Array.isArray(value)) arrays.push(...value);
  }
  return arrays.map(item => ({
    time: (number(firstValue(item, ['time','minute','elapsed'])) ?? text(firstValue(item, ['time','minute','elapsed']))) || null,
    type: text(firstValue(item, ['type','eventType','event_type','name'])) || 'Event',
    detail: text(firstValue(item, ['detail','description','desc','subType','sub_type'])) || null,
    team: teamName(firstValue(item, ['team','participant','competitor'])) || text(firstValue(item, ['teamName','team_name'])) || null,
    player: teamName(firstValue(item, ['player'])) || text(firstValue(item, ['playerName','player_name'])) || null
  }));
}

export function normalizeEvent(row, context = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const teams = extractTeams(row);
  if (!teams.home || !teams.away || canonical(teams.home) === canonical(teams.away)) return null;
  const rawId = firstValue(row, ['event_id','eventId','game_id','gameId','id','fixture_id','fixtureId','matchId','match_id','sportEventId']);
  const id = stripProviderId(rawId || `${teams.home}-${teams.away}-${firstValue(row,['estimateStartTime','startTime','kickoff','date'])}`);
  const startMs = epochMs(firstValue(row, ['start_time','startTime','kickoff','kick_off','scheduled','scheduled_at','event_time','eventTime','date','estimateStartTime','estimatedStartTime','scheduledStartTime','startTimestamp','timestamp']));
  const markets = normalizeMarkets(row);
  const odds = normalizedOddsFromMarkets(markets);
  const score = normalizeScore(row);
  const minute = extractMinute(row);
  const rawStatus = firstValue(row, ['match_status','matchStatus','status','state','eventStatus','eventStatusDesc','statusDescription']);
  const league = text(firstValue(row, ['league','tournament_name','tournamentName','competition','tournament.name','competition.name','league.name'])) || text(context.league) || 'Football';
  const country = text(firstValue(row, ['country','country_name','countryName','category','category.name'])) || text(context.country) || 'International';
  const status = normalizeStatus(rawStatus, minute, score);
  return {
    id,
    event_id: id,
    provider_fixture_id: id,
    game_id: text(firstValue(row, ['game_id','gameId'])) || id,
    league,
    country,
    league_id: firstValue(row, ['tournament_id','tournamentId','league_id','leagueId','tournament.id']) || null,
    home_team: teams.home,
    away_team: teams.away,
    home_team_id: firstValue(row, ['home_team_id','homeTeamId','home.id','homeTeam.id']) || null,
    away_team_id: firstValue(row, ['away_team_id','awayTeamId','away.id','awayTeam.id']) || null,
    start_time: startMs,
    kickoff: startMs ? new Date(startMs).toISOString() : isoDate(firstValue(row, ['kickoff','date'])),
    status,
    match_status: status,
    statusLong: text(rawStatus) || status,
    minute,
    score,
    odds,
    oddsHome: odds.homeWin || null,
    oddsDraw: odds.draw || null,
    oddsAway: odds.awayWin || null,
    markets,
    market_count: markets.length,
    events: eventIncidents(row),
    source: 'SPORTYBET_CUSTOM_API',
    rawSource: 'SPORTYBET_CUSTOM_API'
  };
}

function arraysDeep(root, maxNodes = 100000) {
  const arrays = [];
  const stack = [root];
  const seen = new Set();
  let visited = 0;
  while (stack.length && visited < maxNodes) {
    const node = stack.pop();
    visited += 1;
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      arrays.push(node);
      for (const value of node) if (value && typeof value === 'object') stack.push(value);
    } else {
      for (const value of Object.values(node)) if (value && typeof value === 'object') stack.push(value);
    }
  }
  return arrays;
}

function listFrom(candidate, keys) {
  for (const key of keys) {
    const value = firstValue(candidate, [key]);
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function collectEventsFromObject(root) {
  const output = [];
  const map = new Map();
  const roots = [root, root?.data, root?.payload, root?.result, root?.response].filter(Boolean);
  const add = (raw, context = {}) => {
    const row = normalizeEvent(raw, context);
    if (!row) return;
    const current = map.get(row.id);
    if (!current || row.market_count > current.market_count || (row.score && !current.score)) map.set(row.id, { ...current, ...row, markets: row.markets.length ? row.markets : current?.markets || [], odds: { ...(current?.odds || {}), ...(row.odds || {}) } });
  };
  for (const candidate of roots) {
    add(candidate);
    for (const raw of listFrom(candidate, ['events','eventList','matches','fixtures','items','data.events'])) add(raw);
    for (const tournament of listFrom(candidate, ['tournaments','tournamentList','tournament_list','categories','categoryList','competitions','competitionList','data.tournaments','data.tournamentList'])) {
      const context = {
        league: firstValue(tournament, ['tournament_name','tournamentName','name','category','leagueName']),
        country: firstValue(tournament, ['country','country_name','countryName','categoryName','category.name'])
      };
      for (const raw of listFrom(tournament, ['events','eventList','matches','fixtures','items'])) add(raw, context);
    }
  }
  for (const array of arraysDeep(root)) for (const raw of array) add(raw);
  output.push(...map.values());
  return output.sort((a,b) => (a.start_time || 0) - (b.start_time || 0));
}

export function publicFixture(row, { includeMarkets = true, includeEvents = false } = {}) {
  return {
    id: row.id,
    sourceId: row.id,
    eventId: row.id,
    kickoff: row.kickoff,
    status: row.status,
    statusLong: row.statusLong,
    minute: row.minute,
    score: row.score,
    halfTime: row.score ? { home: row.score.halftimeHome, away: row.score.halftimeAway } : null,
    half_time: row.score ? { home: row.score.halftimeHome, away: row.score.halftimeAway } : null,
    league: { id: row.league_id, name: row.league, country: row.country },
    home: { id: row.home_team_id, name: row.home_team },
    away: { id: row.away_team_id, name: row.away_team },
    odds: row.odds,
    oddsHome: row.oddsHome,
    oddsDraw: row.oddsDraw,
    oddsAway: row.oddsAway,
    marketCount: row.market_count,
    ...(includeMarkets ? { markets: row.markets } : {}),
    ...(includeEvents ? { events: row.events } : {}),
    rawSource: 'SPORTYBET_CUSTOM_API'
  };
}
