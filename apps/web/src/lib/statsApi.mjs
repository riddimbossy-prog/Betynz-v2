import { normalizeName } from './utils.mjs';
import { getProviderIdentityMappings, upsertProviderIdentityMappings } from './supabase.mjs';
import { canonicalFixtureKey, providerFixtureIdentityRow, providerTeamIdentityRows } from './identityRegistry.mjs';

const cache = new Map();
const inflight = new Map();
const queue = [];
let active = 0;
let lastStart = 0;
let windowStarted = Date.now();
let windowCount = 0;
let cooldownUntil = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function statsCacheMaxEntries() {
  return Math.max(100, Math.min(5000, Number(process.env.STATS_API_CACHE_MAX_ENTRIES || 500)));
}

function pruneStatsCache(now = Date.now()) {
  for (const [key, item] of cache.entries()) if (!item || now > item.expiresAt) cache.delete(key);
  const cap = statsCacheMaxEntries();
  while (cache.size > cap) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
const text = value => String(value ?? '').trim();

function config() {
  const env = process.env;
  const isTest = env.NODE_TEST_CONTEXT === '1' || env.BETYNZ_TEST_MODE === '1';
  return {
    key: text(env.STATS_API_KEY),
    baseUrl: text(env.STATS_API_BASE_URL || 'https://api.thestatsapi.com/api').replace(/\/+$/, ''),
    timeoutMs: Math.max(3000, Number(env.STATS_API_TIMEOUT_MS || 15000)),
    concurrency: isTest ? 8 : Math.max(1, Math.min(6, Number(env.STATS_API_CONCURRENCY || 2))),
    minIntervalMs: isTest ? 0 : Math.max(0, Number(env.STATS_API_MIN_INTERVAL_MS || 300)),
    requestsPerMinute: isTest ? 1000 : Math.max(1, Number(env.STATS_API_REQUESTS_PER_MINUTE || 40)),
    retries: isTest ? 1 : Math.max(0, Number(env.STATS_API_RETRIES || 3)),
    cooldownMs: isTest ? 50 : Math.max(5000, Number(env.STATS_API_RATE_LIMIT_COOLDOWN_MS || 30000)),
    historyLast: Math.max(5, Math.min(20, Number(env.STATS_API_HISTORY_LAST || 10))),
    cacheTtlSeconds: Math.max(60, Number(env.STATS_API_CACHE_TTL_SECONDS || 1800)),
    teamTtlSeconds: Math.max(600, Number(env.STATS_API_TEAM_CACHE_TTL_SECONDS || 43200)),
    goalStatsLookback: Math.max(2, Math.min(6, Number(env.STATS_API_GOAL_STATS_LOOKBACK || 4)))
  };
}

export function statsApiConfigured() { return Boolean(config().key); }

export function statsApiRateState() {
  const now = Date.now();
  const current = config();
  return {
    configured: Boolean(current.key),
    active,
    queued: queue.length,
    coolingDown: cooldownUntil > now,
    retryInMs: Math.max(0, cooldownUntil - now),
    requestsThisMinute: windowCount,
    requestsPerMinute: current.requestsPerMinute
  };
}

function resetWindow(now = Date.now()) {
  if (now - windowStarted >= 60000) {
    windowStarted = now;
    windowCount = 0;
  }
}

async function beforeRequest() {
  const current = config();
  for (;;) {
    const now = Date.now();
    resetWindow(now);
    if (cooldownUntil > now) { await sleep(Math.min(1000, cooldownUntil - now)); continue; }
    if (windowCount >= current.requestsPerMinute) {
      cooldownUntil = Math.max(cooldownUntil, windowStarted + 60000 + 100);
      continue;
    }
    const gap = current.minIntervalMs - (now - lastStart);
    if (gap > 0) { await sleep(gap); continue; }
    lastStart = Date.now();
    windowCount += 1;
    return;
  }
}

function drain() {
  const current = config();
  while (active < current.concurrency && queue.length) {
    const item = queue.shift();
    active += 1;
    Promise.resolve().then(async () => {
      await beforeRequest();
      return item.task();
    }).then(item.resolve, item.reject).finally(() => { active -= 1; drain(); });
  }
}

function schedule(task) {
  return new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); drain(); });
}

function apiErrorMessage(body) {
  if (!body || typeof body !== 'object') return '';
  return text(body.message || body.error || body.errors?.message || body.meta?.message);
}

function isRateLimited(status, body) {
  const message = apiErrorMessage(body).toLowerCase();
  return status === 429 || /too many requests|rate.?limit|requests per minute/.test(message);
}

async function fetchJson(path, params = {}) {
  const current = config();
  if (!current.key) throw Object.assign(new Error('STATS_API_KEY is not configured.'), { code: 'STATS_API_NOT_CONFIGURED' });
  const url = new URL(`${current.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params || {})) if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));

  let lastError;
  for (let attempt = 0; attempt <= current.retries; attempt += 1) {
    try {
      const result = await schedule(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), current.timeoutMs);
        try {
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${current.key}`, Accept: 'application/json' }
          });
          const body = await response.json().catch(() => ({}));
          if (isRateLimited(response.status, body)) {
            cooldownUntil = Math.max(cooldownUntil, Date.now() + current.cooldownMs);
            throw Object.assign(new Error(apiErrorMessage(body) || 'Stats API rate limit reached.'), { code: 'STATS_API_RATE_LIMIT', status: response.status || 429 });
          }
          if (!response.ok) throw Object.assign(new Error(apiErrorMessage(body) || `Stats API HTTP ${response.status}`), { status: response.status });
          return body;
        } finally { clearTimeout(timer); }
      });
      return result;
    } catch (error) {
      lastError = error;
      if (attempt >= current.retries || error?.status === 401 || error?.status === 403) break;
      const delay = error?.code === 'STATS_API_RATE_LIMIT' ? Math.max(500, Math.min(current.cooldownMs, 4000)) : Math.min(4000, 500 * 2 ** attempt);
      await sleep(delay);
    }
  }
  throw lastError || new Error('Stats API request failed.');
}

async function request(path, params = {}, ttlSeconds = null) {
  const current = config();
  const key = `${path}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k,v]) => [k,String(v)])).toString()}`;
  const now = Date.now();
  pruneStatsCache(now);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    cache.delete(key); cache.set(key, cached);
    return cached.value;
  }
  if (inflight.has(key)) return inflight.get(key);
  const task = fetchJson(path, params).then(value => {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, { value, expiresAt: Date.now() + 1000 * (ttlSeconds ?? current.cacheTtlSeconds) });
    pruneStatsCache();
    return value;
  }).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

function responseRows(body) { return Array.isArray(body?.data) ? body.data : Array.isArray(body?.response) ? body.response : []; }
function rowDate(row) { return Date.parse(row?.date || row?.start_time || row?.kickoff || row?.match_date || row?.scheduled || 0) || 0; }
function sideName(row, side) { return text(row?.[`${side}_team`]?.name || row?.[side]?.name || row?.teams?.[side]?.name); }
function sideId(row, side) { return row?.[`${side}_team`]?.id ?? row?.[side]?.team_id ?? row?.[side]?.id ?? row?.teams?.[side]?.id ?? null; }
function rowLeague(row) { return text(row?.league?.name || row?.competition?.name || row?.tournament?.name || row?.league_name || row?.competition_name); }
function rowCountry(row) { return text(row?.league?.country || row?.competition?.country || row?.country?.name || row?.country || row?.country_name); }
function fixtureLeague(fixture) { return text(fixture?.league?.name || fixture?.leagueName); }
function fixtureCountry(fixture) { return text(fixture?.league?.country || fixture?.country); }
function score(row, side) {
  const names = side === 'home'
    ? [row?.home_score, row?.home_goals, row?.score?.home, row?.scores?.home, row?.goals?.home, row?.home?.score, row?.home_team?.score]
    : [row?.away_score, row?.away_goals, row?.score?.away, row?.scores?.away, row?.goals?.away, row?.away?.score, row?.away_team?.score];
  return names.map(num).find(value => value !== null) ?? null;
}
function xgFromRow(row, side) {
  const candidates = side === 'home'
    ? [row?.home?.xg, row?.home_xg, row?.xg?.home, row?.expected_goals?.home]
    : [row?.away?.xg, row?.away_xg, row?.xg?.away, row?.expected_goals?.away];
  return candidates.map(num).find(value => value !== null) ?? null;
}

function tokens(value) { return new Set(normalizeName(value).split(/\s+/).filter(Boolean)); }
function similarity(a, b) {
  const left = normalizeName(a), right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;
  const A = tokens(left), B = tokens(right);
  const common = [...A].filter(token => B.has(token)).length;
  return common / Math.max(1, Math.max(A.size, B.size));
}

export async function getStatsApiMatchesForDate(date) {
  if (!statsApiConfigured()) return { configured: false, date, matches: [], warning: 'STATS_API_KEY is not configured.' };
  const matches = [];
  let page = 1;
  let pages = 1;
  do {
    const body = await request('/football/matches', { date_from: date, date_to: date, per_page: 100, page }, 300);
    matches.push(...responseRows(body));
    pages = Math.max(1, Number(body?.meta?.total_pages || 1));
    page += 1;
  } while (page <= pages && page <= 20);
  return { configured: true, date, matches, pages };
}

export function statsApiFixtureMatchScore(fixture, row) {
  const direct = (similarity(fixture?.home?.name, sideName(row, 'home')) + similarity(fixture?.away?.name, sideName(row, 'away'))) / 2;
  const reverse = (similarity(fixture?.home?.name, sideName(row, 'away')) + similarity(fixture?.away?.name, sideName(row, 'home'))) / 2;
  if (reverse > direct + 0.04) return 0;
  let score = direct * 0.80;
  const wantedLeague = fixtureLeague(fixture), actualLeague = rowLeague(row);
  score += wantedLeague && actualLeague ? similarity(wantedLeague, actualLeague) * 0.10 : 0.05;
  const wantedCountry = fixtureCountry(fixture), actualCountry = rowCountry(row);
  score += wantedCountry && actualCountry ? similarity(wantedCountry, actualCountry) * 0.04 : 0.02;
  const wantedKickoff = Date.parse(fixture?.kickoff || fixture?.date || 0);
  const actualKickoff = rowDate(row);
  if (Number.isFinite(wantedKickoff) && actualKickoff) {
    const minutes = Math.abs(wantedKickoff - actualKickoff) / 60000;
    if (minutes <= 5) score += 0.06;
    else if (minutes <= 30) score += 0.045;
    else if (minutes <= 120) score += 0.025;
    else if (minutes > 720) score -= 0.08;
  } else score += 0.03;
  return Math.max(0, Math.min(1, score));
}

export function matchStatsApiFixture(fixture, matches = []) {
  let best = null;
  for (const row of matches) {
    const score = statsApiFixtureMatchScore(fixture, row);
    if (!best || score > best.score) best = { row, score };
  }
  const threshold = Math.max(0.72, Math.min(0.95, Number(process.env.STATS_API_MAPPING_THRESHOLD || 0.82)));
  return best && best.score >= threshold ? best : null;
}

function perspective(row, teamId, teamName) {
  const hId = sideId(row, 'home'), aId = sideId(row, 'away');
  const hName = sideName(row, 'home'), aName = sideName(row, 'away');
  const isHome = teamId != null ? String(hId) === String(teamId) : similarity(teamName, hName) >= similarity(teamName, aName);
  const gf = score(row, isHome ? 'home' : 'away');
  const ga = score(row, isHome ? 'away' : 'home');
  if (gf === null || ga === null) return null;
  return {
    id: row?.match_id ?? row?.id ?? null,
    date: rowDate(row),
    gf, ga,
    outcome: gf > ga ? 'W' : gf === ga ? 'D' : 'L',
    xgFor: xgFromRow(row, isHome ? 'home' : 'away'),
    xgAgainst: xgFromRow(row, isHome ? 'away' : 'home'),
    venue: isHome ? 'H' : 'A'
  };
}

function streak(rows, fn) { let n = 0; for (const row of rows) { if (!fn(row)) break; n += 1; } return n; }
function average(values) { const good = values.filter(Number.isFinite); return good.length ? good.reduce((a,b)=>a+b,0)/good.length : null; }
function round(value, places = 2) { return Number.isFinite(value) ? Number(value.toFixed(places)) : null; }

export function buildStatsTeamProfile(rows = [], teamId = null, teamName = '') {
  const games = rows.map(row => perspective(row, teamId, teamName)).filter(Boolean).sort((a,b) => b.date - a.date).slice(0, config().historyLast);
  const played = games.length;
  const wins = games.filter(g => g.outcome === 'W').length;
  const draws = games.filter(g => g.outcome === 'D').length;
  const losses = games.filter(g => g.outcome === 'L').length;
  const gf = games.reduce((sum,g)=>sum+g.gf,0), ga = games.reduce((sum,g)=>sum+g.ga,0);
  const xgFor = average(games.map(g=>g.xgFor)), xgAgainst = average(games.map(g=>g.xgAgainst));
  const profile = {
    played,
    games,
    form: games.slice(0,5).map(g=>g.outcome),
    wins, draws, losses,
    ppg: played ? round((wins*3+draws)/played) : null,
    goalsForAvg: played ? round(gf/played) : null,
    goalsAgainstAvg: played ? round(ga/played) : null,
    goalDifferencePerGame: played ? round((gf-ga)/played) : null,
    winRate: played ? round(wins/played*100,1) : null,
    lossRate: played ? round(losses/played*100,1) : null,
    xgFor: round(xgFor), xgAgainst: round(xgAgainst), xgSamples: games.filter(g=>Number.isFinite(g.xgFor)).length,
    streaks: {
      wins: streak(games,g=>g.outcome==='W'), losses: streak(games,g=>g.outcome==='L'),
      unbeaten: streak(games,g=>g.outcome!=='L'), winless: streak(games,g=>g.outcome!=='W'),
      scoring: streak(games,g=>g.gf>0), conceding: streak(games,g=>g.ga>0),
      cleanSheets: streak(games,g=>g.ga===0), failedToScore: streak(games,g=>g.gf===0),
      over15: streak(games,g=>g.gf+g.ga>=2), over25: streak(games,g=>g.gf+g.ga>=3), over35: streak(games,g=>g.gf+g.ga>=4),
      under15: streak(games,g=>g.gf+g.ga<=1), under25: streak(games,g=>g.gf+g.ga<=2), under35: streak(games,g=>g.gf+g.ga<=3),
      teamOver05: streak(games,g=>g.gf>=1), teamOver15: streak(games,g=>g.gf>=2), teamOver25: streak(games,g=>g.gf>=3),
      teamUnder05: streak(games,g=>g.gf===0), teamUnder15: streak(games,g=>g.gf<=1), teamUnder25: streak(games,g=>g.gf<=2)
    }
  };
  const strengthRaw = (profile.ppg ?? 0) * 28 + (profile.winRate ?? 0) * 0.28 + Math.max(-1.5, Math.min(1.5, profile.goalDifferencePerGame ?? 0)) * 12 + Math.min(10, profile.streaks.unbeaten) * 2 - Math.min(10, profile.streaks.winless) * 1.5;
  profile.strengthScore = round(Math.max(0, Math.min(100, strengthRaw)), 1);
  profile.classification = profile.strengthScore >= 75 ? 'BEST_FORM' : profile.strengthScore >= 60 ? 'STRONG' : profile.strengthScore <= 28 ? 'WORST_FORM' : profile.strengthScore <= 42 ? 'WEAK' : 'MID';
  return profile;
}

export async function getStatsApiTeamHistory(teamId, teamName = '', beforeCutoff = null) {
  if (!statsApiConfigured() || teamId == null) return { profile: null, rows: [] };
  const cutoffMs = beforeCutoff ? Date.parse(beforeCutoff) : NaN;
  const params = { team_id: teamId, status: 'finished', per_page: config().historyLast };
  if (Number.isFinite(cutoffMs)) params.date_to = new Date(cutoffMs - 1000).toISOString().slice(0, 10);
  const body = await request('/football/matches', params, config().teamTtlSeconds);
  const rows = responseRows(body).filter(row => !Number.isFinite(cutoffMs) || !rowDate(row) || rowDate(row) < cutoffMs);
  return { rows, profile: buildStatsTeamProfile(rows, teamId, teamName) };
}

function deepFind(obj, regex, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  for (const [key, value] of Object.entries(obj)) {
    if (regex.test(String(key)) && num(value) !== null) out.push(num(value));
    if (value && typeof value === 'object') deepFind(value, regex, out);
  }
  return out;
}

function parseMatchAdvancedStats(body, teamSide = null) {
  const data = body?.data ?? body?.response ?? body;
  const overview = data?.overview || data?.stats || data;
  const expected = overview?.expected_goals?.all || overview?.expected_goals || data?.expected_goals || null;
  const shots = overview?.shots_on_target?.all || overview?.shots_on_goal?.all || overview?.shots_on_target || overview?.shots_on_goal || null;
  const result = {
    xgHome: num(expected?.home), xgAway: num(expected?.away),
    sotHome: num(shots?.home), sotAway: num(shots?.away)
  };
  if (result.sotHome === null || result.sotAway === null) {
    const home = deepFind(data, /home.*shots.*(target|goal)|shots.*(target|goal).*home/i)[0];
    const away = deepFind(data, /away.*shots.*(target|goal)|shots.*(target|goal).*away/i)[0];
    if (result.sotHome === null) result.sotHome = home ?? null;
    if (result.sotAway === null) result.sotAway = away ?? null;
  }
  return result;
}

export async function enrichStatsApiGoalProfile(teamHistory = {}, teamId = null, teamName = '') {
  const rows = (teamHistory.rows || []).map(row => ({ row, p: perspective(row, teamId, teamName) })).filter(x=>x.p).sort((a,b)=>b.p.date-a.p.date).slice(0, config().goalStatsLookback);
  const xgFor = [], xgAgainst = [], sotFor = [], sotAgainst = [];
  for (const item of rows) {
    let xf = item.p.xgFor, xa = item.p.xgAgainst, sf = null, sa = null;
    const matchId = item.p.id;
    if ((xf === null || xa === null || sf === null) && matchId != null) {
      try {
        const detail = await request(`/football/matches/${matchId}/stats`, {}, config().teamTtlSeconds);
        const parsed = parseMatchAdvancedStats(detail);
        const hId = sideId(item.row, 'home');
        const teamIsHome = teamId != null ? String(hId) === String(teamId) : item.p.venue === 'H';
        xf = xf ?? (teamIsHome ? parsed.xgHome : parsed.xgAway);
        xa = xa ?? (teamIsHome ? parsed.xgAway : parsed.xgHome);
        sf = teamIsHome ? parsed.sotHome : parsed.sotAway;
        sa = teamIsHome ? parsed.sotAway : parsed.sotHome;
      } catch (_) {}
    }
    if (Number.isFinite(xf)) xgFor.push(xf); if (Number.isFinite(xa)) xgAgainst.push(xa);
    if (Number.isFinite(sf)) sotFor.push(sf); if (Number.isFinite(sa)) sotAgainst.push(sa);
  }
  return {
    xgFor: round(average(xgFor)), xgAgainst: round(average(xgAgainst)), xgSamples: xgFor.length,
    sotFor: round(average(sotFor)), sotAgainst: round(average(sotAgainst)), sotSamples: sotFor.length
  };
}

export async function buildStatsApiFixtureEvidence(date, fixture) {
  const dateMatches = await getStatsApiMatchesForDate(date);
  const canonicalKey = canonicalFixtureKey(fixture);
  let matched = null;
  let mappingSource = 'FUZZY_MULTI_SIGNAL';
  try {
    const registry = await getProviderIdentityMappings({ provider: 'STATS_API', canonicalKey, limit: 5 });
    const saved = (registry.rows || []).find(row => row.verified && row.provider_entity_id);
    if (saved) {
      const row = (dateMatches.matches || []).find(item => String(item?.id ?? item?.match_id ?? '') === String(saved.provider_entity_id));
      if (row) {
        const rescored = statsApiFixtureMatchScore(fixture, row);
        if (rescored >= 0.78) { matched = { row, score: Math.max(rescored, Number(saved.mapping_confidence || 0)) }; mappingSource = 'VERIFIED_IDENTITY_REGISTRY'; }
      }
    }
  } catch (_) {}
  if (!matched) matched = matchStatsApiFixture(fixture, dateMatches.matches);
  if (!matched) return { configured: true, mapped: false, fixtureId: fixture?.id || null, home: null, away: null, mappingSource: null };
  const homeId = sideId(matched.row, 'home'), awayId = sideId(matched.row, 'away');
  const cutoff = fixture?.kickoff || `${date}T23:59:59Z`;
  const [homeHistory, awayHistory] = await Promise.all([
    getStatsApiTeamHistory(homeId, sideName(matched.row, 'home'), cutoff),
    getStatsApiTeamHistory(awayId, sideName(matched.row, 'away'), cutoff)
  ]);
  const statsMatchId = matched.row?.id ?? matched.row?.match_id ?? null;
  const verified = matched.score >= 0.90;
  const mappingRows = [
    providerFixtureIdentityRow({ fixture, provider: 'STATS_API', providerFixtureId: statsMatchId, confidence: matched.score, verified, metadata: { date, league: rowLeague(matched.row), country: rowCountry(matched.row) } }),
    ...providerTeamIdentityRows({ fixture, provider: 'STATS_API', homeProviderId: homeId, awayProviderId: awayId, confidence: matched.score, verified, metadata: { date } })
  ];
  upsertProviderIdentityMappings(mappingRows).catch(() => null);
  return {
    configured: true, mapped: true, mappingConfidence: matched.score, mappingSource,
    statsMatchId,
    homeId, awayId,
    home: homeHistory.profile,
    away: awayHistory.profile,
    _homeHistory: homeHistory,
    _awayHistory: awayHistory,
    asOf: cutoff
  };
}

export async function addGoalEvidence(evidence) {
  if (!evidence?.mapped) return evidence;
  const [homeGoal, awayGoal] = await Promise.all([
    enrichStatsApiGoalProfile(evidence._homeHistory, evidence.homeId, ''),
    enrichStatsApiGoalProfile(evidence._awayHistory, evidence.awayId, '')
  ]);
  return { ...evidence, homeGoal, awayGoal };
}
