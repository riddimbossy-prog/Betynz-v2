import { cacheGet, cacheSet } from './cache.mjs';
import { configuredValue } from './env.mjs';
import { normalizeName, round, similarity } from './utils.mjs';

const DEFAULT_BASE_URL = 'https://v3.football.api-sports.io';
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);

const apiInFlight = new Map();
const oddsDateInflight = new Map();
const apiQueue = [];
let apiActive = 0;
let apiNextAt = 0;
let apiTimer = null;
let apiQueueSequence = 0;
let apiBlockedUntil = 0;
let apiBlockedIdentity = null;
let apiRequestStarts = [];
let apiLastRateLimit = null;
let apiRateLimitCount = 0;

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

function truthy(value, fallback = true) {
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function config(env = process.env) {
  const key = text(env.API_FOOTBALL_KEY);
  const isTest = text(env.NODE_ENV).toLowerCase() === 'test' || Boolean(env.NODE_TEST_CONTEXT);
  return {
    configured: configuredValue(key),
    key,
    baseUrl: text(env.API_FOOTBALL_BASE_URL) || DEFAULT_BASE_URL,
    headerName: text(env.API_FOOTBALL_KEY_HEADER) || 'x-apisports-key',
    rapidApiHost: text(env.API_FOOTBALL_RAPIDAPI_HOST),
    timeoutMs: Math.max(3000, number(env.API_FOOTBALL_TIMEOUT_MS, 20000)),
    retries: Math.max(0, Math.min(4, number(env.API_FOOTBALL_RETRIES, 2))),
    // Render injects production environment variables during the build. Node's
    // test runner also exports NODE_TEST_CONTEXT, so tests must use a fully
    // deterministic local queue instead of inheriting the live 8-RPM / 65s
    // cooldown settings. Production remains controlled by the normal variables.
    rateLimitRetries: isTest
      ? Math.max(0, Math.min(6, number(env.API_FOOTBALL_TEST_RATE_LIMIT_RETRIES, 2)))
      : Math.max(0, Math.min(12, number(env.API_FOOTBALL_RATE_LIMIT_RETRIES, 6))),
    rateLimitCooldownMs: isTest
      ? Math.max(10, Math.min(5000, number(env.API_FOOTBALL_TEST_RATE_LIMIT_COOLDOWN_MS, 50)))
      : Math.max(1000, Math.min(180000, number(env.API_FOOTBALL_RATE_LIMIT_COOLDOWN_MS, 65000))),
    requestsPerMinute: isTest
      ? Math.max(60, Math.min(600, number(env.API_FOOTBALL_TEST_REQUESTS_PER_MINUTE, 600)))
      : Math.max(1, Math.min(600, number(env.API_FOOTBALL_REQUESTS_PER_MINUTE, 8))),
    cacheTtlSeconds: Math.max(60, number(env.API_FOOTBALL_CACHE_TTL_SECONDS, 1800)),
    fixtureTtlSeconds: Math.max(20, number(env.API_FOOTBALL_FIXTURE_CACHE_TTL_SECONDS, 120)),
    oddsTtlSeconds: Math.max(60, number(env.API_FOOTBALL_ODDS_CACHE_TTL_SECONDS, 300)),
    visualTtlSeconds: Math.max(300, number(env.API_FOOTBALL_VISUAL_CACHE_TTL_SECONDS, 604800)),
    enrichConcurrency: isTest
      ? Math.max(2, Math.min(8, number(env.API_FOOTBALL_TEST_ENRICH_CONCURRENCY, 4)))
      : Math.max(1, Math.min(8, number(env.API_FOOTBALL_ENRICH_CONCURRENCY, 2))),
    requestConcurrency: isTest
      ? Math.max(2, Math.min(6, number(env.API_FOOTBALL_TEST_REQUEST_CONCURRENCY, 4)))
      : Math.max(1, Math.min(6, number(env.API_FOOTBALL_REQUEST_CONCURRENCY, 1))),
    requestMinIntervalMs: isTest
      ? Math.max(0, Math.min(1000, number(env.API_FOOTBALL_TEST_REQUEST_MIN_INTERVAL_MS, 0)))
      : Math.max(0, Math.min(10000, number(env.API_FOOTBALL_REQUEST_MIN_INTERVAL_MS, 750))),
    retryBaseMs: Math.max(250, Math.min(10000, number(env.API_FOOTBALL_RETRY_BASE_MS, 1000))),
    retryMaxMs: Math.max(1000, Math.min(120000, number(env.API_FOOTBALL_RETRY_MAX_MS, 30000))),
    historyLast: Math.max(10, Math.min(100, number(env.API_FOOTBALL_HISTORY_LAST, 40))),
    engineHistoryTtlSeconds: Math.max(1800, number(env.API_FOOTBALL_ENGINE_HISTORY_TTL_SECONDS, 43200)),
    engineLeagueHistory: truthy(env.API_FOOTBALL_ENGINE_LEAGUE_HISTORY, true),
    mappingThreshold: Math.max(0.45, Math.min(0.95, number(env.API_FOOTBALL_MAPPING_THRESHOLD, 0.55))),
    deepStats: truthy(env.API_FOOTBALL_DEEP_STATS, true),
    bookmakerId: text(env.API_FOOTBALL_BOOKMAKER_ID),
    bookmakerName: text(env.API_FOOTBALL_BOOKMAKER_NAME),
    timezone: text(env.API_FOOTBALL_TIMEZONE) || 'UTC',
    maxOddsPages: Math.max(0, number(env.API_FOOTBALL_MAX_ODDS_PAGES, 0))
  };
}

function apiIdentity(current = config()) {
  return `${current.baseUrl}|${current.headerName}|${String(current.key || '').slice(-8)}`;
}

function activeBlockedUntil(current = config()) {
  return apiBlockedIdentity === apiIdentity(current) ? apiBlockedUntil : 0;
}

function pruneRequestWindow(now = Date.now()) {
  apiRequestStarts = apiRequestStarts.filter(startedAt => now - startedAt < 60000);
}

function requestPriority(path, params = {}) {
  const explicit = Number(params.__priority);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(9, explicit));
  const route = `/${String(path || '').replace(/^\/+/, '')}`;
  if (route === '/fixtures' && (params.date || params.live || params.id)) return 0;
  if (route === '/odds') return 1;
  if (['/fixtures/events', '/fixtures/statistics', '/fixtures/lineups', '/fixtures/players'].includes(route)) return 1;
  if (route === '/fixtures' && (params.league || params.team)) return 3;
  if (route === '/fixtures' && (params.from || params.to)) return 5;
  return 2;
}

function nextQueueDelay(current, now = Date.now()) {
  pruneRequestWindow(now);
  let readyAt = Math.max(apiNextAt, activeBlockedUntil(current));
  if (apiRequestStarts.length >= current.requestsPerMinute) {
    readyAt = Math.max(readyAt, apiRequestStarts[0] + 60000 + 75);
  }
  return Math.max(0, readyAt - now);
}

function armApiTimer(delay) {
  if (apiTimer) clearTimeout(apiTimer);
  apiTimer = setTimeout(() => {
    apiTimer = null;
    pumpApiQueue();
  }, Math.max(1, delay));
  apiTimer.unref?.();
}

function pumpApiQueue() {
  const current = config();
  if (apiTimer || !apiQueue.length || apiActive >= current.requestConcurrency) return;
  const delay = nextQueueDelay(current);
  if (delay > 0) {
    armApiTimer(delay);
    return;
  }
  apiQueue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
  const job = apiQueue.shift();
  const now = Date.now();
  apiActive += 1;
  apiRequestStarts.push(now);
  apiNextAt = now + current.requestMinIntervalMs;
  Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
    apiActive -= 1;
    pumpApiQueue();
  });
  pumpApiQueue();
}

function scheduleApiRequest(task, meta = {}) {
  return new Promise((resolve, reject) => {
    apiQueue.push({
      task,
      resolve,
      reject,
      priority: Number.isFinite(Number(meta.priority)) ? Number(meta.priority) : 2,
      sequence: apiQueueSequence += 1,
      path: meta.path || null
    });
    pumpApiQueue();
  });
}

async function waitForRetrySlot(current) {
  while (true) {
    const delay = nextQueueDelay(current);
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    const now = Date.now();
    apiRequestStarts.push(now);
    apiNextAt = now + current.requestMinIntervalMs;
    return;
  }
}

function parseRetryAfter(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const when = Date.parse(value);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : 0;
}

function rateLimitMessage(errors = [], status = 0) {
  const message = errors.join('; ');
  return status === 429 || /too many requests|rate[ -]?limit|requests per minute|minute limit/i.test(message);
}

function isRateLimitError(error) {
  return Boolean(error?.rateLimited || error?.status === 429 || rateLimitMessage([String(error?.message || '')], Number(error?.status || 0)));
}

function responseRateResetMs(response) {
  const candidates = [
    response?.headers?.get?.('retry-after'),
    response?.headers?.get?.('x-ratelimit-reset'),
    response?.headers?.get?.('ratelimit-reset'),
    response?.headers?.get?.('x-ratelimit-requests-reset')
  ].filter(Boolean);
  for (const value of candidates) {
    const parsed = parseRetryAfter(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function registerRateLimit(current, { path, message, retryAfterMs = 0 } = {}) {
  const wait = Math.max(Number(retryAfterMs || 0), current.rateLimitCooldownMs);
  apiBlockedIdentity = apiIdentity(current);
  apiBlockedUntil = Math.max(activeBlockedUntil(current), Date.now() + wait);
  apiRateLimitCount += 1;
  apiLastRateLimit = {
    at: new Date().toISOString(),
    path: path || null,
    message: message || 'API-Football minute limit reached',
    retryAt: new Date(apiBlockedUntil).toISOString()
  };
  if (apiTimer) {
    clearTimeout(apiTimer);
    apiTimer = null;
  }
  armApiTimer(Math.max(1, apiBlockedUntil - Date.now()));
  return wait;
}

export function apiFootballRateState(env = process.env) {
  const current = config(env);
  const now = Date.now();
  pruneRequestWindow(now);
  const blockedUntil = activeBlockedUntil(current);
  return {
    requestsPerMinute: current.requestsPerMinute,
    requestsInWindow: apiRequestStarts.length,
    queueDepth: apiQueue.length,
    active: apiActive,
    coolingDown: blockedUntil > now,
    blockedUntil: blockedUntil > now ? new Date(blockedUntil).toISOString() : null,
    retryInMs: Math.max(0, blockedUntil - now),
    rateLimitCount: apiRateLimitCount,
    lastRateLimit: apiLastRateLimit
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
    source: 'API_FOOTBALL',
    role: 'SOLE_FOOTBALL_DATA_PROVIDER',
    fixtureScope: 'ALL_DAILY_FIXTURES_RETURNED_BY_PROVIDER',
    applicationFixtureCap: null,
    historyLast: value.historyLast,
    engineHistoryStrategy: value.engineLeagueHistory ? 'LEAGUE_POOL_THEN_TEAM_FALLBACK' : 'TEAM_HISTORY',
    requestsPerMinute: value.requestsPerMinute,
    adaptiveQueue: true,
    bookmakerId: value.bookmakerId || null,
    bookmakerName: value.bookmakerName || null,
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

function requestHeaders(current) {
  const headers = {
    [current.headerName]: current.key,
    accept: 'application/json',
    'user-agent': 'Betynz-API-Football-Core/5.0.20'
  };
  if (current.rapidApiHost) headers['x-rapidapi-host'] = current.rapidApiHost;
  return headers;
}

export async function apiFootballRequest(path, params = {}, ttlSeconds = null) {
  const current = config();
  if (!current.configured) return { configured: false, response: [], errors: ['API_FOOTBALL_KEY is not configured'] };
  const deferOnRateLimit = Boolean(params.__deferOnRateLimit);
  const url = new URL(path.replace(/^\//, ''), current.baseUrl.endsWith('/') ? current.baseUrl : `${current.baseUrl}/`);
  for (const [name, value] of Object.entries(params)) {
    if (name.startsWith('__')) continue;
    if (value !== undefined && value !== null && text(value) !== '') url.searchParams.set(name, String(value));
  }
  const cacheKey = `api-football:${url.toString()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  if (apiInFlight.has(cacheKey)) return apiInFlight.get(cacheKey);

  const task = scheduleApiRequest(async () => {
    const secondCached = cacheGet(cacheKey);
    if (secondCached) return secondCached;
    let lastError = null;
    let transportAttempt = 0;
    let rateLimitAttempt = 0;
    let firstAttempt = true;

    while (true) {
      if (!firstAttempt) await waitForRetrySlot(current);
      firstAttempt = false;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), current.timeoutMs);
      try {
        const response = await fetch(url, { headers: requestHeaders(current), signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        const errors = apiErrors(body);
        if (!response.ok || errors.length) {
          const message = errors.join('; ') || `API-Football returned HTTP ${response.status}`;
          const error = new Error(message);
          const limited = rateLimitMessage(errors, response.status);
          error.status = limited ? 429 : response.status;
          error.rateLimited = limited;
          error.retryAfterMs = Math.max(
            parseRetryAfter(response.headers.get('retry-after')),
            responseRateResetMs(response)
          );
          if (limited) registerRateLimit(current, { path: url.pathname, message, retryAfterMs: error.retryAfterMs });
          throw error;
        }

        const remaining = Number(response.headers.get('x-ratelimit-requests-remaining') || response.headers.get('ratelimit-remaining'));
        if (Number.isFinite(remaining) && remaining <= 0) {
          const wait = responseRateResetMs(response) || current.rateLimitCooldownMs;
          apiBlockedIdentity = apiIdentity(current);
          apiBlockedUntil = Math.max(activeBlockedUntil(current), Date.now() + wait);
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
        return normalized;
      } catch (error) {
        lastError = error;
        if (error?.rateLimited || error?.status === 429) {
          if (deferOnRateLimit) break;
          if (rateLimitAttempt >= current.rateLimitRetries) break;
          rateLimitAttempt += 1;
          const wait = Math.max(
            Number(error?.retryAfterMs || 0),
            Math.max(0, activeBlockedUntil(current) - Date.now()),
            current.rateLimitCooldownMs
          ) + Math.floor(Math.random() * 401);
          await new Promise(resolve => setTimeout(resolve, wait));
          continue;
        }

        const retryable = !error?.status || error.status === 408 || error.status >= 500;
        if (!retryable || transportAttempt >= current.retries) break;
        const exponential = Math.min(current.retryMaxMs, current.retryBaseMs * (2 ** transportAttempt));
        transportAttempt += 1;
        await new Promise(resolve => setTimeout(resolve, exponential + Math.floor(Math.random() * 251)));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error('API-Football request failed');
  }, { path: url.pathname, priority: requestPriority(path, params) });

  apiInFlight.set(cacheKey, task);
  try { return await task; }
  finally { apiInFlight.delete(cacheKey); }
}

async function apiFootballPagedRequest(path, params = {}, ttlSeconds = null, maxPages = 0, options = {}) {
  const rows = [];
  let page = 1;
  let totalPages = 1;
  do {
    // The first odds page is user-visible. Later pages run behind venue-history
    // work so the engines can publish before the complete bookmaker catalogue.
    const body = await apiFootballRequest(path, {
      ...params,
      page,
      __priority: path === '/odds' ? (page === 1 ? 1 : 4) : params.__priority
    }, ttlSeconds);
    rows.push(...responseArray(body));
    totalPages = Math.max(1, number(body?.paging?.total, 1));
    try { options.onPage?.({ rows: [...rows], page, totalPages, body }); } catch {}
    page += 1;
  } while (page <= totalPages && (maxPages <= 0 || page <= maxPages));
  return { configured: true, response: rows, paging: { current: Math.max(1, page - 1), total: totalPages }, fetchedAt: new Date().toISOString() };
}

function kickoffMs(fixture) {
  const raw = fixture?.fixture?.date ?? fixture?.kickoff ?? fixture?.date;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : null;
}

function apiFixtureNames(item) {
  return { home: text(item?.teams?.home?.name), away: text(item?.teams?.away?.name) };
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
  const sourceId = String(source?.sourceId || source?.id || '');
  const candidateId = String(candidate?.fixture?.id || '');
  if (sourceId && candidateId && sourceId === candidateId) return 1;
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
  if (!league) return { id: null, logo: null, flag: null, season: null, round: null };
  return {
    id: league.id || null,
    name: league.name || null,
    country: league.country || null,
    logo: league.logo || null,
    flag: league.flag || null,
    season: league.season || null,
    round: league.round || null
  };
}

function validOdd(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 && parsed < 1000 ? parsed : null;
}

function norm(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
}

function setOdd(target, key, value) {
  const odd = validOdd(value);
  if (odd && !target[key]) target[key] = odd;
}

function lineFrom(value) {
  const found = text(value).replace(',', '.').match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/);
  return found ? found[1] : null;
}

function oddsKeyForTotal(prefix, side, line) {
  const map = { '0.5': '05', '1.5': '15', '2.5': '25', '3.5': '35' };
  const suffix = map[line];
  if (!suffix) return null;
  if (side === 'home') return `${prefix === 'over' ? 'homeOver' : 'homeUnder'}${suffix}`;
  if (side === 'away') return `${prefix === 'over' ? 'awayOver' : 'awayUnder'}${suffix}`;
  if (side === 'firstHalf') return `${prefix === 'over' ? 'firstHalfOver' : 'firstHalfUnder'}${suffix}`;
  return `${prefix}${suffix}`;
}

function normalizeOddsBookmaker(bookmaker, fixture = null) {
  const odds = {};
  const marketRows = [];
  const homeName = norm(fixture?.teams?.home?.name);
  const awayName = norm(fixture?.teams?.away?.name);
  for (const bet of bookmaker?.bets || []) {
    const market = norm(bet?.name);
    for (const selection of bet?.values || []) {
      const choice = norm(selection?.value);
      const odd = validOdd(selection?.odd);
      if (!odd) continue;
      marketRows.push({ market: bet?.name || 'Market', selection: selection?.value || 'Selection', odds: odd, bookmaker: bookmaker?.name || null });

      if (/match winner|winner|1x2|three way|3 way/.test(market) && !/half|period|corner|card/.test(market)) {
        if (choice === 'home' || choice === '1' || (homeName && choice === homeName)) setOdd(odds, 'homeWin', odd);
        else if (choice === 'draw' || choice === 'x') setOdd(odds, 'draw', odd);
        else if (choice === 'away' || choice === '2' || (awayName && choice === awayName)) setOdd(odds, 'awayWin', odd);
        continue;
      }

      if (/double chance/.test(market)) {
        const compact = choice.replace(/\s+/g, '');
        if (['home/draw', 'homeordraw', '1x'].includes(compact)) setOdd(odds, 'doubleChance1X', odd);
        else if (['draw/away', 'draworaway', 'x2'].includes(compact)) setOdd(odds, 'doubleChanceX2', odd);
        else if (['home/away', 'homeoraway', '12'].includes(compact)) setOdd(odds, 'doubleChance12', odd);
        continue;
      }

      if (/both teams.*score|btts/.test(market)) {
        if (/^yes$|both/.test(choice)) setOdd(odds, 'bttsYes', odd);
        else if (/^no$|not both/.test(choice)) setOdd(odds, 'bttsNo', odd);
        continue;
      }

      if (/half.?time.*full.?time|ht\/?ft|half time\/full time/.test(market)) {
        const compact = choice.replace(/\s+/g, '').replace(/-/g, '/').replace(/home/g, '1').replace(/draw/g, 'x').replace(/away/g, '2');
        const map = {
          '1/1':'htftHomeHome','x/1':'htftDrawHome','2/1':'htftAwayHome',
          '1/x':'htftHomeDraw','x/x':'htftDrawDraw','2/x':'htftAwayDraw',
          '1/2':'htftHomeAway','x/2':'htftDrawAway','2/2':'htftAwayAway'
        };
        const key = map[compact];
        if (key) setOdd(odds, key, odd);
        continue;
      }

      const isFirstHalf = /first half|1st half|half time/.test(market);
      const isHomeTotal = /home.*total|total.*home|home team goals/.test(market);
      const isAwayTotal = /away.*total|total.*away|away team goals/.test(market);
      const isGoalsTotal = /goals.*over.*under|over.*under|total goals|goals total/.test(market);
      if (isGoalsTotal || isFirstHalf || isHomeTotal || isAwayTotal) {
        const direction = /^over\b/.test(choice) ? 'over' : /^under\b/.test(choice) ? 'under' : null;
        const line = lineFrom(choice) || lineFrom(bet?.name);
        if (direction && line) {
          const side = isHomeTotal ? 'home' : isAwayTotal ? 'away' : isFirstHalf ? 'firstHalf' : 'match';
          const key = oddsKeyForTotal(direction, side, line);
          if (key) setOdd(odds, key, odd);
        }
      }
    }
  }
  return { odds, marketRows, count: Object.values(odds).filter(Boolean).length };
}

function selectBookmaker(row, fixture = null) {
  const current = config();
  const bookmakers = Array.isArray(row?.bookmakers) ? row.bookmakers : [];
  const preferred = bookmakers.find(item => current.bookmakerId && String(item?.id) === current.bookmakerId)
    || bookmakers.find(item => current.bookmakerName && norm(item?.name) === norm(current.bookmakerName));
  if (preferred) return { bookmaker: preferred, normalized: normalizeOddsBookmaker(preferred, fixture) };
  let best = null;
  for (const bookmaker of bookmakers) {
    const normalized = normalizeOddsBookmaker(bookmaker, fixture);
    if (!best || normalized.count > best.normalized.count) best = { bookmaker, normalized };
  }
  return best;
}

function normalizeScore(row) {
  const home = number(row?.goals?.home);
  const away = number(row?.goals?.away);
  if (home === null || away === null) return null;
  return {
    home,
    away,
    htHome: number(row?.score?.halftime?.home),
    htAway: number(row?.score?.halftime?.away),
    fulltimeHome: number(row?.score?.fulltime?.home),
    fulltimeAway: number(row?.score?.fulltime?.away),
    extraTimeHome: number(row?.score?.extratime?.home),
    extraTimeAway: number(row?.score?.extratime?.away),
    penaltyHome: number(row?.score?.penalty?.home),
    penaltyAway: number(row?.score?.penalty?.away)
  };
}

export function normalizeApiFootballFixture(row, oddsRow = null) {
  const fixtureId = row?.fixture?.id;
  if (!fixtureId || !row?.teams?.home?.name || !row?.teams?.away?.name) return null;
  const selected = oddsRow ? selectBookmaker(oddsRow, row) : null;
  const odds = selected?.normalized?.odds || {};
  return {
    id: String(fixtureId),
    sourceId: String(fixtureId),
    kickoff: row?.fixture?.date || null,
    status: text(row?.fixture?.status?.short || 'NS').toUpperCase(),
    minute: number(row?.fixture?.status?.elapsed),
    score: normalizeScore(row),
    events: [],
    league: {
      id: row?.league?.id || null,
      name: row?.league?.name || 'Unknown League',
      country: row?.league?.country || 'International',
      logo: row?.league?.logo || null,
      flag: row?.league?.flag || null,
      season: row?.league?.season || null,
      round: row?.league?.round || null
    },
    home: teamVisual(row?.teams?.home) || { id: null, name: row?.teams?.home?.name, logo: null },
    away: teamVisual(row?.teams?.away) || { id: null, name: row?.teams?.away?.name, logo: null },
    odds,
    oddsMeta: {
      source: 'API_FOOTBALL',
      bookmakerId: selected?.bookmaker?.id || null,
      bookmakerName: selected?.bookmaker?.name || null,
      updatedAt: oddsRow?.update || null
    },
    marketRows: selected?.normalized?.marketRows || [],
    availableMarketCount: Object.values(odds).filter(Boolean).length,
    rawSource: 'API_FOOTBALL',
    apiFootballFixtureId: fixtureId,
    venue: row?.fixture?.venue || null,
    referee: row?.fixture?.referee || null,
    timezone: row?.fixture?.timezone || null,
    enrichment: { matched: true, confidence: 1, statsAvailable: false, source: 'API_FOOTBALL' }
  };
}

function oddsByFixture(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const id = row?.fixture?.id;
    if (id != null && !map.has(String(id))) map.set(String(id), row);
  }
  return map;
}

export async function getApiFootballDailyFixtures(date) {
  if (!safeDate(date)) throw new Error('date must be YYYY-MM-DD');
  const current = config();
  const body = await apiFootballRequest('/fixtures', { date, timezone: current.timezone }, current.fixtureTtlSeconds);
  return { configured: body.configured, fixtures: responseArray(body), fetchedAt: body.fetchedAt || null };
}

export async function getApiFootballFixtureCount(date) {
  const daily = await getApiFootballDailyFixtures(date);
  return {
    configured: daily.configured,
    source: 'API_FOOTBALL',
    date,
    count: (daily.fixtures || []).length,
    fetchedAt: daily.fetchedAt || null
  };
}

export async function getApiFootballFixtureCounts(from, days = 7) {
  if (!safeDate(from)) throw new Error('from must be YYYY-MM-DD');
  const safeDays = Math.max(1, Math.min(14, Number(days) || 7));
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + safeDays - 1);
  const to = end.toISOString().slice(0, 10);
  const current = config();
  const body = await apiFootballRequest('/fixtures', {
    from,
    to,
    timezone: current.timezone,
    __priority: 5
  }, current.fixtureTtlSeconds);
  const counts = new Map();
  for (let offset = 0; offset < safeDays; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    counts.set(date.toISOString().slice(0, 10), 0);
  }
  for (const row of responseArray(body)) {
    const date = text(row?.fixture?.date).slice(0, 10);
    if (counts.has(date)) counts.set(date, counts.get(date) + 1);
  }
  return {
    configured: body.configured,
    source: 'API_FOOTBALL',
    from,
    to,
    days: safeDays,
    counts: [...counts.entries()].map(([date, count]) => ({ date, count })),
    total: [...counts.values()].reduce((sum, count) => sum + count, 0),
    fetchedAt: body.fetchedAt || null
  };
}

function oddsDateCacheKey(date, current = config()) {
  return `api-football-odds-date:${date}:${current.timezone}:${current.bookmakerId || 'ALL'}`;
}

export function getCachedApiFootballOddsForDate(date) {
  if (!safeDate(date)) return null;
  return cacheGet(oddsDateCacheKey(date));
}

export async function getApiFootballOddsForDate(date) {
  if (!safeDate(date)) throw new Error('date must be YYYY-MM-DD');
  const current = config();
  const aggregateKey = oddsDateCacheKey(date, current);
  const cached = cacheGet(aggregateKey);
  if (cached && !cached.pending) return { ...cached, cache: 'HIT' };
  if (oddsDateInflight.has(aggregateKey)) return oddsDateInflight.get(aggregateKey);

  const task = (async () => {
    const params = { date, timezone: current.timezone };
    if (current.bookmakerId) params.bookmaker = current.bookmakerId;
    const body = await apiFootballPagedRequest('/odds', params, current.oddsTtlSeconds, current.maxOddsPages, {
      onPage: ({ rows, page, totalPages }) => {
        cacheSet(aggregateKey, {
          configured: true,
          odds: rows,
          fetchedAt: new Date().toISOString(),
          pages: page,
          totalPages,
          pending: page < totalPages,
          cache: 'PARTIAL'
        }, current.oddsTtlSeconds);
      }
    });
    const result = { configured: body.configured, odds: responseArray(body), fetchedAt: body.fetchedAt || null, pages: body.paging?.total || 1, totalPages: body.paging?.total || 1, pending: false, cache: 'MISS' };
    cacheSet(aggregateKey, result, current.oddsTtlSeconds);
    return result;
  })();
  oddsDateInflight.set(aggregateKey, task);
  try { return await task; }
  finally { oddsDateInflight.delete(aggregateKey); }
}

function normalizeFixtureBoard(daily, oddsResult = null) {
  const oddsMap = oddsByFixture(oddsResult?.odds || []);
  return (daily.fixtures || []).map(row => normalizeApiFootballFixture(row, oddsMap.get(String(row?.fixture?.id)) || null)).filter(Boolean)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

export async function getApiFootballFastFixtureBoard(date) {
  const daily = await getApiFootballDailyFixtures(date);
  const cachedOdds = getCachedApiFootballOddsForDate(date);
  if (!cachedOdds || cachedOdds.pending) {
    // The dashboard must never wait for every bookmaker-odds page. Start the
    // expensive pagination in the background and return the complete fixture
    // list immediately. A short browser poll upgrades the rows with odds.
    getApiFootballOddsForDate(date).catch(() => null);
  }
  return {
    configured: daily.configured,
    source: 'API_FOOTBALL',
    fixtures: normalizeFixtureBoard(daily, cachedOdds),
    warning: cachedOdds?.warning || null,
    oddsPending: !cachedOdds || Boolean(cachedOdds.pending),
    oddsPages: cachedOdds?.pages || 0,
    fetchedAt: daily.fetchedAt || null
  };
}

export async function getApiFootballFixtureBoard(date) {
  const [daily, oddsResult] = await Promise.all([
    getApiFootballDailyFixtures(date),
    getApiFootballOddsForDate(date).catch(error => ({ configured: apiFootballConfigured(), odds: [], warning: error.message }))
  ]);
  return {
    configured: daily.configured,
    source: 'API_FOOTBALL',
    fixtures: normalizeFixtureBoard(daily, oddsResult),
    warning: oddsResult.warning || null,
    oddsPending: false,
    oddsPages: oddsResult.pages || 0,
    fetchedAt: daily.fetchedAt || null
  };
}

export async function getApiFootballLiveBoard() {
  const current = config();
  const body = await apiFootballRequest('/fixtures', { live: 'all', timezone: current.timezone }, Math.max(10, number(process.env.LIVE_CACHE_TTL_SECONDS, 20)));
  const fixtures = responseArray(body).map(row => normalizeApiFootballFixture(row)).filter(item => item && LIVE.has(item.status));
  return { configured: body.configured, source: 'API_FOOTBALL', fixtures, fetchedAt: body.fetchedAt || null };
}

export async function getApiFootballResults(date) {
  const daily = await getApiFootballDailyFixtures(date);
  const fixtures = daily.fixtures.map(row => normalizeApiFootballFixture(row)).filter(item => item && FINISHED.has(item.status));
  return { configured: daily.configured, source: 'API_FOOTBALL', fixtures, fetchedAt: daily.fetchedAt || null };
}

export async function getApiFootballFixtureEvents(fixtureId) {
  const id = Number(fixtureId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const body = await apiFootballRequest('/fixtures/events', { fixture: id }, Math.max(20, number(process.env.LIVE_CACHE_TTL_SECONDS, 20)));
  return responseArray(body).map(row => ({
    time: row.time || null,
    minute: number(row?.time?.elapsed),
    extra: number(row?.time?.extra),
    team: row.team || null,
    player: row.player || null,
    assist: row.assist || null,
    type: row.type || null,
    detail: row.detail || null,
    comments: row.comments || null
  }));
}

export async function resolveApiFootballTeam(name, country = '') {
  const current = config();
  if (!current.configured || text(name).length < 2) return null;
  const cacheKey = `api-football-team:${normalizeName(name)}:${normalizeName(country)}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;
  const body = await apiFootballRequest('/teams', { search: name }, current.visualTtlSeconds);
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
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, run));
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
    return { fixtureId: source.id, apiFixtureId: null, mappingConfidence: 0, home: null, away: null, league: null };
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
    half_time_score: { home: number(row?.score?.halftime?.home), away: number(row?.score?.halftime?.away) },
    league: { id: row?.league?.id || null, name: row?.league?.name || '', country: row?.league?.country || '' }
  };
}

function selectVenueHistory(rows, teamId, venue, beforeMs, limit = 5) {
  return (rows || []).filter(isCompletedFixture).filter(row => {
    const kickoff = kickoffMs(row);
    if (beforeMs && kickoff && kickoff >= beforeMs) return false;
    return venue === 'home' ? Number(row?.teams?.home?.id) === Number(teamId) : Number(row?.teams?.away?.id) === Number(teamId);
  }).sort((a, b) => (kickoffMs(b) || 0) - (kickoffMs(a) || 0)).slice(0, limit).map(historyRow);
}

function engineIntelligenceFromHistories(fixture, homeHistory = [], awayHistory = [], strategy = 'TEAM_HISTORY') {
  const homeId = Number(fixture?.home?.id);
  const awayId = Number(fixture?.away?.id);
  return {
    source: 'API_FOOTBALL',
    mapped: true,
    mappingConfidence: 1,
    historyStrategy: strategy,
    fixture: {
      id: Number(fixture?.id) || null,
      date: fixture?.kickoff || null,
      venue: fixture?.venue || null,
      status: fixture?.status || null,
      league: fixture?.league || null,
      home: fixture?.home || null,
      away: fixture?.away || null,
      mappingConfidence: 1
    },
    home: { id: homeId, name: fixture?.home?.name || '', logo: fixture?.home?.logo || null, history: homeHistory },
    away: { id: awayId, name: fixture?.away?.name || '', logo: fixture?.away?.logo || null, history: awayHistory },
    league: fixture?.league || null,
    standings: null,
    teamStatistics: { home: null, away: null },
    h2h: [],
    predictions: null,
    injuries: []
  };
}

async function getApiFootballEngineIntelligence(date, fixture) {
  const current = config();
  if (!current.configured || !fixture) return null;
  const homeId = Number(fixture?.home?.id);
  const awayId = Number(fixture?.away?.id);
  const leagueId = Number(fixture?.league?.id);
  const season = Number(fixture?.league?.season);
  const beforeMs = kickoffMs(fixture) || Date.now();

  if (!Number.isFinite(homeId) || !Number.isFinite(awayId)) {
    return getApiFootballIntelligence({ date, beforeDate: date }, fixture, { mode: 'engine' });
  }

  let poolRows = [];
  let strategy = 'TEAM_HISTORY';
  if (current.engineLeagueHistory && Number.isFinite(leagueId) && Number.isFinite(season)) {
    try {
      const pool = await apiFootballRequest('/fixtures', {
        league: leagueId,
        season,
        status: 'FT',
        __priority: 2
      }, current.engineHistoryTtlSeconds);
      poolRows = responseArray(pool);
      if (poolRows.length) strategy = 'LEAGUE_POOL';
    } catch {}
  }

  let homeHistory = selectVenueHistory(poolRows, homeId, 'home', beforeMs, 5);
  let awayHistory = selectVenueHistory(poolRows, awayId, 'away', beforeMs, 5);
  const fallbacks = [];
  if (homeHistory.length < 5) {
    fallbacks.push(apiFootballRequest('/fixtures', {
      team: homeId,
      last: current.historyLast,
      status: 'FT',
      __priority: 3
    }, current.engineHistoryTtlSeconds).then(body => {
      homeHistory = selectVenueHistory(responseArray(body), homeId, 'home', beforeMs, 5);
    }).catch(() => null));
  }
  if (awayHistory.length < 5) {
    fallbacks.push(apiFootballRequest('/fixtures', {
      team: awayId,
      last: current.historyLast,
      status: 'FT',
      __priority: 3
    }, current.engineHistoryTtlSeconds).then(body => {
      awayHistory = selectVenueHistory(responseArray(body), awayId, 'away', beforeMs, 5);
    }).catch(() => null));
  }
  if (fallbacks.length) {
    await Promise.all(fallbacks);
    strategy = poolRows.length ? 'LEAGUE_POOL_WITH_TEAM_FALLBACK' : 'TEAM_HISTORY';
  }

  return engineIntelligenceFromHistories(fixture, homeHistory, awayHistory, strategy);
}

function teamStatsSummary(body) {
  const row = responseArray(body)[0] || body?.rawResponse || null;
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
  return responseArray(body).map(row => ({ player: row.player || null, team: row.team || null, fixture: row.fixture || null, league: row.league || null }));
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
    apiFootballRequest('/fixtures', { team: homeId, last: current.historyLast, status: 'FT' }, historyTtl),
    apiFootballRequest('/fixtures', { team: awayId, last: current.historyLast, status: 'FT' }, historyTtl)
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

  // Daily engine scans only need the exact five-match home/away venue histories.
  // Standings, H2H, injuries, predictions, lineups and player data remain on-demand
  // for the match intelligence panel. This keeps a full daily board from creating
  // hundreds of unnecessary API calls before an engine page can respond.
  if (mode === 'engine') {
    return {
      ...base,
      standings: null,
      teamStatistics: { home: null, away: null },
      h2h: [],
      predictions: null,
      injuries: []
    };
  }

  const coreRequests = [
    leagueId && season ? apiFootballRequest('/standings', { league: leagueId, season }, 1800) : Promise.resolve(null),
    leagueId && season && homeId ? apiFootballRequest('/teams/statistics', { league: leagueId, season, team: homeId }, 1800) : Promise.resolve(null),
    leagueId && season && awayId ? apiFootballRequest('/teams/statistics', { league: leagueId, season, team: awayId }, 1800) : Promise.resolve(null),
    homeId && awayId ? apiFootballRequest('/fixtures/headtohead', { h2h: `${homeId}-${awayId}`, last: 10 }, 3600) : Promise.resolve(null),
    fixtureId ? apiFootballRequest('/predictions', { fixture: fixtureId }, 1800) : Promise.resolve(null),
    fixtureId ? apiFootballRequest('/injuries', { fixture: fixtureId }, 900) : Promise.resolve(null)
  ];
  const [standings, homeStats, awayStats, h2h, predictions, injuries] = await Promise.all(coreRequests.map(promise => promise.catch(() => null)));

  const deep = {};
  if (mode !== 'engine' && current.deepStats && fixtureId) {
    const [fixtureStatistics, lineups, events, players] = await Promise.all([
      apiFootballRequest('/fixtures/statistics', { fixture: fixtureId }, 300).catch(() => null),
      apiFootballRequest('/fixtures/lineups', { fixture: fixtureId }, 300).catch(() => null),
      apiFootballRequest('/fixtures/events', { fixture: fixtureId }, 60).catch(() => null),
      apiFootballRequest('/fixtures/players', { fixture: fixtureId }, 300).catch(() => null)
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

export async function enrichApiFootballStatsBoard(date, fixtures = [], extractVenueStats, options = {}) {
  const current = config();
  if (!current.configured) return { configured: false, source: null, warning: 'API_FOOTBALL_KEY is not configured.', fixtures };

  const total = fixtures.length;
  const byId = new Map();
  const pending = [];
  let rateLimited = false;

  const emit = (fixture, intelligence, { deferred = false, error = null } = {}) => {
    const context = {
      date,
      beforeDate: date,
      sourceEventId: fixture?.sourceId || fixture?.id,
      kickoff: fixture?.kickoff,
      homeName: fixture?.home?.name,
      awayName: fixture?.away?.name,
      league: fixture?.league?.name,
      country: fixture?.league?.country
    };
    const stats = !deferred && intelligence && typeof extractVenueStats === 'function'
      ? extractVenueStats(intelligence, context)
      : null;
    const result = {
      ...fixture,
      stats: stats ? {
        ...stats,
        source: 'API_FOOTBALL',
        mappingConfidence: intelligence?.mappingConfidence || 1,
        standings: intelligence?.standings || null,
        teamStatistics: intelligence?.teamStatistics || null,
        h2h: intelligence?.h2h || [],
        predictions: intelligence?.predictions || null,
        injuries: intelligence?.injuries || []
      } : null,
      apiFootballFixtureId: Number(fixture?.id) || intelligence?.fixture?.id || null,
      enrichment: {
        matched: Boolean(intelligence?.mapped),
        confidence: intelligence?.mappingConfidence || (deferred ? 0 : 1),
        statsAvailable: Boolean(stats?.homeSplit || stats?.awaySplit),
        source: 'API_FOOTBALL',
        deferred,
        error: error ? String(error?.message || error) : null,
        historyStrategy: intelligence?.historyStrategy || null
      }
    };
    byId.set(String(fixture?.id), result);
    try { options.onFixture?.(result, byId.size, total); } catch {}
    return result;
  };

  // Stage one groups fixtures by league-season. One league history request can
  // complete several matches at once, so the first predictions are published
  // after one provider call instead of waiting for two team calls per fixture.
  const groups = new Map();
  for (const fixture of fixtures) {
    const leagueId = Number(fixture?.league?.id);
    const season = Number(fixture?.league?.season);
    const key = current.engineLeagueHistory && Number.isFinite(leagueId) && Number.isFinite(season)
      ? `${leagueId}:${season}`
      : `NO_POOL:${fixture?.id}`;
    if (!groups.has(key)) groups.set(key, { leagueId, season, fixtures: [] });
    groups.get(key).fixtures.push(fixture);
  }

  const groupList = [...groups.values()];
  const stageConcurrency = Math.max(1, Math.min(current.enrichConcurrency, current.requestConcurrency));
  await mapWithConcurrency(groupList, stageConcurrency, async group => {
    if (rateLimited) {
      for (const fixture of group.fixtures) emit(fixture, null, { deferred: true, error: 'Provider cooldown active' });
      return;
    }

    let poolRows = [];
    let poolError = null;
    if (current.engineLeagueHistory && Number.isFinite(group.leagueId) && Number.isFinite(group.season)) {
      try {
        const pool = await apiFootballRequest('/fixtures', {
          league: group.leagueId,
          season: group.season,
          status: 'FT',
          __priority: 2,
          __deferOnRateLimit: true
        }, current.engineHistoryTtlSeconds);
        poolRows = responseArray(pool);
      } catch (error) {
        poolError = error;
        if (isRateLimitError(error)) rateLimited = true;
      }
    }

    if (rateLimited && poolError) {
      for (const fixture of group.fixtures) emit(fixture, null, { deferred: true, error: poolError });
      return;
    }

    for (const fixture of group.fixtures) {
      const homeId = Number(fixture?.home?.id);
      const awayId = Number(fixture?.away?.id);
      if (!Number.isFinite(homeId) || !Number.isFinite(awayId)) {
        try {
          const intelligence = await getApiFootballIntelligence({
            date,
            beforeDate: date,
            sourceEventId: fixture?.sourceId || fixture?.id,
            kickoff: fixture?.kickoff,
            homeName: fixture?.home?.name,
            awayName: fixture?.away?.name,
            league: fixture?.league?.name,
            country: fixture?.league?.country
          }, fixture, { mode: 'engine' });
          emit(fixture, intelligence);
        } catch (error) {
          const deferred = isRateLimitError(error);
          if (deferred) rateLimited = true;
          emit(fixture, null, { deferred, error });
        }
        continue;
      }
      const beforeMs = kickoffMs(fixture) || Date.now();
      const homeHistory = Number.isFinite(homeId) ? selectVenueHistory(poolRows, homeId, 'home', beforeMs, 5) : [];
      const awayHistory = Number.isFinite(awayId) ? selectVenueHistory(poolRows, awayId, 'away', beforeMs, 5) : [];
      if (homeHistory.length >= 5 && awayHistory.length >= 5) {
        emit(fixture, engineIntelligenceFromHistories(fixture, homeHistory, awayHistory, 'LEAGUE_POOL'));
      } else {
        pending.push({ fixture, homeHistory, awayHistory, poolRows });
      }
    }
  });

  // Stage two is only for fixtures whose league pool lacks five venue matches.
  // Team histories are cached/deduplicated and run after all pool-complete picks
  // have already reached the UI and Consensus.
  if (!rateLimited && pending.length) {
    await mapWithConcurrency(pending, stageConcurrency, async item => {
      const fixture = item.fixture;
      if (rateLimited) {
        emit(fixture, null, { deferred: true, error: 'Provider cooldown active' });
        return;
      }
      const homeId = Number(fixture?.home?.id);
      const awayId = Number(fixture?.away?.id);
      const beforeMs = kickoffMs(fixture) || Date.now();
      let homeHistory = item.homeHistory;
      let awayHistory = item.awayHistory;
      try {
        if (homeHistory.length < 5 && Number.isFinite(homeId)) {
          const body = await apiFootballRequest('/fixtures', {
            team: homeId,
            last: current.historyLast,
            status: 'FT',
            __priority: 3,
            __deferOnRateLimit: true
          }, current.engineHistoryTtlSeconds);
          homeHistory = selectVenueHistory(responseArray(body), homeId, 'home', beforeMs, 5);
        }
        if (awayHistory.length < 5 && Number.isFinite(awayId)) {
          const body = await apiFootballRequest('/fixtures', {
            team: awayId,
            last: current.historyLast,
            status: 'FT',
            __priority: 3,
            __deferOnRateLimit: true
          }, current.engineHistoryTtlSeconds);
          awayHistory = selectVenueHistory(responseArray(body), awayId, 'away', beforeMs, 5);
        }
        const strategy = item.poolRows.length ? 'LEAGUE_POOL_WITH_TEAM_FALLBACK' : 'TEAM_HISTORY';
        emit(fixture, engineIntelligenceFromHistories(fixture, homeHistory, awayHistory, strategy));
      } catch (error) {
        const deferred = isRateLimitError(error);
        if (deferred) rateLimited = true;
        emit(fixture, null, { deferred, error });
      }
    });
  }

  // Any fixture not reached because a cooldown began is returned explicitly as
  // deferred. This keeps progress honest and lets the shared retry job resume it.
  for (const fixture of fixtures) {
    if (!byId.has(String(fixture?.id))) emit(fixture, null, { deferred: rateLimited, error: rateLimited ? 'Provider cooldown active' : 'History unavailable' });
  }

  const enriched = fixtures.map(fixture => byId.get(String(fixture?.id)) || fixture);
  const providerQueue = apiFootballRateState();
  const deferredCount = enriched.filter(item => item?.enrichment?.deferred).length;
  const statsAvailable = enriched.some(item => item?.stats?.homeSplit || item?.stats?.awaySplit);
  return {
    configured: true,
    source: 'API_FOOTBALL',
    warning: deferredCount
      ? 'API-Football reached the subscription minute limit. Unfinished fixtures remain queued and will resume automatically.'
      : statsAvailable ? null : 'API-Football fixtures loaded, but venue histories were unavailable for this date.',
    rateLimited: deferredCount > 0,
    deferredCount,
    providerQueue,
    fixtures: enriched,
    fixtureScope: 'ALL_DAILY_FIXTURES_RETURNED_BY_PROVIDER',
    analysisPriority: 'PRICED_UPCOMING_FIXTURES_FIRST',
    historyStrategy: 'LEAGUE_BATCH_THEN_TEAM_FALLBACK'
  };
}

export async function diagnoseApiFootball(date) {
  const current = config();
  if (!current.configured) return { configured: false, status: 'NOT_CONFIGURED' };
  try {
    const board = await getApiFootballFixtureBoard(date);
    return {
      configured: true,
      status: 'READY',
      date,
      fixtures: board.fixtures.length,
      fixturesWithOdds: board.fixtures.filter(item => item.availableMarketCount > 0).length,
      oddsPages: board.oddsPages || 0,
      source: 'API_FOOTBALL'
    };
  } catch (error) {
    return { configured: true, status: 'REQUEST_FAILED', message: error.message || 'Request failed', source: 'API_FOOTBALL' };
  }
}
