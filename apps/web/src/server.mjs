import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './lib/env.mjs';
import { analyzeMarketRoute, marketRouteSummary } from './engines/marketRoute.mjs';
import { analyzePpgRoute, ppgRouteSummary } from './engines/ppgRoute.mjs';
import { analyzeConvergence, convergenceSummary } from './engines/convergence.mjs';
import { buildConsensusForFixture, buildConsensusWindow, consensusSummary } from './engines/consensus.mjs';
import { extractVenueStats, matchFixture } from './lib/venueStats.mjs';
import { cacheGet, cacheSet, cacheStats } from './lib/cache.mjs';
import { safeDate, normalizeName } from './lib/utils.mjs';
import {
  logEnginePredictions,
  freezePredictionSnapshots,
  logOddsSnapshots,
  getOddsSnapshots,
  getPredictionSnapshots,
  getMatchResults,
  upsertConsensusCandidates,
  freezeConsensusSnapshots,
  getConsensusSnapshots,
  getConsensusCandidates,
  supabaseConfigured
} from './lib/supabase.mjs';
import { clearSessionCookies, getAdminSession, sessionCookies, signInWithPassword } from './lib/adminAuth.mjs';
import { buildLearningRecommendations, buildPerformance, proofData, settleDate } from './lib/learning.mjs';
import { summarizeOddsSnapshots, closingLineValue } from './lib/oddsMovement.mjs';
import { buildLeagueIntelligence } from './lib/leagueIntelligence.mjs';
import { buildAgreementPerformance, buildCalibrationReport } from './lib/calibration.mjs';
import {
  apiFootballConfigured,
  apiFootballPublicConfig,
  enrichApiFootballStatsBoard,
  enrichApiFootballVisuals,
  getApiFootballFixtureBoard,
  getApiFootballLiveBoard,
  getApiFootballResults,
  getApiFootballFixtureEvents,
  getApiFootballIntelligence,
  resolveApiFootballTeam,
  diagnoseApiFootball
} from './lib/apiFootball.mjs';

await loadLocalEnv();

const APP_VERSION = '5.0.3';
const MARKET_ROUTE_CODE = 'MARKET_ROUTE';
const PPG_ROUTE_CODE = 'PPG_ROUTE';
const CONVERGENCE_ROUTE_CODE = 'CONVERGENCE_ROUTE';
const ENGINE_CODES = [MARKET_ROUTE_CODE, PPG_ROUTE_CODE, CONVERGENCE_ROUTE_CODE];
const CONSENSUS_SYSTEM_CODE = 'CONSENSUS_SYSTEM';
const root = fileURLToPath(new URL('../public', import.meta.url));
const port = Number(process.env.PORT || 10000);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};


const mediaCache = new Map();
const mediaInflight = new Map();
const mediaQueue = [];
let mediaActive = 0;

function mediaBaseUrl() {
  return String(process.env.API_FOOTBALL_MEDIA_BASE_URL || 'https://media.api-sports.io/football').replace(/\/+$/, '');
}

function mediaConcurrency() {
  return Math.max(1, Math.min(12, Number(process.env.API_FOOTBALL_MEDIA_CONCURRENCY || 6)));
}

function scheduleMedia(task) {
  return new Promise((resolve, reject) => {
    mediaQueue.push({ task, resolve, reject });
    drainMediaQueue();
  });
}

function drainMediaQueue() {
  while (mediaActive < mediaConcurrency() && mediaQueue.length) {
    const entry = mediaQueue.shift();
    mediaActive += 1;
    Promise.resolve().then(entry.task).then(entry.resolve, entry.reject).finally(() => {
      mediaActive -= 1;
      drainMediaQueue();
    });
  }
}

function apiFootballMediaUrl(kind, id) {
  const folder = kind === 'league' ? 'leagues' : 'teams';
  return `${mediaBaseUrl()}/${folder}/${encodeURIComponent(String(id))}.png`;
}

async function loadApiFootballMedia(kind, id) {
  const key = `${kind}:${id}`;
  const now = Date.now();
  const cached = mediaCache.get(key);
  if (cached && cached.expiresAt > now) return cached;
  if (mediaInflight.has(key)) return mediaInflight.get(key);

  const task = scheduleMedia(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(3000, Number(process.env.API_FOOTBALL_MEDIA_TIMEOUT_MS || 10000)));
    try {
      const keyHeader = String(process.env.API_FOOTBALL_KEY_HEADER || 'x-apisports-key');
      const keyValue = String(process.env.API_FOOTBALL_KEY || '');
      const headers = {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent': 'Betynz-Media-Proxy/5.0.3'
      };
      if (keyValue) headers[keyHeader] = keyValue;
      const response = await fetch(apiFootballMediaUrl(kind, id), { headers, signal: controller.signal, redirect: 'follow' });
      if (!response.ok) throw Object.assign(new Error(`Crest upstream returned ${response.status}`), { status: response.status });
      const contentType = String(response.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
      if (!contentType.startsWith('image/')) throw Object.assign(new Error('Crest upstream did not return an image'), { status: 502 });
      const body = Buffer.from(await response.arrayBuffer());
      const maxBytes = Math.max(100_000, Number(process.env.API_FOOTBALL_MEDIA_MAX_BYTES || 2_000_000));
      if (!body.length || body.length > maxBytes) throw Object.assign(new Error('Crest image size is invalid'), { status: 502 });
      const value = { body, contentType, expiresAt: now + Math.max(3600, Number(process.env.API_FOOTBALL_VISUAL_CACHE_TTL_SECONDS || 604800)) * 1000 };
      mediaCache.set(key, value);
      return value;
    } finally {
      clearTimeout(timeout);
    }
  }).finally(() => mediaInflight.delete(key));

  mediaInflight.set(key, task);
  return task;
}

async function serveApiFootballMedia(res, url) {
  const match = url.pathname.match(/^\/api\/media\/(team|league)\/(\d+)\.png$/);
  if (!match) return json(res, 404, { error: 'Media not found' });
  const [, kind, id] = match;
  try {
    const media = await loadApiFootballMedia(kind, id);
    res.writeHead(200, {
      ...securityHeaders(),
      'content-type': media.contentType,
      'content-length': media.body.length,
      'cache-control': 'public, max-age=604800, stale-while-revalidate=2592000',
      'cross-origin-resource-policy': 'same-origin'
    });
    res.end(media.body);
  } catch (error) {
    res.writeHead(error?.status === 404 ? 404 : 502, {
      ...securityHeaders(),
      'cache-control': 'public, max-age=300',
      'content-type': 'text/plain; charset=utf-8'
    });
    res.end('Crest unavailable');
  }
}

function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'"
  };
}

function json(res, status, body, extra = {}) {
  res.writeHead(status, {
    ...securityHeaders(),
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra
  });
  res.end(JSON.stringify(body));
}

function jsonCached(res, status, body, maxAge = 30, extra = {}) {
  return json(res, status, body, {
    'cache-control': `public, max-age=${Math.max(0, Number(maxAge) || 0)}, stale-while-revalidate=${Math.max(60, (Number(maxAge) || 0) * 10)}`,
    ...extra
  });
}

function utcDateOffset(offset = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Number(offset || 0));
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, offset) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function snapshotBucketIso(intervalSeconds = 300) {
  const interval = Math.max(60, Number(intervalSeconds) || 300) * 1000;
  return new Date(Math.floor(Date.now() / interval) * interval).toISOString();
}

function isSrlFixture(value = {}) {
  const label = [value?.league?.name, value?.league?.country, value?.home?.name, value?.away?.name]
    .map(item => String(item || '')).join(' ');
  return /(^|[^a-z0-9])srl([^a-z0-9]|$)|simulated\s+reality\s+league/i.test(label);
}

function publicFixture(fixture) {
  if (!fixture || isSrlFixture(fixture)) return null;
  const { oddsAudit, rawPayload, eventUrl, ...safe } = fixture;
  return safe;
}

function fixtureStatusForDate(fixture) {
  const raw = String(fixture?.status || '').toUpperCase();
  if (/LIVE|1H|2H|HT|INPLAY/.test(raw)) return 'LIVE';
  if (/FT|AET|PEN|FINISHED|ENDED|COMPLETED/.test(raw)) return 'SETTLED';
  if (/PST|POSTPONED/.test(raw)) return 'POSTPONED';
  if (/CANC|CANCELLED|ABD|ABANDONED/.test(raw)) return 'CANCELLED';
  return Object.values(fixture?.odds || {}).some(value => Number(value) > 1) ? 'ANALYSING' : 'AWAITING_ODDS';
}

function captureBoardOdds(fixtures = []) {
  const capturedAt = snapshotBucketIso(process.env.ODDS_SNAPSHOT_INTERVAL_SECONDS || 300);
  const rows = fixtures
    .filter(item => item?.id && Object.values(item?.odds || {}).some(value => Number(value) > 1))
    .map(item => ({ fixture_id: item.id, captured_at: capturedAt, bookmaker: 'API_FOOTBALL', markets: item.odds || {} }));
  if (!rows.length) return;
  const key = `board-odds:${capturedAt}`;
  if (cacheGet(key)) return;
  cacheSet(key, true, Math.max(60, Number(process.env.ODDS_SNAPSHOT_INTERVAL_SECONDS || 300)));
  logOddsSnapshots(rows).catch(error => console.error('Odds snapshot failed:', error.message));
}

const fixtureBoardInflight = new Map();

async function getFastFixtureBoard(date) {
  const key = `single-engine-fixtures:${date}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cache: 'HIT' };
  if (fixtureBoardInflight.has(key)) return fixtureBoardInflight.get(key);
  const task = (async () => {
    const started = Date.now();
    const feed = await getApiFootballFixtureBoard(date);
    const fixtures = (feed.fixtures || [])
      .filter(item => !isSrlFixture(item))
      .map(item => ({ ...publicFixture(item), boardStatus: fixtureStatusForDate(item) }))
      .filter(Boolean);
    captureBoardOdds(fixtures);
    const response = {
      date,
      fixtures,
      source: 'API_FOOTBALL',
      warning: feed.warning || null,
      generatedAt: new Date().toISOString(),
      loadMs: Date.now() - started,
      cache: 'MISS'
    };
    cacheSet(key, response, Number(process.env.FIXTURE_BOARD_CACHE_TTL_SECONDS || 120));
    return response;
  })();
  fixtureBoardInflight.set(key, task);
  try { return await task; }
  finally { fixtureBoardInflight.delete(key); }
}

function publicVenueForm(stats) {
  const shape = (split, venue) => {
    if (!split || typeof split !== 'object') return null;
    const played = Math.max(0, Math.min(5, Number(split.played) || 0));
    const wins = Math.max(0, Number(split.wins) || 0);
    const draws = Math.max(0, Number(split.draws) || 0);
    const losses = Math.max(0, Number(split.losses) || 0);
    const form = (Array.isArray(split.form) ? split.form : String(split.form || '').toUpperCase().match(/[WDL]/g) || [])
      .map(value => String(value).toUpperCase()).filter(value => ['W', 'D', 'L'].includes(value)).slice(0, 5);
    const points = Number.isFinite(Number(split.points)) ? Number(split.points) : wins * 3 + draws;
    const goalsForAvg = Number(split.goalsForAvg) || 0;
    const goalsAgainstAvg = Number(split.goalsAgainstAvg) || 0;
    return {
      venue,
      played,
      form,
      wins,
      draws,
      losses,
      points,
      maximumPoints: played * 3,
      ppg: Number.isFinite(Number(split.ppg)) ? Number(split.ppg) : Number((points / Math.max(1, played)).toFixed(2)),
      goalsForAvg,
      goalsAgainstAvg,
      goalsPerMatch: Number(split.goalsPerMatch) || Number((goalsForAvg + goalsAgainstAvg).toFixed(2)),
      scoredIn: Number(split.scoredIn) || 0,
      concededIn: Number(split.concededIn) || 0,
      cleanSheets: Number(split.cleanSheets) || 0,
      failedToScore: Number(split.failedToScore) || 0,
      over15: Number(split.over15) || 0,
      over25: Number(split.over25) || 0,
      under35: Number(split.under35) || 0,
      btts: Number(split.btts) || 0,
      goalThresholds: split.goalThresholds && typeof split.goalThresholds === 'object' ? split.goalThresholds : {},
      htft: split.htft && typeof split.htft === 'object' ? split.htft : {}
    };
  };
  return stats ? { home: shape(stats.homeSplit, 'HOME'), away: shape(stats.awaySplit, 'AWAY') } : null;
}


function engineName(engineCode) {
  if (engineCode === PPG_ROUTE_CODE) return 'PPG Route Engine';
  if (engineCode === CONVERGENCE_ROUTE_CODE) return 'Convergence Engine';
  if (engineCode === CONSENSUS_SYSTEM_CODE) return 'Consensus System';
  return 'Market Route Engine';
}

function engineSummary(engineCode, result) {
  if (engineCode === PPG_ROUTE_CODE) return ppgRouteSummary(result);
  if (engineCode === CONVERGENCE_ROUTE_CODE) return convergenceSummary(result);
  return marketRouteSummary(result);
}

function publicProofRow(row) {
  return {
    id: row.id,
    date: row.fixture_date,
    kickoff: row.kickoff,
    country: row.country,
    league: row.league_name,
    home: row.home_team,
    away: row.away_team,
    engine: row.engine,
    market: row.market,
    selection: row.selection_label,
    odds: row.odds,
    score: row.engine_score,
    grade: row.grade,
    decision: row.decision,
    status: row.settlement_status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    profit: row.profit_units,
    frozenAt: row.frozen_at,
    reasons: Array.isArray(row.reasons) ? row.reasons : []
  };
}


function publicConsensusProofRow(row) {
  return {
    id: row.id,
    date: row.fixture_date,
    kickoff: row.kickoff,
    country: row.country,
    league: row.league_name,
    home: row.home_team,
    away: row.away_team,
    engine: CONSENSUS_SYSTEM_CODE,
    engineName: 'Consensus System',
    classification: row.classification,
    agreementCount: row.agreement_count,
    agreementDirection: row.agreement_direction,
    market: row.market,
    selection: row.selection_label,
    odds: row.odds,
    score: row.consensus_score,
    grade: row.classification,
    decision: row.classification,
    status: row.settlement_status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    profit: row.profit_units,
    frozenAt: row.frozen_at,
    reasons: Array.isArray(row.reasons) ? row.reasons : [],
    enginePicks: Array.isArray(row.engine_picks) ? row.engine_picks : []
  };
}

function predictionRows(date, items = [], engineCode = MARKET_ROUTE_CODE) {
  const now = Date.now();
  return items.flatMap(item => {
    const fixture = item.fixture || {};
    const selection = item.engine?.selection;
    const kickoff = new Date(fixture.kickoff).getTime();
    if (!selection || !Number.isFinite(kickoff) || kickoff <= now) return [];
    return [{
      fixture_id: fixture.id,
      source_fixture_id: fixture.sourceId || fixture.id,
      fixture_date: date,
      kickoff: fixture.kickoff,
      country: fixture.league?.country,
      league_name: fixture.league?.name,
      home_team: fixture.home?.name,
      away_team: fixture.away?.name,
      engine: engineCode,
      market: selection.market,
      selection_label: selection.label,
      odds: selection.odds,
      engine_score: selection.score,
      grade: selection.grade,
      decision: selection.decision,
      settlement_status: 'PENDING',
      reasons: selection.reasons || [],
      odds_snapshot: fixture.odds || {},
      payload: { fixture: publicFixture(fixture), engine: engineSummary(engineCode, item.engine) },
      frozen_at: new Date().toISOString()
    }];
  });
}

async function storePredictions(date, items, engineCode = MARKET_ROUTE_CODE) {
  const rows = predictionRows(date, items, engineCode);
  if (!rows.length) return;
  const liveRows = rows.map(row => ({
    fixture_id: row.fixture_id,
    fixture_date: row.fixture_date,
    kickoff: row.kickoff,
    country: row.country,
    league_name: row.league_name,
    home_team: row.home_team,
    away_team: row.away_team,
    engine: row.engine,
    market: row.market,
    odds: row.odds,
    engine_score: row.engine_score,
    grade: row.grade,
    decision: row.decision,
    status: 'PENDING',
    payload: row.payload
  }));
  const [logged, frozen] = await Promise.allSettled([
    logEnginePredictions(liveRows),
    freezePredictionSnapshots(rows)
  ]);
  if (logged.status === 'rejected') console.error('Engine prediction log failed:', logged.reason?.message || logged.reason);
  if (frozen.status === 'rejected') console.error('Prediction freeze failed:', frozen.reason?.message || frozen.reason);
}

async function enrichPrimaryStatsAndVisuals(date, fixtures = [], options = {}) {
  return enrichApiFootballStatsBoard(date, fixtures, extractVenueStats, options);
}

const marketBoardInflight = new Map();

async function getMarketRouteBoard(date) {
  const key = `market-route-board:${date}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cache: 'HIT' };
  if (marketBoardInflight.has(key)) return marketBoardInflight.get(key);
  const task = (async () => {
    const board = await getFastFixtureBoard(date);
    // Market Route is an odds-structure engine. It must return as soon as the
    // daily fixtures and bookmaker markets are ready; venue enrichment is not
    // allowed to hold this page open. Statistical contradiction checks are
    // added later from the shared stats job and in match intelligence.
    const items = (board.fixtures || []).map(fixture => ({
      fixture: publicFixture(fixture),
      engine: analyzeMarketRoute(fixture, null),
      venueForm: null
    })).filter(item => item.fixture);
    storePredictions(date, items, MARKET_ROUTE_CODE).catch(error => console.error('Market prediction storage failed:', error.message));
    const response = {
      date,
      engine: 'Market Route Engine',
      source: 'API_FOOTBALL',
      statisticsSource: 'PENDING_SHARED_ENRICHMENT',
      enrichmentSource: null,
      warning: board.warning || null,
      qualified: items.filter(item => item.engine.selection),
      all: items,
      summary: {
        fixtures: items.length,
        fire: items.filter(item => item.engine.decision === 'FIRE').length,
        safer: items.filter(item => item.engine.decision === 'SAFER').length,
        conflict: items.filter(item => item.engine.decision === 'CONFLICT').length,
        noSignal: items.filter(item => !item.engine.selection).length
      },
      progress: { stage: 'ODDS_READY_STATS_RUNNING', processed: 0, total: items.length, percent: 0 },
      complete: false,
      failed: false,
      generatedAt: new Date().toISOString(),
      cache: 'MISS'
    };
    cacheSet(key, response, 120);
    // Start the shared venue-history job without holding this HTTP response open.
    queueMicrotask(() => ensureStatsRouteView(date).catch(error => console.error('Shared engine analysis failed:', error.message)));
    return response;
  })();
  marketBoardInflight.set(key, task);
  try { return await task; }
  finally { marketBoardInflight.delete(key); }
}

const statsBoardInflight = new Map();

async function getStatsRouteBoards(date) {
  const key = `stats-route-boards:${date}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  if (statsBoardInflight.has(key)) return statsBoardInflight.get(key);
  const task = (async () => {
    const board = await getFastFixtureBoard(date);
    let processed = 0;
    const total = (board.fixtures || []).length;
    const enrichment = await enrichPrimaryStatsAndVisuals(date, board.fixtures, {
      onFixture: () => {
        processed += 1;
        const snapshot = statsRouteViewSnapshots.get(date);
        if (!snapshot) return;
        const progress = { stage: 'VENUE_HISTORY', processed, total, percent: total ? Math.round(processed / total * 100) : 100 };
        statsRouteViewSnapshots.set(date, {
          ppg: { ...snapshot.ppg, progress, complete: false },
          convergence: { ...snapshot.convergence, progress, complete: false }
        });
        const marketSnapshot = cacheGet(`market-route-board:${date}`);
        if (marketSnapshot && !marketSnapshot.complete) cacheSet(`market-route-board:${date}`, { ...marketSnapshot, progress, complete: false }, 120);
      }
    });
    const enrichedFixtures = enrichment.fixtures || [];
    const marketItems = [];
    const ppgItems = [];
    const convergenceItems = [];
    for (const fixture of enrichedFixtures) {
      
      const stats = fixture?.stats?.homeSplit || fixture?.stats?.awaySplit
        ? { homeSplit: fixture.stats?.homeSplit || null, awaySplit: fixture.stats?.awaySplit || null, source: fixture.stats?.source || 'API_FOOTBALL' }
        : null;
      const safeFixture = publicFixture(fixture);
      if (!safeFixture) continue;
      marketItems.push({ fixture: safeFixture, engine: analyzeMarketRoute(fixture, stats), venueForm: publicVenueForm(stats) });
      ppgItems.push({ fixture: safeFixture, engine: analyzePpgRoute(fixture, stats), venueForm: publicVenueForm(stats) });
      convergenceItems.push({ fixture: safeFixture, engine: analyzeConvergence(fixture, stats), venueForm: publicVenueForm(stats) });
    }
    await Promise.all([
      storePredictions(date, marketItems, MARKET_ROUTE_CODE),
      storePredictions(date, ppgItems, PPG_ROUTE_CODE),
      storePredictions(date, convergenceItems, CONVERGENCE_ROUTE_CODE)
    ]);
    const makeResponse = (engine, items) => ({
      date,
      engine,
      source: 'API_FOOTBALL',
      enrichmentSource: enrichment.enrichmentSource || null,
      warning: enrichment.warning || board.warning || null,
      qualified: items.filter(item => item.engine.selection),
      all: items,
      summary: {
        fixtures: items.length,
        analysed: items.filter(item => item.engine.decision !== 'WAITING').length,
        fire: items.filter(item => item.engine.decision === 'FIRE').length,
        safer: items.filter(item => item.engine.decision === 'SAFER').length,
        waiting: items.filter(item => item.engine.decision === 'WAITING').length,
        conflict: items.filter(item => item.engine.decision === 'CONFLICT').length,
        noSignal: items.filter(item => item.engine.decision === 'NO_SIGNAL').length
      },
      generatedAt: new Date().toISOString(),
      cache: 'MISS'
    });
    const marketResponse = {
      date,
      engine: 'Market Route Engine',
      source: 'API_FOOTBALL',
      statisticsSource: 'API_FOOTBALL',
      enrichmentSource: enrichment.enrichmentSource || 'API_FOOTBALL_VENUE_HISTORY',
      warning: enrichment.warning || board.warning || null,
      qualified: marketItems.filter(item => item.engine.selection),
      all: marketItems,
      summary: {
        fixtures: marketItems.length,
        fire: marketItems.filter(item => item.engine.decision === 'FIRE').length,
        safer: marketItems.filter(item => item.engine.decision === 'SAFER').length,
        conflict: marketItems.filter(item => ['CONFLICT','STAT_CONFLICT'].includes(item.engine.decision)).length,
        noSignal: marketItems.filter(item => !item.engine.selection).length
      },
      progress: { stage: 'COMPLETE', processed: marketItems.length, total: marketItems.length, percent: 100 },
      complete: true,
      failed: false,
      generatedAt: new Date().toISOString(),
      cache: 'MISS'
    };
    const result = {
      market: marketResponse,
      ppg: makeResponse('PPG Route Engine', ppgItems),
      convergence: makeResponse('Convergence Engine', convergenceItems)
    };
    result.ppg = { ...result.ppg, complete: true, failed: false, progress: { stage: 'COMPLETE', processed: ppgItems.length, total: ppgItems.length, percent: 100 } };
    result.convergence = { ...result.convergence, complete: true, failed: false, progress: { stage: 'COMPLETE', processed: convergenceItems.length, total: convergenceItems.length, percent: 100 } };
    cacheSet(`market-route-board:${date}`, marketResponse, 120);
    cacheSet(key, result, Number(process.env.STATS_ROUTE_CACHE_TTL_SECONDS || process.env.PPG_ROUTE_CACHE_TTL_SECONDS || 1800));
    return result;
  })();
  statsBoardInflight.set(key, task);
  try { return await task; }
  finally { statsBoardInflight.delete(key); }
}

async function getPpgRouteBoard(date) {
  const bundle = await getStatsRouteBoards(date);
  return bundle.ppg;
}

async function getConvergenceRouteBoard(date) {
  const bundle = await getStatsRouteBoards(date);
  return bundle.convergence;
}

const statsRouteViewSnapshots = new Map();
const statsRouteViewJobs = new Map();

function waitingStatsResponse(date, engine, fixtures = [], analyser) {
  const items = (fixtures || []).map(fixture => ({
    fixture: publicFixture(fixture),
    engine: analyser(fixture, null),
    venueForm: null
  })).filter(item => item.fixture);
  return {
    date,
    engine,
    source: 'API_FOOTBALL',
    enrichmentSource: 'API_FOOTBALL_VENUE_HISTORY',
    warning: null,
    qualified: items.filter(item => item.engine.selection),
    all: items,
    summary: {
      fixtures: items.length,
      analysed: items.filter(item => item.engine.decision !== 'WAITING').length,
      fire: items.filter(item => item.engine.decision === 'FIRE').length,
      safer: items.filter(item => item.engine.decision === 'SAFER').length,
      waiting: items.filter(item => item.engine.decision === 'WAITING').length,
      conflict: items.filter(item => item.engine.decision === 'CONFLICT').length,
      noSignal: items.filter(item => item.engine.decision === 'NO_SIGNAL').length
    },
    progress: { stage: 'VENUE_HISTORY', processed: 0, total: items.length, percent: 0 },
    complete: false,
    failed: false,
    generatedAt: new Date().toISOString(),
    cache: 'MISS'
  };
}

async function ensureStatsRouteView(date) {
  const existing = statsRouteViewSnapshots.get(date);
  if (existing?.ppg?.complete && existing?.convergence?.complete) return existing;
  if (!existing) {
    const board = await getFastFixtureBoard(date);
    statsRouteViewSnapshots.set(date, {
      ppg: waitingStatsResponse(date, 'PPG Route Engine', board.fixtures || [], analyzePpgRoute),
      convergence: waitingStatsResponse(date, 'Convergence Engine', board.fixtures || [], analyzeConvergence)
    });
  }
  if (!statsRouteViewJobs.has(date)) {
    const task = getStatsRouteBoards(date).then(bundle => {
      const complete = {
        ppg: { ...bundle.ppg, complete: true, failed: false, progress: { stage: 'COMPLETE', processed: bundle.ppg.summary?.fixtures || 0, total: bundle.ppg.summary?.fixtures || 0, percent: 100 } },
        convergence: { ...bundle.convergence, complete: true, failed: false, progress: { stage: 'COMPLETE', processed: bundle.convergence.summary?.fixtures || 0, total: bundle.convergence.summary?.fixtures || 0, percent: 100 } }
      };
      statsRouteViewSnapshots.set(date, complete);
      return complete;
    }).catch(error => {
      const current = statsRouteViewSnapshots.get(date) || {};
      const failed = {
        ppg: { ...(current.ppg || {}), complete: true, failed: true, error: error.message || 'PPG analysis failed', progress: { stage: 'FAILED', processed: 0, total: current.ppg?.summary?.fixtures || 0, percent: 0 } },
        convergence: { ...(current.convergence || {}), complete: true, failed: true, error: error.message || 'Convergence analysis failed', progress: { stage: 'FAILED', processed: 0, total: current.convergence?.summary?.fixtures || 0, percent: 0 } }
      };
      statsRouteViewSnapshots.set(date, failed);
      return failed;
    }).finally(() => statsRouteViewJobs.delete(date));
    statsRouteViewJobs.set(date, task);
  }
  return statsRouteViewSnapshots.get(date);
}

async function getPpgRouteView(date) {
  const snapshot = await ensureStatsRouteView(date);
  return snapshot.ppg;
}

async function getConvergenceRouteView(date) {
  const snapshot = await ensureStatsRouteView(date);
  return snapshot.convergence;
}

function publicQualifiedPick(item, date, engineCode = MARKET_ROUTE_CODE) {
  const fixture = item?.fixture || {};
  const selection = item?.engine?.selection || null;
  if (!selection) return null;
  const kickoff = new Date(fixture.kickoff).getTime();
  if (!Number.isFinite(kickoff) || kickoff <= Date.now()) return null;
  return {
    fixtureId: fixture.id,
    engine: engineCode,
    engineName: engineName(engineCode),
    date,
    kickoff: fixture.kickoff,
    country: fixture.league?.country || 'International',
    league: fixture.league?.name || 'League',
    home: { name: fixture.home?.name || 'Home', logo: fixture.home?.logo || null },
    away: { name: fixture.away?.name || 'Away', logo: fixture.away?.logo || null },
    decision: selection.decision,
    tier: selection.decision === 'FIRE' ? 'BANKER' : 'QUALIFIED',
    market: selection.market,
    label: selection.label,
    odds: selection.odds,
    score: selection.score,
    grade: selection.grade,
    routeName: selection.routeName,
    reasons: Array.isArray(selection.reasons) ? selection.reasons.slice(0, 5) : [],
    missedCondition: selection.missedCondition || null,
    publishedAt: new Date().toISOString(),
    _odds: fixture.odds || {}
  };
}

function publicSnapshotQualifiedPick(row) {
  const kickoff = new Date(row?.kickoff).getTime();
  if (!Number.isFinite(kickoff) || kickoff <= Date.now() || !['FIRE','SAFER'].includes(String(row?.decision || '').toUpperCase())) return null;
  return {
    fixtureId: row.fixture_id,
    engine: row.engine,
    engineName: engineName(row.engine),
    date: row.fixture_date,
    kickoff: row.kickoff,
    country: row.country || 'International',
    league: row.league_name || 'League',
    home: { name: row.home_team || 'Home', logo: null },
    away: { name: row.away_team || 'Away', logo: null },
    decision: row.decision,
    tier: row.decision === 'FIRE' ? 'BANKER' : 'QUALIFIED',
    market: row.market,
    label: row.selection_label || row.market,
    odds: row.odds,
    score: row.engine_score,
    grade: row.grade,
    routeName: row.payload?.engine?.selection?.routeName || row.payload?.engine?.closest?.name || `${engineName(row.engine)} route`,
    reasons: Array.isArray(row.reasons) ? row.reasons.slice(0, 5) : [],
    missedCondition: row.payload?.engine?.selection?.missedCondition || null
  };
}

function consensusLifecycle(row) {
  const kickoff = new Date(row?.kickoff).getTime();
  const freezeMinutes = Math.max(5, Number(process.env.CONSENSUS_FREEZE_MINUTES || 30));
  const freezeAt = Number.isFinite(kickoff) ? kickoff - freezeMinutes * 60_000 : null;
  const frozen = Number.isFinite(freezeAt) && Date.now() >= freezeAt && Date.now() < kickoff;
  return {
    ...row,
    status: frozen ? 'FROZEN' : 'PROVISIONAL',
    freezeAt: Number.isFinite(freezeAt) ? new Date(freezeAt).toISOString() : null,
    freezeMinutes
  };
}

function consensusDatabaseRow(row) {
  if (!row?.fixtureId || !row?.final?.market) return null;
  return {
    fixture_id: row.fixtureId,
    fixture_date: row.date,
    kickoff: row.kickoff,
    country: row.country,
    league_name: row.league,
    home_team: row.home?.name || 'Home',
    away_team: row.away?.name || 'Away',
    classification: row.classification,
    agreement_count: row.agreementCount,
    agreement_direction: row.agreementDirection,
    market: row.final.market,
    selection_label: row.final.label,
    odds: row.final.odds,
    consensus_score: row.score,
    engine_codes: row.engines || [],
    engine_picks: row.enginePicks || [],
    status: row.status,
    settlement_status: 'PENDING',
    reasons: row.reasons || [],
    payload: { consensus: row },
    updated_at: new Date().toISOString()
  };
}

async function storeConsensusRows(rows = []) {
  const publishable = rows.filter(row => ['ELITE_BANKER', 'CONSENSUS_BANKER', 'QUALIFIED_PICK', 'SAFER_PICK'].includes(row.classification) && row.final?.market && Number(row.final?.odds) > 1);
  if (!publishable.length) return;
  const candidateRows = publishable.map(consensusDatabaseRow).filter(Boolean);
  const frozenRows = publishable.filter(row => row.status === 'FROZEN').map(row => ({
    ...consensusDatabaseRow(row),
    frozen_at: new Date().toISOString(),
    status: undefined,
    updated_at: undefined
  })).map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)));
  const operations = [upsertConsensusCandidates(candidateRows)];
  if (frozenRows.length) operations.push(freezeConsensusSnapshots(frozenRows));
  const settled = await Promise.allSettled(operations);
  for (const result of settled) if (result.status === 'rejected') console.error('Consensus storage failed:', result.reason?.message || result.reason);
}

async function getQualifiedPicksWindow(from, days = 7) {
  const safeDays = Math.max(1, Math.min(7, Number(days) || 7));
  const key = `qualified-picks-v35:${from}:${safeDays}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cache: 'HIT' };
  const dates = Array.from({ length: safeDays }, (_, index) => addDays(from, index));
  const marketBoards = await Promise.all(dates.map(date => getMarketRouteBoard(date).catch(() => ({ date, qualified: [], summary: {} }))));
  const marketPicks = marketBoards.flatMap(board => (board.qualified || []).map(item => publicQualifiedPick(item, board.date, MARKET_ROUTE_CODE)).filter(Boolean));
  const statsPicks = [];
  const dateQueue = [...dates];
  async function statsWorker() {
    while (dateQueue.length) {
      const date = dateQueue.shift();
      try {
        const bundle = await getStatsRouteBoards(date);
        statsPicks.push(...(bundle.ppg.qualified || []).map(item => publicQualifiedPick(item, date, PPG_ROUTE_CODE)).filter(Boolean));
        statsPicks.push(...(bundle.convergence.qualified || []).map(item => publicQualifiedPick(item, date, CONVERGENCE_ROUTE_CODE)).filter(Boolean));
      } catch {}
    }
  }
  await Promise.all([statsWorker(), statsWorker()]);
  const finalMarketBoards = await Promise.all(dates.map(date => getMarketRouteBoard(date).catch(() => null)));
  const finalMarketPicks = finalMarketBoards.flatMap((board, index) => (board?.qualified || marketBoards[index]?.qualified || []).map(item => publicQualifiedPick(item, dates[index], MARKET_ROUTE_CODE)).filter(Boolean));
  const unique = new Map();
  for (const pick of [...finalMarketPicks, ...statsPicks]) unique.set(`${pick.fixtureId}:${pick.engine}:${pick.market}`, pick);
  const enginePicksInternal = [...unique.values()];
  enginePicksInternal.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff) || (a.decision === 'FIRE' ? -1 : 1));

  const consensusRows = buildConsensusWindow(enginePicksInternal).map(consensusLifecycle);
  await storeConsensusRows(consensusRows);
  const enginePicks = enginePicksInternal.map(({ _odds, ...pick }) => pick);

  const elite = consensusRows.filter(item => item.classification === 'ELITE_BANKER');
  const consensusBankers = consensusRows.filter(item => item.classification === 'CONSENSUS_BANKER');
  const singleQualified = consensusRows.filter(item => item.classification === 'QUALIFIED_PICK');
  const saferConsensus = consensusRows.filter(item => item.classification === 'SAFER_PICK');
  const conflicts = consensusRows.filter(item => item.classification === 'CONFLICT');
  const holds = consensusRows.filter(item => item.classification === 'HOLD_MISSING_SHARED_PRICE');
  const publishable = [...elite, ...consensusBankers, ...singleQualified, ...saferConsensus]
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff) || b.agreementCount - a.agreementCount || b.score - a.score);
  const bankers = [...elite, ...consensusBankers].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff) || b.agreementCount - a.agreementCount);

  const byDate = dates.map(date => ({
    date,
    elite: elite.filter(item => item.date === date),
    consensus: consensusBankers.filter(item => item.date === date),
    qualified: singleQualified.filter(item => item.date === date),
    safer: saferConsensus.filter(item => item.date === date),
    conflicts: conflicts.filter(item => item.date === date),
    enginePicks: enginePicks.filter(item => item.date === date)
  }));
  const response = {
    from,
    to: dates.at(-1),
    days: safeDays,
    bankers,
    qualified: enginePicks,
    enginePicks,
    consensusPicks: publishable,
    elite,
    consensusBankers,
    singleQualified,
    safer: saferConsensus,
    conflicts,
    holds,
    byDate,
    consensus: { elite, bankers: consensusBankers, qualified: singleQualified, safer: saferConsensus, conflicts, holds, all: consensusRows },
    summary: {
      ...consensusSummary(consensusRows),
      bankers: bankers.length,
      engineQualified: enginePicks.length,
      publishable: publishable.length
    },
    generatedAt: new Date().toISOString(),
    cache: 'MISS'
  };
  cacheSet(key, response, Number(process.env.CONSENSUS_CACHE_TTL_SECONDS || 180));
  return response;
}

const consensusViewSnapshots = new Map();
const consensusViewJobs = new Map();

function partialConsensusResponse(from, days, marketBoard, statsSnapshot) {
  const safeDays = Math.max(1, Math.min(7, Number(days) || 7));
  const dates = Array.from({ length: safeDays }, (_, index) => addDays(from, index));
  const enginePicksInternal = [
    ...(marketBoard?.qualified || []).map(item => publicQualifiedPick(item, from, MARKET_ROUTE_CODE)).filter(Boolean),
    ...(statsSnapshot?.ppg?.qualified || []).map(item => publicQualifiedPick(item, from, PPG_ROUTE_CODE)).filter(Boolean),
    ...(statsSnapshot?.convergence?.qualified || []).map(item => publicQualifiedPick(item, from, CONVERGENCE_ROUTE_CODE)).filter(Boolean)
  ];
  const unique = new Map();
  for (const pick of enginePicksInternal) unique.set(`${pick.fixtureId}:${pick.engine}:${pick.market}`, pick);
  const internal = [...unique.values()].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const consensusRows = buildConsensusWindow(internal).map(consensusLifecycle);
  const enginePicks = internal.map(({ _odds, ...pick }) => pick);
  const elite = consensusRows.filter(item => item.classification === 'ELITE_BANKER');
  const consensusBankers = consensusRows.filter(item => item.classification === 'CONSENSUS_BANKER');
  const singleQualified = consensusRows.filter(item => item.classification === 'QUALIFIED_PICK');
  const saferConsensus = consensusRows.filter(item => item.classification === 'SAFER_PICK');
  const conflicts = consensusRows.filter(item => item.classification === 'CONFLICT');
  const holds = consensusRows.filter(item => item.classification === 'HOLD_MISSING_SHARED_PRICE');
  const publishable = [...elite, ...consensusBankers, ...singleQualified, ...saferConsensus];
  const bankers = [...elite, ...consensusBankers];
  const statsComplete = Boolean(statsSnapshot?.ppg?.complete && statsSnapshot?.convergence?.complete);
  const fixtureTotal = Number(statsSnapshot?.ppg?.summary?.fixtures || marketBoard?.summary?.fixtures || 0);
  const fixtureProcessed = statsComplete ? fixtureTotal : Number(statsSnapshot?.ppg?.progress?.processed || statsSnapshot?.ppg?.summary?.analysed || 0);
  const total = safeDays === 1 ? fixtureTotal : safeDays;
  const processed = safeDays === 1 ? fixtureProcessed : (statsComplete ? 1 : 0);
  return {
    from,
    to: dates.at(-1),
    days: safeDays,
    bankers,
    qualified: enginePicks,
    enginePicks,
    consensusPicks: publishable,
    elite,
    consensusBankers,
    singleQualified,
    safer: saferConsensus,
    conflicts,
    holds,
    byDate: dates.map(date => ({
      date,
      elite: elite.filter(item => item.date === date),
      consensus: consensusBankers.filter(item => item.date === date),
      qualified: singleQualified.filter(item => item.date === date),
      safer: saferConsensus.filter(item => item.date === date),
      conflicts: conflicts.filter(item => item.date === date),
      enginePicks: enginePicks.filter(item => item.date === date)
    })),
    consensus: { elite, bankers: consensusBankers, qualified: singleQualified, safer: saferConsensus, conflicts, holds, all: consensusRows },
    summary: { ...consensusSummary(consensusRows), bankers: bankers.length, engineQualified: enginePicks.length, publishable: publishable.length },
    progress: { stage: statsComplete ? 'SELECTED_DATE_COMPLETE' : 'SELECTED_DATE_ANALYSIS', processed, total, percent: total ? Math.round(processed / total * 100) : 0 },
    complete: false,
    failed: false,
    generatedAt: new Date().toISOString(),
    cache: 'MISS'
  };
}

async function getQualifiedPicksWindowView(from, days = 7) {
  const safeDays = Math.max(1, Math.min(7, Number(days) || 7));
  const key = `${from}:${safeDays}`;
  const finalCached = cacheGet(`qualified-picks-v35:${from}:${safeDays}`);
  if (finalCached) return { ...finalCached, complete: true, failed: false, progress: { stage: 'COMPLETE', processed: safeDays, total: safeDays, percent: 100 }, cache: 'HIT' };

  const marketBoard = await getMarketRouteBoard(from);
  const statsSnapshot = await ensureStatsRouteView(from);
  const partial = partialConsensusResponse(from, safeDays, marketBoard, statsSnapshot);
  consensusViewSnapshots.set(key, partial);

  if (!consensusViewJobs.has(key)) {
    const task = getQualifiedPicksWindow(from, safeDays).then(final => {
      const complete = { ...final, complete: true, failed: false, progress: { stage: 'COMPLETE', processed: safeDays, total: safeDays, percent: 100 } };
      consensusViewSnapshots.set(key, complete);
      return complete;
    }).catch(error => {
      const current = consensusViewSnapshots.get(key) || partial;
      const failed = { ...current, complete: true, failed: true, error: error.message || 'Consensus analysis failed', progress: { stage: 'FAILED', processed: 0, total: safeDays, percent: 0 } };
      consensusViewSnapshots.set(key, failed);
      return failed;
    }).finally(() => consensusViewJobs.delete(key));
    consensusViewJobs.set(key, task);
  }
  return consensusViewSnapshots.get(key) || partial;
}

function compactEngineAudit(item, code) {
  const engine = item?.engine || {};
  const selection = engine.selection || null;
  const closest = selection
    ? (engine.candidates || []).find(candidate => candidate.id === selection.routeId)
    : [...(engine.candidates || [])].sort((a, b) => (a.failures?.length || 99) - (b.failures?.length || 99) || Number(b.score || 0) - Number(a.score || 0))[0];
  return {
    engine: code,
    engineName: engineName(code),
    decision: selection?.decision || engine.decision || 'NO_SIGNAL',
    selection: selection ? { market: selection.market, label: selection.label, odds: selection.odds, score: selection.score, grade: selection.grade, routeName: selection.routeName } : null,
    explanation: engine.explanation || null,
    route: selection?.routeName || closest?.name || null,
    score: Number(selection?.score || closest?.score || 0),
    failures: Array.isArray(closest?.failures) ? closest.failures : [],
    checks: Array.isArray(closest?.checks) ? closest.checks : [],
    candidates: (engine.candidates || []).slice(0, 8).map(candidate => ({
      id: candidate.id,
      name: candidate.name,
      score: candidate.score,
      failures: candidate.failures || [],
      selected: selection?.routeId === candidate.id
    }))
  };
}

async function getEngineAudit(date) {
  const key = `engine-audit-v35:${date}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cache: 'HIT' };
  const [market, stats] = await Promise.all([getMarketRouteBoard(date), getStatsRouteBoards(date)]);
  const groups = new Map();
  function add(items, code) {
    for (const item of items || []) {
      const id = String(item.fixture?.id || '');
      if (!id) continue;
      if (!groups.has(id)) groups.set(id, { fixture: item.fixture, engines: {} });
      groups.get(id).engines[code] = item;
    }
  }
  add(market.all, MARKET_ROUTE_CODE);
  add(stats.ppg.all, PPG_ROUTE_CODE);
  add(stats.convergence.all, CONVERGENCE_ROUTE_CODE);

  const rows = [];
  for (const [fixtureId, group] of groups.entries()) {
    const fixture = group.fixture || {};
    const selected = [];
    for (const code of ENGINE_CODES) {
      const item = group.engines[code];
      if (!item?.engine?.selection) continue;
      const pick = publicQualifiedPick(item, date, code);
      if (pick) selected.push(pick);
    }
    const consensus = consensusLifecycle(buildConsensusForFixture({
      fixture: {
        fixtureId,
        date,
        kickoff: fixture.kickoff,
        country: fixture.league?.country,
        leagueName: fixture.league?.name,
        home: fixture.home,
        away: fixture.away
      },
      picks: selected,
      odds: fixture.odds || {}
    }));
    rows.push({
      fixtureId,
      date,
      kickoff: fixture.kickoff,
      country: fixture.league?.country || 'International',
      league: fixture.league?.name || 'League',
      home: fixture.home,
      away: fixture.away,
      engines: ENGINE_CODES.map(code => compactEngineAudit(group.engines[code], code)),
      consensus
    });
  }
  rows.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const response = {
    date,
    rows,
    summary: {
      fixtures: rows.length,
      elite: rows.filter(row => row.consensus.classification === 'ELITE_BANKER').length,
      consensus: rows.filter(row => row.consensus.classification === 'CONSENSUS_BANKER').length,
      conflicts: rows.filter(row => row.consensus.classification === 'CONFLICT').length,
      noSignal: rows.filter(row => row.consensus.classification === 'NO_SIGNAL').length
    },
    generatedAt: new Date().toISOString(),
    cache: 'MISS'
  };
  cacheSet(key, response, 180);
  return response;
}

async function findApiFootballTeamVisual(name, country = '') {
  return resolveApiFootballTeam(name, country).catch(() => null);
}

async function serveTeamCrest(res, url) {
  const name = String(url?.searchParams?.get('name') || '').trim();
  const country = String(url?.searchParams?.get('country') || '').trim();
  if (name.length < 2) {
    res.writeHead(404, securityHeaders());
    return res.end();
  }
  const visual = await findApiFootballTeamVisual(name, country);
  if (!visual?.id) {
    res.writeHead(404, securityHeaders());
    return res.end();
  }
  const proxyUrl = new URL(`/api/media/team/${encodeURIComponent(String(visual.id))}.png`, 'http://betynz.local');
  return serveApiFootballMedia(res, proxyUrl);
}

async function readJsonBody(req, limit = 100_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}

async function requireAdmin(req, res) {
  try {
    const session = await getAdminSession(req);
    if (!session.authenticated) {
      json(res, 401, { error: 'Admin sign-in required.', code: 'ADMIN_AUTH_REQUIRED' });
      return null;
    }
    if (session.refreshed) res.setHeader('set-cookie', sessionCookies(session.refreshed));
    return session;
  } catch (error) {
    json(res, 503, { error: error.message || 'Admin authentication is unavailable.' });
    return null;
  }
}

async function apiRoute(req, res, url) {
  if (url.pathname === '/api/health') return json(res, 200, {
    ok: true,
    app: 'Betynz',
    version: APP_VERSION,
    engines: ENGINE_CODES,
    systems: ['CONSENSUS_BANKERS', 'AUTOMATIC_CALIBRATION'],
    configured: { apiFootball: apiFootballConfigured(), supabase: supabaseConfigured() },
    sourceRoles: { fixtures: 'API_FOOTBALL', odds: 'API_FOOTBALL', live: 'API_FOOTBALL', results: 'API_FOOTBALL', statistics: 'API_FOOTBALL', visuals: 'API_FOOTBALL' },
    fixtureCoverage: { daily: 'ALL_RETURNED_FIXTURES', applicationCap: null },
    time: new Date().toISOString()
  });

  if (url.pathname === '/api/config') return json(res, 200, {
    appName: process.env.APP_NAME || 'Betynz',
    version: APP_VERSION,
    engines: ['Market Route Engine', 'PPG Route Engine', 'Convergence Engine'],
    systems: ['Consensus Bankers', 'Settlement Calibration'],
    consensusFreezeMinutes: Math.max(5, Number(process.env.CONSENSUS_FREEZE_MINUTES || 30)),
    dataSources: { fixtures: 'API-Football', odds: 'API-Football', statistics: 'API-Football', visuals: 'API-Football', live: 'API-Football', results: 'API-Football' },
    fixtureCoverage: { daily: 'ALL_RETURNED_FIXTURES', applicationCap: null },
    responsiblePlay: 'Predictions are informational, not guarantees. Adults only.'
  });

  if (url.pathname.startsWith('/api/media/')) return serveApiFootballMedia(res, url);
  if (url.pathname === '/api/team-crest') return serveTeamCrest(res, url);

  if (url.pathname === '/api/team-visual') {
    const name = String(url.searchParams.get('name') || '').trim();
    const country = String(url.searchParams.get('country') || '').trim();
    if (name.length < 3) return json(res, 400, { error: 'name is required' });
    const visual = await findApiFootballTeamVisual(name, country).catch(() => null);
    return jsonCached(res, 200, {
      found: Boolean(visual?.id && visual?.logo),
      team: visual?.id && visual?.logo ? { id: visual.id, name: visual.name, logo: visual.logo } : null
    }, 3600);
  }

  if (url.pathname === '/api/team-visuals') {
    const names = String(url.searchParams.get('names') || '').split('|').map(value => value.trim()).filter(value => value.length >= 3);
    const country = String(url.searchParams.get('country') || '').trim();
    const teams = await Promise.all(names.map(async name => {
      const visual = await findApiFootballTeamVisual(name, country).catch(() => null);
      return { name, found: Boolean(visual?.id && visual?.logo), team: visual ? { id: visual.id, name: visual.name, logo: visual.logo } : null };
    }));
    return jsonCached(res, 200, { teams }, 3600);
  }

  if (url.pathname === '/api/fixture-visuals') {
    const date = url.searchParams.get('date') || utcDateOffset(0);
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    const board = await getFastFixtureBoard(date);
    const enrichment = await enrichApiFootballVisuals(date, board.fixtures || []).catch(() => ({ configured: apiFootballConfigured(), source: null, visuals: [] }));
    return jsonCached(res, 200, {
      date,
      configured: enrichment.configured,
      source: 'API_FOOTBALL',
      enrichmentSource: enrichment.enrichmentSource || null,
      visuals: enrichment.visuals || []
    }, 1800);
  }

  if (url.pathname === '/api/auth/login') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return json(res, 400, { error: 'Email and password are required.' });
    try {
      const auth = await signInWithPassword(email, password);
      const probe = { headers: { cookie: `betynz_admin_access=${encodeURIComponent(auth.access_token)}; betynz_admin_refresh=${encodeURIComponent(auth.refresh_token)}` } };
      const session = await getAdminSession(probe);
      if (!session.authenticated) return json(res, 403, { error: 'This account does not have the admin role.' }, { 'set-cookie': clearSessionCookies() });
      return json(res, 200, { ok: true, user: session.user }, { 'set-cookie': sessionCookies(auth) });
    } catch (error) {
      return json(res, error.status || 401, { error: error.message || 'Sign-in failed.' });
    }
  }

  if (url.pathname === '/api/auth/me') {
    const session = await getAdminSession(req);
    const extra = session.refreshed ? { 'set-cookie': sessionCookies(session.refreshed) } : {};
    if (!session.authenticated) return json(res, 401, { authenticated: false }, extra);
    return json(res, 200, { authenticated: true, user: session.user }, extra);
  }

  if (url.pathname === '/api/auth/logout') return json(res, 200, { ok: true }, { 'set-cookie': clearSessionCookies() });

  if (url.pathname === '/api/admin/health') {
    if (!await requireAdmin(req, res)) return;
    return json(res, 200, {
      ok: true,
      version: APP_VERSION,
      engines: ENGINE_CODES,
      cache: cacheStats(),
      configured: {
        apiFootball: apiFootballConfigured(),
        apiFootballConfig: apiFootballPublicConfig(),
        supabase: supabaseConfigured()
      }
    });
  }

  if (url.pathname === '/api/admin/feed-diagnostics' || url.pathname === '/api/admin/api-football-diagnostics') {
    if (!await requireAdmin(req, res)) return;
    const date = url.searchParams.get('date') || utcDateOffset(0);
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    return json(res, 200, await diagnoseApiFootball(date));
  }

  if (url.pathname === '/api/fixtures') {
    const date = url.searchParams.get('date') || utcDateOffset(0);
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    try {
      return jsonCached(res, 200, await getFastFixtureBoard(date), 60);
    } catch (error) {
      const code = apiFootballConfigured() ? 'API_FOOTBALL_REQUEST_FAILED' : 'API_FOOTBALL_NOT_CONFIGURED';
      return json(res, apiFootballConfigured() ? 502 : 503, { error: code, message: 'The football fixture feed is temporarily unavailable.' });
    }
  }

  if (url.pathname === '/api/results') {
    const date = url.searchParams.get('date') || utcDateOffset(0);
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    try {
      const results = await getApiFootballResults(date);
      const fixtures = (results.fixtures || []).filter(item => !isSrlFixture(item)).map(publicFixture).filter(Boolean);
      return jsonCached(res, 200, { date, configured: results.configured, source: 'API_FOOTBALL', fixtures, generatedAt: new Date().toISOString() }, Number(process.env.RESULTS_CACHE_TTL_SECONDS || 300));
    } catch {
      return json(res, apiFootballConfigured() ? 502 : 503, { error: apiFootballConfigured() ? 'API_FOOTBALL_RESULTS_FAILED' : 'API_FOOTBALL_NOT_CONFIGURED', message: 'The football results feed is temporarily unavailable.' });
    }
  }

  if (url.pathname === '/api/fixtures-week') {
    const start = url.searchParams.get('start') || utcDateOffset(0);
    if (!safeDate(start)) return json(res, 400, { error: 'start must be YYYY-MM-DD' });
    const days = await Promise.all(Array.from({ length: 7 }, (_, index) => getFastFixtureBoard(addDays(start, index))));
    return jsonCached(res, 200, { start, days, generatedAt: new Date().toISOString() }, 120);
  }

  if (url.pathname === '/api/market-route-board' || url.pathname === '/api/predictions') {
    const date = url.searchParams.get('date') || utcDateOffset(0);
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    return jsonCached(res, 200, await getMarketRouteBoard(date), 60);
  }

  if (url.pathname === '/api/ppg-route-board') {
    const date = url.searchParams.get('date') || utcDateOffset(0);
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    return jsonCached(res, 200, await getPpgRouteView(date), 5);
  }

  if (url.pathname === '/api/convergence-route-board') {
    const date = url.searchParams.get('date') || utcDateOffset(0);
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    return jsonCached(res, 200, await getConvergenceRouteView(date), 5);
  }

  if (url.pathname === '/api/qualified-picks' || url.pathname === '/api/consensus-picks') {
    const from = url.searchParams.get('from') || utcDateOffset(0);
    const days = Number(url.searchParams.get('days') || 7);
    if (!safeDate(from)) return json(res, 400, { error: 'from must be YYYY-MM-DD' });
    return jsonCached(res, 200, await getQualifiedPicksWindowView(from, days), 5);
  }

  if (url.pathname === '/api/match-intelligence') {
    const started = Date.now();
    const date = url.searchParams.get('date') || utcDateOffset(0);
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    const context = {
      sourceEventId: String(url.searchParams.get('event_id') || '').trim(),
      beforeDate: date,
      homeName: String(url.searchParams.get('home') || '').trim(),
      awayName: String(url.searchParams.get('away') || '').trim(),
      league: String(url.searchParams.get('league') || '').trim(),
      country: String(url.searchParams.get('country') || '').trim(),
      kickoff: String(url.searchParams.get('kickoff') || '').trim(),
      homeId: String(url.searchParams.get('home_id') || '').trim(),
      awayId: String(url.searchParams.get('away_id') || '').trim()
    };
    const key = `market-route-intelligence:${date}:${context.sourceEventId || `${normalizeName(context.homeName)}:${normalizeName(context.awayName)}`}`;
    const cached = cacheGet(key);
    if (cached) return jsonCached(res, 200, { ...cached, cache: 'HIT' }, 120);
    try {
      const board = await getFastFixtureBoard(date);
      const fixture = matchFixture(board.fixtures, context);
      if (!fixture) return json(res, 200, { available: false, error: 'FIXTURE_NOT_FOUND', loadMs: Date.now() - started });
      const apiStats = await getApiFootballIntelligence({ ...context, date }, fixture, { mode: 'deep' }).catch(() => null);
      const stats = extractVenueStats(apiStats, context);
      if (apiStats?.fixture) {
        fixture.home = { ...fixture.home, id: apiStats.fixture.home?.id || fixture.home?.id || null, logo: apiStats.fixture.home?.logo || fixture.home?.logo || null };
        fixture.away = { ...fixture.away, id: apiStats.fixture.away?.id || fixture.away?.id || null, logo: apiStats.fixture.away?.logo || fixture.away?.logo || null };
        fixture.league = { ...fixture.league, id: apiStats.fixture.league?.id || fixture.league?.id || null, logo: apiStats.fixture.league?.logo || fixture.league?.logo || null, flag: apiStats.fixture.league?.flag || fixture.league?.flag || null, season: apiStats.fixture.league?.season || fixture.league?.season || null };
      }
      const engine = analyzeMarketRoute(fixture, stats);
      const ppgEngine = analyzePpgRoute(fixture, stats);
      const convergenceEngine = analyzeConvergence(fixture, stats);
      const selectedPicks = [
        publicQualifiedPick({ fixture, engine }, date, MARKET_ROUTE_CODE),
        publicQualifiedPick({ fixture, engine: ppgEngine }, date, PPG_ROUTE_CODE),
        publicQualifiedPick({ fixture, engine: convergenceEngine }, date, CONVERGENCE_ROUTE_CODE)
      ].filter(Boolean);
      const consensusEngine = consensusLifecycle(buildConsensusForFixture({
        fixture: {
          fixtureId: fixture.id,
          date,
          kickoff: fixture.kickoff,
          country: fixture.league?.country,
          leagueName: fixture.league?.name,
          home: fixture.home,
          away: fixture.away
        },
        picks: selectedPicks,
        odds: fixture.odds || {}
      }));
      await Promise.all([
        storePredictions(date, [{ fixture, engine }], MARKET_ROUTE_CODE),
        storePredictions(date, [{ fixture, engine: ppgEngine }], PPG_ROUTE_CODE),
        storePredictions(date, [{ fixture, engine: convergenceEngine }], CONVERGENCE_ROUTE_CODE),
        storeConsensusRows([consensusEngine])
      ]);
      const response = {
        available: true,
        fixture: publicFixture(fixture),
        engine,
        ppgEngine,
        convergenceEngine,
        consensusEngine,
        venueForm: publicVenueForm(stats),
        statisticsAvailable: Boolean(stats?.homeSplit || stats?.awaySplit),
        statisticsSource: stats?.homeSplit || stats?.awaySplit ? 'API_FOOTBALL' : null,
        enrichmentSource: apiStats?.mapped ? 'API_FOOTBALL' : null,
        apiFootball: apiStats ? { mapped: Boolean(apiStats.mapped), mappingConfidence: apiStats.mappingConfidence || 0, fixture: apiStats.fixture || null, standings: apiStats.standings || null, teamStatistics: apiStats.teamStatistics || null, h2h: apiStats.h2h || [], predictions: apiStats.predictions || null, injuries: apiStats.injuries || [], fixtureStatistics: apiStats.fixtureStatistics || [], lineups: apiStats.lineups || [], events: apiStats.events || [], players: apiStats.players || [] } : null,
        note: 'Three independent engines are measured separately. The Consensus System publishes the safest shared market only when their directions agree.',
        loadMs: Date.now() - started,
        cache: 'MISS'
      };
      cacheSet(key, response, Number(process.env.MATCH_INTELLIGENCE_CACHE_TTL_SECONDS || 600));
      return jsonCached(res, 200, response, 120);
    } catch (error) {
      console.error('Match intelligence failed:', error.message);
      return json(res, 200, { available: false, error: 'MATCH_INTELLIGENCE_UNAVAILABLE', loadMs: Date.now() - started });
    }
  }

  if (url.pathname === '/api/live') {
    const date = url.searchParams.get('date') || utcDateOffset(0);
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    const live = await getApiFootballLiveBoard();
    let proof = { rows: [] };
    try { proof = await getPredictionSnapshots({ from: date, to: date, engine: 'ALL', limit: 1000, includePending: true }); } catch {}
    const normalized = value => normalizeName(String(value || ''));
    const predictions = (proof.rows || []).map(publicProofRow);
    const fixtures = (live.fixtures || []).filter(item => !isSrlFixture(item)).map(item => {
      const home = normalized(item.home?.name);
      const away = normalized(item.away?.name);
      return { ...item, frozenPredictions: predictions.filter(row => normalized(row.home) === home && normalized(row.away) === away) };
    });
    return jsonCached(res, 200, { date, configured: live.configured, source: live.source, warning: live.warning || null, fixtures, generatedAt: new Date().toISOString() }, Number(process.env.LIVE_CACHE_TTL_SECONDS || 30));
  }

  if (url.pathname === '/api/live-events') {
    const fixtureId = String(url.searchParams.get('fixture_id') || '').trim();
    if (!fixtureId || !/^[A-Za-z0-9:_-]+$/.test(fixtureId)) return json(res, 400, { error: 'fixture_id is required' });
    const events = await getApiFootballFixtureEvents(fixtureId);
    return jsonCached(res, 200, { fixtureId, events, redCards: events.filter(item => /red/i.test(String(item.detail || ''))), generatedAt: new Date().toISOString() }, 20);
  }

  if (url.pathname === '/api/proof') {
    const from = url.searchParams.get('from') || utcDateOffset(-30);
    const to = url.searchParams.get('to') || utcDateOffset(0);
    const status = String(url.searchParams.get('status') || 'ALL').toUpperCase();
    if (!safeDate(from) || !safeDate(to)) return json(res, 400, { error: 'from and to must be YYYY-MM-DD' });
    const [result, consensus] = await Promise.all([
      proofData({ from, to, engine: 'ALL', status, includePending: true, limit: 5000 }),
      getConsensusSnapshots({ from, to, status, includePending: true, limit: 3000 }).catch(() => ({ rows: [], configured: false }))
    ]);
    const rows = [
      ...result.rows.map(row => ({ ...publicProofRow(row), recordType: 'ENGINE' })),
      ...(consensus.rows || []).map(row => ({ ...publicConsensusProofRow(row), recordType: 'CONSENSUS' }))
    ].sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
    return json(res, 200, {
      configured: result.configured || consensus.configured,
      summary: buildPerformance([...(result.rows || []), ...(consensus.rows || []).map(row => ({ ...row, engine: CONSENSUS_SYSTEM_CODE }))]).summary,
      consensusSummary: buildAgreementPerformance(consensus.rows || []),
      rows,
      generatedAt: new Date().toISOString()
    });
  }

  if (url.pathname === '/api/performance') {
    const from = url.searchParams.get('from') || utcDateOffset(-90);
    const to = url.searchParams.get('to') || utcDateOffset(0);
    if (!safeDate(from) || !safeDate(to)) return json(res, 400, { error: 'from and to must be YYYY-MM-DD' });
    const [result, consensus] = await Promise.all([
      proofData({ from, to, engine: 'ALL', includePending: true, limit: 10000 }),
      getConsensusSnapshots({ from, to, includePending: true, limit: 5000 }).catch(() => ({ rows: [], configured: false }))
    ]);
    return json(res, 200, {
      configured: result.configured || consensus.configured,
      ...buildPerformance(result.rows),
      byAgreement: buildAgreementPerformance(consensus.rows || []),
      consensusRows: (consensus.rows || []).length,
      generatedAt: new Date().toISOString()
    });
  }

  if (url.pathname === '/api/odds-movement') {
    const date = url.searchParams.get('date') || utcDateOffset(0);
    const fixtureId = String(url.searchParams.get('fixture_id') || '').trim();
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    const result = await getOddsSnapshots({ fixtureId: fixtureId || undefined, from: `${date}T00:00:00.000Z`, to: `${date}T23:59:59.999Z`, limit: fixtureId ? 500 : 5000 });
    const grouped = new Map();
    for (const row of result.rows || []) {
      const key = String(row.fixture_id || '');
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }
    const board = await getFastFixtureBoard(date).catch(() => ({ fixtures: [] }));
    const fixtureMap = new Map((board.fixtures || []).map(item => [String(item.id), item]));
    let frozenRows = [];
    try { frozenRows = (await getPredictionSnapshots({ from: date, to: date, engine: 'ALL', limit: 3000, includePending: true })).rows || []; } catch {}
    const rows = [...grouped.entries()].map(([id, snapshots]) => {
      const fixture = fixtureMap.get(id) || null;
      const summary = summarizeOddsSnapshots(snapshots, { fixtureId: id, kickoff: fixture?.kickoff });
      const frozen = frozenRows.filter(item => String(item.fixture_id) === id).map(item => {
        const movement = summary.markets.find(market => market.market === item.market);
        return { engine: item.engine, market: item.market, label: item.selection_label || item.market, frozenOdds: item.odds, clv: movement?.closing ? closingLineValue(item.odds, movement.closing) : null };
      });
      return { fixtureId: id, fixture: fixture ? { kickoff: fixture.kickoff, league: fixture.league, home: fixture.home, away: fixture.away } : null, ...summary, frozen };
    });
    return jsonCached(res, 200, { configured: result.configured, date, rows, generatedAt: new Date().toISOString() }, 45);
  }

  if (url.pathname === '/api/leagues') {
    const from = url.searchParams.get('from') || utcDateOffset(-90);
    const to = url.searchParams.get('to') || utcDateOffset(0);
    if (!safeDate(from) || !safeDate(to)) return json(res, 400, { error: 'from and to must be YYYY-MM-DD' });
    const [proof, results] = await Promise.all([
      proofData({ from, to, engine: 'ALL', includePending: true, limit: 10000 }),
      getMatchResults({ from, to, limit: 10000 }).catch(() => ({ rows: [] }))
    ]);
    return jsonCached(res, 200, { configured: proof.configured, from, to, leagues: buildLeagueIntelligence(proof.rows || [], results.rows || []), generatedAt: new Date().toISOString() }, 300);
  }

  if (url.pathname === '/api/admin/engine-audit') {
    if (!await requireAdmin(req, res)) return;
    const date = url.searchParams.get('date') || utcDateOffset(0);
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    return json(res, 200, await getEngineAudit(date));
  }

  if (url.pathname === '/api/admin/calibration') {
    if (!await requireAdmin(req, res)) return;
    const from = url.searchParams.get('from') || utcDateOffset(-365);
    const to = url.searchParams.get('to') || utcDateOffset(0);
    if (!safeDate(from) || !safeDate(to)) return json(res, 400, { error: 'from and to must be YYYY-MM-DD' });
    const [engines, consensus] = await Promise.all([
      getPredictionSnapshots({ from, to, engine: 'ALL', limit: 20000, includePending: false }),
      getConsensusSnapshots({ from, to, limit: 10000, includePending: false })
    ]);
    return json(res, 200, {
      configured: engines.configured || consensus.configured,
      from,
      to,
      ...buildCalibrationReport(engines.rows || [], consensus.rows || [])
    });
  }

  if (url.pathname === '/api/admin/consensus-candidates') {
    if (!await requireAdmin(req, res)) return;
    const from = url.searchParams.get('from') || utcDateOffset(0);
    const to = url.searchParams.get('to') || addDays(from, 6);
    if (!safeDate(from) || !safeDate(to)) return json(res, 400, { error: 'from and to must be YYYY-MM-DD' });
    const result = await getConsensusCandidates({ from, to, limit: 5000 });
    return json(res, 200, { configured: result.configured, rows: result.rows || [], generatedAt: new Date().toISOString() });
  }

  if (url.pathname === '/api/admin/learning') {
    if (!await requireAdmin(req, res)) return;
    const from = url.searchParams.get('from') || utcDateOffset(-365);
    const to = url.searchParams.get('to') || utcDateOffset(0);
    const result = await proofData({ from, to, engine: 'ALL', includePending: true, limit: 10000 });
    return json(res, 200, { configured: result.configured, ...buildLearningRecommendations(result.rows), generatedAt: new Date().toISOString() });
  }

  if (url.pathname === '/api/admin/settle') {
    if (!await requireAdmin(req, res)) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = await readJsonBody(req);
    const date = String(body.date || url.searchParams.get('date') || utcDateOffset(-1));
    if (!safeDate(date)) return json(res, 400, { error: 'date must be YYYY-MM-DD' });
    return json(res, 200, await settleDate(date));
  }

  if (url.pathname === '/api/admin/visual-diagnostics') {
    if (!await requireAdmin(req, res)) return;
    const name = String(url.searchParams.get('name') || '').trim();
    const country = String(url.searchParams.get('country') || '').trim();
    if (name.length < 3) return json(res, 400, { error: 'A team name is required.' });
    const visual = await findApiFootballTeamVisual(name, country).catch(() => null);
    return json(res, 200, { configured: apiFootballConfigured(), found: Boolean(visual), team: visual ? { id: visual.id, name: visual.name, country: visual.country, confidence: visual.confidence, crest: visual.logo } : null });
  }

  return json(res, 404, { error: 'API route not found' });
}

async function staticRoute(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const safe = normalize(pathname).replace(/^([.][.][/\\])+/, '');
  const filePath = join(root, safe);
  if (!filePath.startsWith(root)) return json(res, 403, { error: 'Forbidden' });
  try {
    const body = await readFile(filePath);
    const extension = extname(filePath);
    res.writeHead(200, {
      ...securityHeaders(),
      'content-type': contentTypes[extension] || 'application/octet-stream',
      'cache-control': /\/assets\//.test(pathname) ? 'public, max-age=31536000, immutable' : extension === '.html' ? 'no-cache' : 'public, max-age=300, stale-while-revalidate=86400'
    });
    res.end(body);
  } catch {
    json(res, 404, { error: 'Not found' });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await apiRoute(req, res, url);
    return await staticRoute(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, error.status || 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(port, () => console.log(`Betynz ${APP_VERSION} listening on ${port}`));

if (String(process.env.AUTO_SETTLEMENT_ENABLED || 'true').toLowerCase() === 'true') {
  const interval = Math.max(10, Number(process.env.AUTO_SETTLEMENT_INTERVAL_MINUTES || 30)) * 60_000;
  const run = () => Promise.all([utcDateOffset(0), utcDateOffset(-1), utcDateOffset(-2)].map(date => settleDate(date).catch(() => null)));
  setTimeout(run, 20_000).unref?.();
  setInterval(run, interval).unref?.();
}
