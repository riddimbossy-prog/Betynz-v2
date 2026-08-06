import { cacheGet, cacheSet, canonical, env, integer, publicError, sleep, stripProviderId, text, validDay } from './core.mjs';
import { collectEventsFromObject, publicFixture } from './parser.mjs';

const DEFAULTS = {
  upcoming: 'https://www.sportybet.com/api/{country}/factsCenter/pcUpcomingEvents?sportId=sr%3Asport%3A1&marketId=1&pageNum={page}&pageSize={page_size}',
  live: 'https://www.sportybet.com/api/{country}/factsCenter/pcLiveEvents?sportId=sr%3Asport%3A1&marketId=1&pageNum={page}&pageSize={page_size}',
  results: 'https://www.sportybet.com/api/{country}/factsCenter/pcResults?sportId=sr%3Asport%3A1&date={date}&pageNum={page}&pageSize={page_size}',
  detail: 'https://www.sportybet.com/api/{country}/factsCenter/pcEvent?eventId={event_id}'
};

const sourceStatus = {
  upcoming: { lastAttemptAt: null, lastSuccessAt: null, lastError: null, count: 0 },
  live: { lastAttemptAt: null, lastSuccessAt: null, lastError: null, count: 0 },
  results: { lastAttemptAt: null, lastSuccessAt: null, lastError: null, count: 0 },
  detail: { lastAttemptAt: null, lastSuccessAt: null, lastError: null, count: 0 }
};

const cleanCountry = () => text(env('SPORTYBET_COUNTRY', 'gh')).toLowerCase().replace(/[^a-z]/g, '').slice(0, 3) || 'gh';
const pageSize = () => Math.max(20, Math.min(100, integer(env('SPORTYBET_PAGE_SIZE', '100'), 100)));
const maxPages = () => Math.max(1, Math.min(50, integer(env('SPORTYBET_MAX_PAGES', '10'), 10)));
const timeoutMs = () => Math.max(3000, Math.min(60000, integer(env('SPORTYBET_TIMEOUT_MS', '20000'), 20000)));
const ttl = kind => kind === 'results' ? integer(env('SPORTYBET_RESULTS_CACHE_TTL_SECONDS', '300'), 300) : integer(env('SPORTYBET_CACHE_TTL_SECONDS', '60'), 60);

function templateFor(kind) {
  const name = {
    upcoming: 'SPORTYBET_PUBLIC_UPCOMING_URL',
    live: 'SPORTYBET_PUBLIC_LIVE_URL',
    results: 'SPORTYBET_PUBLIC_RESULTS_URL',
    detail: 'SPORTYBET_PUBLIC_EVENT_DETAIL_URL'
  }[kind];
  return text(env(name, DEFAULTS[kind]));
}

function renderTemplate(template, vars = {}) {
  return String(template || '').replace(/\{([a-z_]+)\}/gi, (_, key) => encodeURIComponent(String(vars[key] ?? '')));
}

function permittedUrl(raw) {
  const url = new URL(raw);
  const testHostAllowed = /^(1|true|yes)$/i.test(env('SPORTYBET_ALLOW_TEST_HOST', 'false'));
  const isLocal = ['127.0.0.1','localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(testHostAllowed && isLocal)) throw new Error('SportyBet feed must use HTTPS');
  const host = url.hostname.toLowerCase();
  if (!(testHostAllowed && isLocal) && host !== 'sportybet.com' && !host.endsWith('.sportybet.com')) throw new Error('Only sportybet.com upstream hosts are permitted');
  return url;
}

function headers() {
  const country = cleanCountry();
  return {
    accept: 'application/json, text/plain, */*',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    referer: `https://www.sportybet.com/${country}/`,
    origin: 'https://www.sportybet.com',
    'accept-language': 'en-GB,en;q=0.9',
    'cache-control': 'no-cache'
  };
}

function parsePayload(raw, contentType = '') {
  const body = String(raw || '').trim();
  if (!body) throw new Error('SportyBet returned an empty response');
  if (/json/i.test(contentType) || /^[\[{]/.test(body)) {
    try { return JSON.parse(body); } catch {}
  }
  const candidates = [];
  for (const match of body.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { candidates.push(JSON.parse(match[1])); } catch {}
  }
  for (const marker of ['__NEXT_DATA__','__INITIAL_STATE__','__NUXT__']) {
    const index = body.indexOf(marker);
    if (index < 0) continue;
    const start = body.slice(index).search(/[\[{]/);
    if (start < 0) continue;
    const fragment = balanced(body, index + start);
    if (fragment) { try { candidates.push(JSON.parse(fragment)); } catch {} }
  }
  if (candidates.length) return { candidates };
  throw new Error('SportyBet response was not readable JSON');
}

function balanced(source, start) {
  const open = source[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;
  let depth = 0, quote = null, escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

async function fetchPayload(url) {
  const target = permittedUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(target, { headers: headers(), redirect: 'follow', signal: controller.signal });
    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(`SportyBet returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return parsePayload(raw, response.headers.get('content-type') || '');
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('SportyBet request timed out');
    throw error;
  } finally { clearTimeout(timer); }
}

function mergeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.id);
    if (!current) { map.set(row.id, row); continue; }
    const better = row.market_count > current.market_count ? row : current;
    map.set(row.id, {
      ...current,
      ...better,
      score: row.score || current.score,
      minute: row.minute ?? current.minute,
      status: row.status !== 'NS' ? row.status : current.status,
      markets: better.markets,
      odds: { ...(current.odds || {}), ...(row.odds || {}) },
      events: [...(current.events || []), ...(row.events || [])]
    });
  }
  return [...map.values()].sort((a,b) => (a.start_time || 0) - (b.start_time || 0));
}

function eventsFromPayload(payload) {
  if (Array.isArray(payload?.candidates)) return mergeRows(payload.candidates.flatMap(collectEventsFromObject));
  return collectEventsFromObject(payload);
}

async function fetchPaged(kind, vars = {}, { force = false } = {}) {
  const key = `${kind}:${JSON.stringify(vars)}`;
  if (!force) {
    const hit = cacheGet(key);
    if (hit) return { ...hit, cache: 'HIT' };
  }
  const state = sourceStatus[kind];
  state.lastAttemptAt = new Date().toISOString();
  state.lastError = null;
  const rows = [];
  const audits = [];
  try {
    for (let page = 1; page <= maxPages(); page += 1) {
      const url = renderTemplate(templateFor(kind), { country: cleanCountry(), page, page_size: pageSize(), ...vars });
      const payload = await fetchPayload(url);
      const batch = eventsFromPayload(payload);
      audits.push({ page, count: batch.length });
      rows.push(...batch);
      if (!batch.length || batch.length < pageSize()) break;
      await sleep(120);
    }
    const events = mergeRows(rows);
    state.lastSuccessAt = new Date().toISOString();
    state.count = events.length;
    const response = { source: 'SPORTYBET_CUSTOM_API', kind, events, audits, generatedAt: new Date().toISOString(), cache: 'MISS' };
    cacheSet(key, response, ttl(kind));
    return response;
  } catch (error) {
    state.lastError = publicError(error);
    state.count = 0;
    throw error;
  }
}

export async function upcoming({ date, from, days = 1, force = false } = {}) {
  const safeDays = Math.max(1, Math.min(14, integer(days, 1)));
  const start = validDay(from) ? from : validDay(date) ? date : new Date().toISOString().slice(0,10);
  const feed = await fetchPaged('upcoming', { days: safeDays }, { force });
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = startMs + safeDays * 86400000;
  const events = feed.events.filter(row => !row.start_time || (row.start_time >= startMs && row.start_time < endMs));
  return { ...feed, date: validDay(date) ? date : null, from: start, days: safeDays, events };
}

export async function live({ date, force = false } = {}) {
  const feed = await fetchPaged('live', { date: validDay(date) ? date : new Date().toISOString().slice(0,10) }, { force });
  const events = feed.events.filter(row => /^(LIVE|1H|2H|HT|AET|PEN)$/i.test(row.status));
  return { ...feed, events };
}

export async function results({ date, force = false } = {}) {
  const day = validDay(date) ? date : new Date(Date.now() - 86400000).toISOString().slice(0,10);
  const feed = await fetchPaged('results', { date: day }, { force });
  const events = feed.events.filter(row => !row.kickoff || row.kickoff.slice(0,10) === day || /^(FT|AET|PEN|CANC|PST)$/i.test(row.status));
  return { ...feed, date: day, events };
}

export async function fixtureDetail(eventId, { date, force = false } = {}) {
  const id = stripProviderId(eventId);
  if (!id) return null;
  const key = `detail:${id}`;
  if (!force) {
    const hit = cacheGet(key);
    if (hit) return hit;
  }
  const state = sourceStatus.detail;
  state.lastAttemptAt = new Date().toISOString();
  try {
    const template = templateFor('detail');
    if (template) {
      const payload = await fetchPayload(renderTemplate(template, { country: cleanCountry(), event_id: id, date: validDay(date) ? date : '' }));
      const rows = eventsFromPayload(payload);
      const direct = rows.find(row => stripProviderId(row.id) === id) || rows[0] || null;
      if (direct) {
        state.lastSuccessAt = new Date().toISOString(); state.lastError = null; state.count = 1;
        cacheSet(key, direct, ttl('upcoming'));
        return direct;
      }
    }
  } catch (error) { state.lastError = publicError(error); }
  const day = validDay(date) ? date : new Date().toISOString().slice(0,10);
  const sources = await Promise.allSettled([upcoming({ date: day }), live({ date: day }), results({ date: day })]);
  const rows = sources.flatMap(item => item.status === 'fulfilled' ? item.value.events : []);
  const match = rows.find(row => stripProviderId(row.id) === id) || null;
  if (match) cacheSet(key, match, ttl('upcoming'));
  return match;
}

export async function teamHistory({ teamName, venue = '', beforeDate, limit = 10 } = {}) {
  const wanted = canonical(teamName);
  if (!wanted) return { team: teamName, venue, matches: [], count: 0, source: 'SPORTYBET_CUSTOM_API' };
  const safeLimit = Math.max(1, Math.min(20, integer(limit, 10)));
  const lookback = Math.max(7, Math.min(365, integer(env('SPORTYBET_HISTORY_LOOKBACK_DAYS', '120'), 120)));
  const maxRequests = Math.max(3, Math.min(90, integer(env('SPORTYBET_HISTORY_MAX_REQUEST_DAYS', '45'), 45)));
  const anchor = validDay(beforeDate) ? Date.parse(`${beforeDate}T00:00:00Z`) : Date.now();
  const matches = [];
  let requests = 0;
  for (let offset = 1; offset <= lookback && requests < maxRequests && matches.length < safeLimit; offset += 1) {
    const date = new Date(anchor - offset * 86400000).toISOString().slice(0,10);
    let feed;
    try { feed = await results({ date }); requests += 1; } catch { continue; }
    for (const row of feed.events) {
      const isHome = canonical(row.home_team) === wanted;
      const isAway = canonical(row.away_team) === wanted;
      if (!isHome && !isAway) continue;
      if (venue === 'home' && !isHome) continue;
      if (venue === 'away' && !isAway) continue;
      matches.push(publicFixture(row, { includeMarkets: false }));
      if (matches.length >= safeLimit) break;
    }
  }
  return { team: teamName, venue, matches, count: matches.length, requests, source: 'SPORTYBET_CUSTOM_API' };
}

export function streaksFromHistory(history) {
  const rows = history?.matches || [];
  const wanted = canonical(history?.team);
  const values = [];
  for (const match of rows) {
    const isHome = canonical(match.home?.name) === wanted;
    const scored = Number(isHome ? match.score?.home : match.score?.away);
    const conceded = Number(isHome ? match.score?.away : match.score?.home);
    if (!Number.isFinite(scored) || !Number.isFinite(conceded)) continue;
    values.push({ result: scored > conceded ? 'W' : scored === conceded ? 'D' : 'L', scored, conceded, total: scored + conceded });
  }
  const streak = predicate => { let n = 0; for (const row of values) { if (!predicate(row)) break; n += 1; } return n; };
  return {
    team: history?.team,
    venue: history?.venue,
    sample: values.length,
    current: {
      wins: streak(row => row.result === 'W'),
      unbeaten: streak(row => row.result !== 'L'),
      losses: streak(row => row.result === 'L'),
      winless: streak(row => row.result !== 'W'),
      scoring: streak(row => row.scored > 0),
      cleanSheets: streak(row => row.conceded === 0),
      over15: streak(row => row.total > 1.5),
      over25: streak(row => row.total > 2.5),
      under35: streak(row => row.total < 3.5),
      btts: streak(row => row.scored > 0 && row.conceded > 0)
    },
    source: 'SPORTYBET_CUSTOM_API'
  };
}

export async function competitionStats({ league, country, beforeDate, days = 30 } = {}) {
  const wantedLeague = canonical(league);
  const wantedCountry = canonical(country);
  const anchor = validDay(beforeDate) ? Date.parse(`${beforeDate}T00:00:00Z`) : Date.now();
  const sample = [];
  for (let offset = 1; offset <= Math.max(1, Math.min(60, integer(days, 30))); offset += 1) {
    const date = new Date(anchor - offset * 86400000).toISOString().slice(0,10);
    let feed;
    try { feed = await results({ date }); } catch { continue; }
    for (const row of feed.events) {
      if (wantedLeague && canonical(row.league) !== wantedLeague) continue;
      if (wantedCountry && canonical(row.country) !== wantedCountry) continue;
      if (row.score?.home === null || row.score?.away === null) continue;
      sample.push(row);
    }
    if (sample.length >= 100) break;
  }
  const totals = sample.map(row => Number(row.score.home) + Number(row.score.away));
  const pct = predicate => sample.length ? Number((sample.filter(predicate).length / sample.length * 100).toFixed(1)) : null;
  return {
    league, country, matches: sample.length,
    averageGoals: sample.length ? Number((totals.reduce((a,b)=>a+b,0) / sample.length).toFixed(2)) : null,
    over15: pct(row => Number(row.score.home) + Number(row.score.away) > 1.5),
    over25: pct(row => Number(row.score.home) + Number(row.score.away) > 2.5),
    under35: pct(row => Number(row.score.home) + Number(row.score.away) < 3.5),
    btts: pct(row => Number(row.score.home) > 0 && Number(row.score.away) > 0),
    source: 'SPORTYBET_CUSTOM_API'
  };
}

export function getSourceStatus() {
  return JSON.parse(JSON.stringify({
    source: 'SPORTYBET_CUSTOM_API',
    country: cleanCountry(),
    providers: { sportybet: true, parseBot: false, apiFootball: false, oddsApi: false, betExplorer: false },
    feeds: sourceStatus
  }));
}
