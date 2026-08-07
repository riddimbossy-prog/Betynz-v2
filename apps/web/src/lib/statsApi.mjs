import { normalizeName } from './utils.mjs';

const cache = new Map();
const inflight = new Map();
const queue = [];
let active = 0;
let lastStart = 0;
let windowStarted = Date.now();
let windowCount = 0;
let cooldownUntil = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (inflight.has(key)) return inflight.get(key);
  const task = fetchJson(path, params).then(value => {
    cache.set(key, { value, expiresAt: Date.now() + 1000 * (ttlSeconds ?? current.cacheTtlSeconds) });
    return value;
  }).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

function responseRows(body) { return Array.isArray(body?.data) ? body.data : Array.isArray(body?.response) ? body.response : []; }
function rowDate(row) { return Date.parse(row?.date || row?.start_time || row?.kickoff || row?.match_date || row?.scheduled || 0) || 0; }
function sideName(row, side) { return text(row?.[`${side}_team`]?.name || row?.[side]?.name || row?.teams?.[side]?.name); }
function sideId(row, side) { return row?.[`${side}_team`]?.id ?? row?.[side]?.team_id ?? row?.[side]?.id ?? row?.teams?.[side]?.id ?? null; }
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

export function matchStatsApiFixture(fixture, matches = []) {
  let best = null;
  for (const row of matches) {
    const direct = (similarity(fixture?.home?.name, sideName(row, 'home')) + similarity(fixture?.away?.name, sideName(row, 'away'))) / 2;
    const reverse = (similarity(fixture?.home?.name, sideName(row, 'away')) + similarity(fixture?.away?.name, sideName(row, 'home'))) / 2;
    if (reverse > direct) continue;
    if (!best || direct > best.score) best = { row, score: direct };
  }
  return best && best.score >= Number(process.env.STATS_API_MAPPING_THRESHOLD || 0.72) ? best : null;
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

export async function getStatsApiTeamHistory(teamId, teamName = '') {
  if (!statsApiConfigured() || teamId == null) return { profile: null, rows: [] };
  const body = await request('/football/matches', { team_id: teamId, status: 'finished', per_page: config().historyLast }, config().teamTtlSeconds);
  const rows = responseRows(body);
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
  const matched = matchStatsApiFixture(fixture, dateMatches.matches);
  if (!matched) return { configured: true, mapped: false, fixtureId: fixture?.id || null, home: null, away: null };
  const homeId = sideId(matched.row, 'home'), awayId = sideId(matched.row, 'away');
  const [homeHistory, awayHistory] = await Promise.all([
    getStatsApiTeamHistory(homeId, sideName(matched.row, 'home')),
    getStatsApiTeamHistory(awayId, sideName(matched.row, 'away'))
  ]);
  return {
    configured: true, mapped: true, mappingConfidence: matched.score,
    statsMatchId: matched.row?.id ?? matched.row?.match_id ?? null,
    homeId, awayId,
    home: homeHistory.profile,
    away: awayHistory.profile,
    _homeHistory: homeHistory,
    _awayHistory: awayHistory
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
