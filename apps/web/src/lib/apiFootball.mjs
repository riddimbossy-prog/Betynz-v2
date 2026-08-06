import { cacheGet, cacheSet } from './cache.mjs';
import { configuredValue } from './env.mjs';
import { normalizeName, round, similarity } from './utils.mjs';

const DEFAULT_BASE_URL = 'https://v3.football.api-sports.io';
const FINISHED = new Set(['FT', 'AET', 'PEN']);

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value ?? '').trim();
}

function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value));
}

function config(env = process.env) {
  const key = text(env.API_FOOTBALL_KEY);
  return {
    configured: configuredValue(key),
    key,
    baseUrl: text(env.API_FOOTBALL_BASE_URL) || DEFAULT_BASE_URL,
    headerName: text(env.API_FOOTBALL_KEY_HEADER) || 'x-apisports-key',
    timeoutMs: Math.max(3000, number(env.API_FOOTBALL_TIMEOUT_MS, 20000)),
    retries: Math.max(0, Math.min(3, number(env.API_FOOTBALL_RETRIES, 2))),
    cacheTtlSeconds: Math.max(60, number(env.API_FOOTBALL_CACHE_TTL_SECONDS, 1800)),
    visualTtlSeconds: Math.max(300, number(env.API_FOOTBALL_VISUAL_CACHE_TTL_SECONDS, 604800)),
    enrichConcurrency: Math.max(1, Math.min(8, number(env.API_FOOTBALL_ENRICH_CONCURRENCY, 3))),
    historyLast: Math.max(10, Math.min(100, number(env.API_FOOTBALL_HISTORY_LAST, 40))),
    mappingThreshold: Math.max(0.45, Math.min(0.95, number(env.API_FOOTBALL_MAPPING_THRESHOLD, 0.55))),
    deepStats: !['0', 'false', 'no', 'off'].includes(text(env.API_FOOTBALL_DEEP_STATS).toLowerCase())
  };
}

export function apiFootballConfigured(env = process.env) {
  return config(env).configured;
}

export function apiFootballPublicConfig(env = process.env) {
  const value = config(env);
  return {
    configured: value.configured,
    baseUrl: value.baseUrl,
    headerName: value.headerName,
    fixtureScope: 'ALL_DAILY_FIXTURES',
    mappingThreshold: value.mappingThreshold,
    deepStats: value.deepStats
  };
}

function responseArray(body) {
  return Array.isArray(body?.response) ? body.response : [];
}

function apiErrors(body) {
  if (!body?.errors) return [];
  if (Array.isArray(body.errors)) return body.errors.filter(Boolean).map(String);
  if (typeof body.errors === 'object') return Object.values(body.errors).filter(Boolean).map(String);
  return [String(body.errors)];
}

async function apiRequest(path, params = {}, ttlSeconds = null) {
  const current = config();
  if (!current.configured) return { configured: false, response: [], errors: ['API_FOOTBALL_KEY is not configured'] };
  const url = new URL(path.replace(/^\//, ''), current.baseUrl.endsWith('/') ? current.baseUrl : `${current.baseUrl}/`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && text(value) !== '') url.searchParams.set(name, String(value));
  }
  const cacheKey = `api-football:${url.toString()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let lastError = null;
  for (let attempt = 0; attempt <= current.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), current.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          [current.headerName]: current.key,
          accept: 'application/json',
          'user-agent': 'Betynz-API-Football-Enrichment/4.0.1'
        },
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      const errors = apiErrors(body);
      if (!response.ok || errors.length) {
        const error = new Error(errors.join('; ') || `API-Football returned HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const rawResponse = body?.response ?? null;
      const normalized = {
        configured: true,
        ...body,
        rawResponse,
        response: Array.isArray(rawResponse) ? rawResponse : rawResponse && typeof rawResponse === 'object' ? [rawResponse] : [],
        fetchedAt: new Date().toISOString()
      };
      cacheSet(cacheKey, normalized, ttlSeconds ?? current.cacheTtlSeconds);
      clearTimeout(timer);
      return normalized;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < current.retries) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError || new Error('API-Football request failed');
}

function kickoffMs(fixture) {
  const raw = fixture?.fixture?.date ?? fixture?.kickoff ?? fixture?.date;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : null;
}

function apiFixtureNames(item) {
  return {
    home: text(item?.teams?.home?.name),
    away: text(item?.teams?.away?.name)
  };
}

function sourceFixtureNames(item) {
  return {
    home: text(item?.home?.name ?? item?.homeTeam?.name ?? item?.home_team),
    away: text(item?.away?.name ?? item?.awayTeam?.name ?? item?.away_team)
  };
}

function leagueName(item) {
  return text(item?.league?.name ?? item?.leagueName ?? item?.competition?.name);
}

function countryName(item) {
  return text(item?.league?.country ?? item?.country ?? item?.countryName);
}

export function fixtureMatchScore(source, candidate) {
  const wanted = sourceFixtureNames(source);
  const actual = apiFixtureNames(candidate);
  if (!wanted.home || !wanted.away || !actual.home || !actual.away) return 0;
  const direct = (similarity(wanted.home, actual.home) + similarity(wanted.away, actual.away)) / 2;
  const reverse = (similarity(wanted.home, actual.away) + similarity(wanted.away, actual.home)) / 2;
  if (reverse > direct + 0.04) return 0;
  let score = direct * 0.78;
  const sourceLeague = leagueName(source);
  const apiLeague = leagueName(candidate);
  if (sourceLeague && apiLeague) score += similarity(sourceLeague, apiLeague) * 0.10;
  const sourceCountry = countryName(source);
  const apiCountry = countryName(candidate);
  if (sourceCountry && apiCountry) score += similarity(sourceCountry, apiCountry) * 0.04;
  const sourceKickoff = kickoffMs(source);
  const apiKickoff = kickoffMs(candidate);
  if (sourceKickoff !== null && apiKickoff !== null) {
    const minutes = Math.abs(sourceKickoff - apiKickoff) / 60000;
    if (minutes <= 5) score += 0.08;
    else if (minutes <= 30) score += 0.05;
    else if (minutes <= 120) score += 0.02;
    else if (minutes > 720) score -= 0.08;
  }
  return Math.max(0, Math.min(1, score));
}

export function matchApiFootballFixture(source, candidates = [], threshold = config().mappingThreshold) {
  let best = null;
  for (const candidate of candidates || []) {
    const score = fixtureMatchScore(source, candidate);
    if (!best || score > best.score) best = { fixture: candidate, score };
  }
  return best && best.score >= threshold ? best : null;
}

function teamVisual(team) {
  if (!team?.id || !team?.name) return null;
  return { id: team.id, name: team.name, logo: team.logo || null };
}

function leagueVisual(league) {
  if (!league) return { id: null, logo: null, flag: null, season: null };
  return { id: league.id || null, logo: league.logo || null, flag: league.flag || null, season: league.season || null };
}

export async function getApiFootballDailyFixtures(date) {
  if (!safeDate(date)) throw new Error('date must be YYYY-MM-DD');
  const body = await apiRequest('/fixtures', { date }, 300);
  return { configured: body.configured, fixtures: responseArray(body), fetchedAt: body.fetchedAt || null };
}

export async function resolveApiFootballTeam(name, country = '') {
  const current = config();
  if (!current.configured || text(name).length < 2) return null;
  const cacheKey = `api-football-team:${normalizeName(name)}:${normalizeName(country)}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;
  const body = await apiRequest('/teams', { search: name }, current.visualTtlSeconds);
  let best = null;
  for (const row of responseArray(body)) {
    const team = row?.team || row;
    const nameScore = similarity(name, team?.name);
    const countryScore = country && row?.venue?.country ? similarity(country, row.venue.country) : 0;
    const score = nameScore * 0.92 + countryScore * 0.08;
    if (!best || score > best.score) best = { id: team?.id, name: team?.name, logo: team?.logo || null, country: row?.venue?.country || country || null, score };
  }
  const visual = best && best.score >= 0.55 ? { ...best, confidence: round(best.score, 3) } : null;
  cacheSet(cacheKey, visual, current.visualTtlSeconds);
  return visual;
}

async function mapWithConcurrency(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

export async function enrichApiFootballVisuals(date, fixtures = []) {
  const current = config();
  if (!current.configured) return { configured: false, source: null, visuals: [] };
  const daily = await getApiFootballDailyFixtures(date);
  const visuals = await mapWithConcurrency(fixtures, current.enrichConcurrency, async source => {
    const match = matchApiFootballFixture(source, daily.fixtures, current.mappingThreshold);
    if (match) {
      const row = match.fixture;
      return {
        fixtureId: source.id,
        apiFixtureId: row?.fixture?.id || null,
        mappingConfidence: round(match.score, 3),
        home: teamVisual(row?.teams?.home),
        away: teamVisual(row?.teams?.away),
        league: leagueVisual(row?.league)
      };
    }
    const [home, away] = await Promise.all([
      resolveApiFootballTeam(source?.home?.name, source?.league?.country).catch(() => null),
      resolveApiFootballTeam(source?.away?.name, source?.league?.country).catch(() => null)
    ]);
    return {
      fixtureId: source.id,
      apiFixtureId: null,
      mappingConfidence: 0,
      home: home ? { id: home.id, name: home.name, logo: home.logo } : null,
      away: away ? { id: away.id, name: away.name, logo: away.logo } : null,
      league: null
    };
  });
  return { configured: true, source: 'API_FOOTBALL', visuals, fetchedAt: daily.fetchedAt };
}

function fixtureStatus(row) {
  return text(row?.fixture?.status?.short).toUpperCase();
}

function isCompletedFixture(row) {
  return FINISHED.has(fixtureStatus(row)) && number(row?.goals?.home) !== null && number(row?.goals?.away) !== null;
}

function historyRow(row) {
  return {
    id: row?.fixture?.id || null,
    date: row?.fixture?.date || null,
    status: fixtureStatus(row),
    home_team: { id: row?.teams?.home?.id || null, name: row?.teams?.home?.name || '' },
    away_team: { id: row?.teams?.away?.id || null, name: row?.teams?.away?.name || '' },
    full_time_score: { home: number(row?.goals?.home, 0), away: number(row?.goals?.away, 0) },
    half_time_score: {
      home: number(row?.score?.halftime?.home),
      away: number(row?.score?.halftime?.away)
    },
    league: { id: row?.league?.id || null, name: row?.league?.name || '', country: row?.league?.country || '' }
  };
}

function selectVenueHistory(rows, teamId, venue, beforeMs, limit = 5) {
  return (rows || [])
    .filter(isCompletedFixture)
    .filter(row => {
      const kickoff = kickoffMs(row);
      if (beforeMs && kickoff && kickoff >= beforeMs) return false;
      return venue === 'home' ? Number(row?.teams?.home?.id) === Number(teamId) : Number(row?.teams?.away?.id) === Number(teamId);
    })
    .sort((a, b) => (kickoffMs(b) || 0) - (kickoffMs(a) || 0))
    .slice(0, limit)
    .map(historyRow);
}

function teamStatsSummary(body) {
  const row = responseArray(body)[0] || body?.response || null;
  if (!row || Array.isArray(row)) return null;
  return {
    form: row.form || null,
    fixtures: row.fixtures || null,
    goals: row.goals || null,
    biggest: row.biggest || null,
    cleanSheet: row.clean_sheet || null,
    failedToScore: row.failed_to_score || null,
    penalty: row.penalty || null,
    cards: row.cards || null,
    lineups: row.lineups || null
  };
}

function fixtureMeta(row, confidence) {
  return {
    id: row?.fixture?.id || null,
    date: row?.fixture?.date || null,
    referee: row?.fixture?.referee || null,
    timezone: row?.fixture?.timezone || null,
    venue: row?.fixture?.venue || null,
    status: row?.fixture?.status || null,
    league: row?.league || null,
    home: teamVisual(row?.teams?.home),
    away: teamVisual(row?.teams?.away),
    mappingConfidence: round(confidence, 3)
  };
}

function compactStandings(body) {
  const league = responseArray(body)[0]?.league || null;
  return league ? { id: league.id, name: league.name, country: league.country, season: league.season, logo: league.logo, flag: league.flag, standings: league.standings || [] } : null;
}

function compactInjuries(body) {
  return responseArray(body).map(row => ({
    player: row.player || null,
    team: row.team || null,
    fixture: row.fixture || null,
    league: row.league || null
  }));
}

export async function getApiFootballIntelligence(context = {}, sourceFixture = null, options = {}) {
  const current = config();
  if (!current.configured) return null;
  const date = text(context.date || context.beforeDate || sourceFixture?.kickoff?.slice?.(0, 10));
  if (!safeDate(date)) return null;
  const source = sourceFixture || {
    id: context.fixtureId || context.sourceEventId || null,
    kickoff: context.kickoff,
    home: { name: context.homeName },
    away: { name: context.awayName },
    league: { name: context.league, country: context.country }
  };
  const daily = await getApiFootballDailyFixtures(date);
  const match = matchApiFootballFixture(source, daily.fixtures, current.mappingThreshold);
  if (!match) return { source: 'API_FOOTBALL', mapped: false, mappingConfidence: 0, home: { history: [] }, away: { history: [] } };

  const row = match.fixture;
  const fixtureId = row?.fixture?.id;
  const homeId = row?.teams?.home?.id;
  const awayId = row?.teams?.away?.id;
  const leagueId = row?.league?.id;
  const season = row?.league?.season;
  const beforeMs = kickoffMs(row) || kickoffMs(source) || Date.now();
  const mode = options.mode || 'deep';
  const historyTtl = Math.max(current.cacheTtlSeconds, 1800);

  const [homeFixturesBody, awayFixturesBody] = await Promise.all([
    apiRequest('/fixtures', { team: homeId, last: current.historyLast, status: 'FT' }, historyTtl),
    apiRequest('/fixtures', { team: awayId, last: current.historyLast, status: 'FT' }, historyTtl)
  ]);
  const homeHistory = selectVenueHistory(responseArray(homeFixturesBody), homeId, 'home', beforeMs, 5);
  const awayHistory = selectVenueHistory(responseArray(awayFixturesBody), awayId, 'away', beforeMs, 5);

  const base = {
    source: 'API_FOOTBALL',
    mapped: true,
    mappingConfidence: round(match.score, 3),
    fixture: fixtureMeta(row, match.score),
    home: { id: homeId, name: row?.teams?.home?.name || context.homeName, logo: row?.teams?.home?.logo || null, history: homeHistory },
    away: { id: awayId, name: row?.teams?.away?.name || context.awayName, logo: row?.teams?.away?.logo || null, history: awayHistory },
    league: leagueVisual(row?.league)
  };

  const coreRequests = [
    leagueId && season ? apiRequest('/standings', { league: leagueId, season }, 1800) : Promise.resolve(null),
    leagueId && season && homeId ? apiRequest('/teams/statistics', { league: leagueId, season, team: homeId }, 1800) : Promise.resolve(null),
    leagueId && season && awayId ? apiRequest('/teams/statistics', { league: leagueId, season, team: awayId }, 1800) : Promise.resolve(null),
    homeId && awayId ? apiRequest('/fixtures/headtohead', { h2h: `${homeId}-${awayId}`, last: 10 }, 3600) : Promise.resolve(null),
    fixtureId ? apiRequest('/predictions', { fixture: fixtureId }, 1800) : Promise.resolve(null),
    fixtureId ? apiRequest('/injuries', { fixture: fixtureId }, 900) : Promise.resolve(null)
  ];
  const [standings, homeStats, awayStats, h2h, predictions, injuries] = await Promise.all(coreRequests.map(promise => promise.catch(() => null)));

  const deep = {};
  if (mode !== 'engine' && current.deepStats && fixtureId) {
    const [fixtureStatistics, lineups, events, players] = await Promise.all([
      apiRequest('/fixtures/statistics', { fixture: fixtureId }, 300).catch(() => null),
      apiRequest('/fixtures/lineups', { fixture: fixtureId }, 300).catch(() => null),
      apiRequest('/fixtures/events', { fixture: fixtureId }, 60).catch(() => null),
      apiRequest('/fixtures/players', { fixture: fixtureId }, 300).catch(() => null)
    ]);
    deep.fixtureStatistics = responseArray(fixtureStatistics);
    deep.lineups = responseArray(lineups);
    deep.events = responseArray(events);
    deep.players = responseArray(players);
  }

  return {
    ...base,
    standings: compactStandings(standings),
    teamStatistics: { home: teamStatsSummary(homeStats), away: teamStatsSummary(awayStats) },
    h2h: responseArray(h2h).map(historyRow),
    predictions: responseArray(predictions)[0] || null,
    injuries: compactInjuries(injuries),
    ...deep
  };
}

export async function enrichApiFootballStatsBoard(date, fixtures = [], extractVenueStats) {
  const current = config();
  if (!current.configured) return { configured: false, source: null, warning: 'API_FOOTBALL_KEY is not configured.', fixtures };
  const enriched = await mapWithConcurrency(fixtures, current.enrichConcurrency, async fixture => {
    const context = {
      date,
      beforeDate: date,
      sourceEventId: fixture.sourceId || fixture.id,
      kickoff: fixture.kickoff,
      homeName: fixture.home?.name,
      awayName: fixture.away?.name,
      league: fixture.league?.name,
      country: fixture.league?.country
    };
    try {
      const intelligence = await getApiFootballIntelligence(context, fixture, { mode: 'engine' });
      const stats = typeof extractVenueStats === 'function' ? extractVenueStats(intelligence, context) : null;
      const apiFixture = intelligence?.fixture;
      return {
        ...fixture,
        home: { ...fixture.home, id: apiFixture?.home?.id || fixture.home?.id || null, logo: apiFixture?.home?.logo || fixture.home?.logo || null },
        away: { ...fixture.away, id: apiFixture?.away?.id || fixture.away?.id || null, logo: apiFixture?.away?.logo || fixture.away?.logo || null },
        league: { ...fixture.league, id: apiFixture?.league?.id || fixture.league?.id || null, logo: apiFixture?.league?.logo || fixture.league?.logo || null, flag: apiFixture?.league?.flag || fixture.league?.flag || null, season: apiFixture?.league?.season || fixture.league?.season || null },
        stats: stats ? {
          ...stats,
          source: 'API_FOOTBALL',
          mappingConfidence: intelligence?.mappingConfidence || null,
          standings: intelligence?.standings || null,
          teamStatistics: intelligence?.teamStatistics || null,
          h2h: intelligence?.h2h || [],
          predictions: intelligence?.predictions || null,
          injuries: intelligence?.injuries || []
        } : null,
        apiFootballFixtureId: apiFixture?.id || null
      };
    } catch {
      return { ...fixture, stats: null };
    }
  });
  return {
    configured: true,
    source: 'API_FOOTBALL',
    warning: null,
    fixtures: enriched,
    fixtureScope: 'ALL_DAILY_FIXTURES'
  };
}
