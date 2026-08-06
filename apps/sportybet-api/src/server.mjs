import http from 'node:http';
import { env, integer, json, publicError, stripProviderId, text, validDay } from './core.mjs';
import { competitionStats, fixtureDetail, getSourceStatus, live, results, streaksFromHistory, teamHistory, upcoming } from './sportybet.mjs';
import { publicFixture } from './parser.mjs';

const port = Math.max(1, integer(env('PORT', '10000'), 10000));
const apiKey = env('SPORTYBET_API_KEY');
const apiHeader = env('SPORTYBET_API_KEY_HEADER', 'X-API-Key').toLowerCase();
const rate = new Map();

function clientIp(req) { return text(req.headers['x-forwarded-for']).split(',')[0] || req.socket.remoteAddress || 'unknown'; }
function rateAllowed(req) {
  const now = Date.now();
  const key = clientIp(req);
  const limit = Math.max(30, integer(env('API_RATE_LIMIT_PER_MINUTE', '180'), 180));
  let row = rate.get(key);
  if (!row || row.reset <= now) row = { count: 0, reset: now + 60000 };
  row.count += 1; rate.set(key, row);
  return row.count <= limit;
}
function authorized(req) {
  if (!apiKey) return false;
  const bearer = text(req.headers.authorization).replace(/^Bearer\s+/i, '');
  return text(req.headers[apiHeader]) === apiKey || bearer === apiKey;
}
function corsHeaders(req) {
  const allowed = env('CORS_ALLOWED_ORIGINS', 'https://betynz.com,https://www.betynz.com').split(',').map(text).filter(Boolean);
  const origin = text(req.headers.origin);
  return origin && allowed.includes(origin)
    ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-headers': `${apiHeader},Authorization,Content-Type`, 'access-control-allow-methods': 'GET,OPTIONS' }
    : {};
}
function send(req, res, status, payload) { json(res, status, payload, { ...corsHeaders(req), 'cross-origin-resource-policy': 'cross-origin' }); }
function cleanPath(path) { return path.replace(/^\/api(?=\/|$)/, '') || '/'; }
function dayFrom(url, fallbackOffset = 0) {
  const value = url.searchParams.get('date');
  if (validDay(value)) return value;
  return new Date(Date.now() + fallbackOffset * 86400000).toISOString().slice(0,10);
}
function teamNameFrom(url) {
  const role = text(url.searchParams.get('team')).toLowerCase();
  if (role === 'away') return text(url.searchParams.get('away'));
  if (role === 'home') return text(url.searchParams.get('home'));
  return text(url.searchParams.get('team_name') || url.searchParams.get('name') || url.searchParams.get('team'));
}

async function route(req, url) {
  const path = cleanPath(url.pathname);
  if (req.method === 'OPTIONS') return { status: 204, payload: null };
  if (req.method !== 'GET') return { status: 405, payload: { error: 'Method not allowed' } };

  if (path === '/health') {
    return { status: 200, payload: {
      ok: true,
      service: 'Betynz SportyBet Core API',
      version: '1.0.1',
      source: 'SPORTYBET_CUSTOM_API',
      apiKeyConfigured: Boolean(apiKey),
      capabilities: ['fixtures','all-markets','live-scores','results','event-details','team-history-from-results','streaks','competition-stats'],
      fixtureCoverage: { daily: 'ALL_RETURNED_FIXTURES', applicationCap: null, pagination: 'UNTIL_EXHAUSTED' },
      providers: { sportybet: true, parseBot: false, apiFootball: false, oddsApi: false, betExplorer: false },
      time: new Date().toISOString()
    } };
  }

  if (!authorized(req)) return { status: 401, payload: { error: 'Valid private API key required' } };
  if (path === '/source-status' || path === '/diagnostics') return { status: 200, payload: getSourceStatus() };

  if (path === '/fixtures' || path === '/get_upcoming_events' || path === '/search_matches') {
    const date = url.searchParams.get('date');
    const from = url.searchParams.get('from');
    const days = url.searchParams.get('days') || (path === '/search_matches' ? 1 : 3);
    const feed = await upcoming({ date, from, days, force: url.searchParams.get('force') === 'true' });
    const fixtures = feed.events.map(row => publicFixture(row, { includeMarkets: true }));
    return { status: 200, payload: {
      version: 1,
      source: 'SPORTYBET_CUSTOM_API',
      date: validDay(date) ? date : null,
      from: feed.from,
      days: feed.days,
      count: fixtures.length,
      generated_at: feed.generatedAt,
      events: fixtures,
      fixtures,
      matches: fixtures
    } };
  }

  const fixtureMatch = path.match(/^\/fixtures\/([^/]+)(?:\/(markets))?$/);
  if (fixtureMatch) {
    const detail = await fixtureDetail(decodeURIComponent(fixtureMatch[1]), { date: dayFrom(url) });
    if (!detail) return { status: 404, payload: { error: 'SportyBet fixture not found' } };
    const fixture = publicFixture(detail, { includeMarkets: true, includeEvents: true });
    return { status: 200, payload: fixtureMatch[2] ? { eventId: fixture.id, markets: fixture.markets, odds: fixture.odds, source: 'SPORTYBET_CUSTOM_API' } : fixture };
  }

  if (path === '/get_fixture_stats') {
    const eventId = url.searchParams.get('event_id') || url.searchParams.get('fixture_id') || url.searchParams.get('id');
    if (!eventId) return { status: 400, payload: { error: 'event_id is required' } };
    const detail = await fixtureDetail(eventId, { date: dayFrom(url) });
    if (!detail) return { status: 404, payload: { error: 'SportyBet fixture not found' } };
    const fixture = publicFixture(detail, { includeMarkets: true, includeEvents: true });
    return { status: 200, payload: { fixture, markets: fixture.markets, odds: fixture.odds, score: fixture.score, events: fixture.events, source: 'SPORTYBET_CUSTOM_API' } };
  }

  if (path === '/live') {
    const feed = await live({ date: dayFrom(url), force: url.searchParams.get('force') === 'true' });
    const fixtures = feed.events.map(row => publicFixture(row, { includeMarkets: true, includeEvents: false }));
    return { status: 200, payload: { source: 'SPORTYBET_CUSTOM_API', count: fixtures.length, generatedAt: feed.generatedAt, fixtures, events: fixtures } };
  }
  const liveMatch = path.match(/^\/live\/([^/]+)$/);
  if (liveMatch) {
    const id = stripProviderId(decodeURIComponent(liveMatch[1]));
    const feed = await live({ date: dayFrom(url) });
    let detail = feed.events.find(row => stripProviderId(row.id) === id) || await fixtureDetail(id, { date: dayFrom(url) });
    if (!detail) return { status: 404, payload: { error: 'Live SportyBet fixture not found' } };
    return { status: 200, payload: publicFixture(detail, { includeMarkets: true, includeEvents: true }) };
  }

  if (path === '/results') {
    const feed = await results({ date: dayFrom(url, -1), force: url.searchParams.get('force') === 'true' });
    const fixtures = feed.events.map(row => publicFixture(row, { includeMarkets: false, includeEvents: false }));
    return { status: 200, payload: { source: 'SPORTYBET_CUSTOM_API', date: feed.date, count: fixtures.length, generatedAt: feed.generatedAt, fixtures, results: fixtures } };
  }
  const resultMatch = path.match(/^\/results\/([^/]+)$/);
  if (resultMatch) {
    const id = stripProviderId(decodeURIComponent(resultMatch[1]));
    const feed = await results({ date: dayFrom(url, -1) });
    const detail = feed.events.find(row => stripProviderId(row.id) === id) || await fixtureDetail(id, { date: feed.date });
    if (!detail) return { status: 404, payload: { error: 'SportyBet result not found' } };
    return { status: 200, payload: publicFixture(detail, { includeMarkets: false, includeEvents: true }) };
  }

  if (path === '/get_team_history') {
    const history = await teamHistory({
      teamName: teamNameFrom(url),
      venue: text(url.searchParams.get('venue')).toLowerCase(),
      beforeDate: url.searchParams.get('before_date') || url.searchParams.get('date'),
      limit: url.searchParams.get('limit') || 10
    });
    return { status: 200, payload: history };
  }
  if (path === '/get_team_streaks') {
    const history = await teamHistory({
      teamName: teamNameFrom(url),
      venue: text(url.searchParams.get('venue')).toLowerCase(),
      beforeDate: url.searchParams.get('before_date') || url.searchParams.get('date'),
      limit: url.searchParams.get('limit') || 10
    });
    return { status: 200, payload: streaksFromHistory(history) };
  }
  if (path === '/get_competition_stats') {
    return { status: 200, payload: await competitionStats({
      league: url.searchParams.get('league'),
      country: url.searchParams.get('country'),
      beforeDate: url.searchParams.get('before_date') || url.searchParams.get('date'),
      days: url.searchParams.get('days') || 30
    }) };
  }
  if (path === '/get_standings') {
    return { status: 200, payload: { available: false, source: 'SPORTYBET_CUSTOM_API', reason: 'A SportyBet standings endpoint is not configured. No third-party fallback is used.' } };
  }
  if (path === '/events' || path === '/get_fixture_events') {
    const eventId = url.searchParams.get('event_id') || url.searchParams.get('fixture_id');
    if (!eventId) return { status: 400, payload: { error: 'event_id is required' } };
    const detail = await fixtureDetail(eventId, { date: dayFrom(url) });
    return { status: 200, payload: { eventId: stripProviderId(eventId), events: detail?.events || [], source: 'SPORTYBET_CUSTOM_API' } };
  }

  return { status: 404, payload: { error: 'API route not found' } };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (!rateAllowed(req)) { send(req, res, 429, { error: 'Too many requests' }); return; }
  try {
    const result = await route(req, url);
    if (result.status === 204) { res.writeHead(204, corsHeaders(req)); res.end(); return; }
    send(req, res, result.status, result.payload);
  } catch (error) {
    console.error('[sportybet-api]', publicError(error));
    send(req, res, error?.status && error.status < 500 ? error.status : 502, { error: 'SPORTYBET_UPSTREAM_UNAVAILABLE', message: publicError(error) });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Betynz SportyBet Core API v1.0.1 listening on ${port}`);
  if (!apiKey) console.warn('[security] SPORTYBET_API_KEY is not configured; all private data routes will reject requests.');
});
