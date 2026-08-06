import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { enrichApiFootballStatsBoard } from '../src/lib/apiFootball.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function listen(handler) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
    server.on('error', reject);
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitFor(url, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      last = new Error(String(response.status));
    } catch (error) { last = error; }
    await pause(100);
  }
  throw last || new Error('timeout');
}

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function apiRow({ id, date, leagueId, season, homeId, awayId, home, away, status = 'FT', hg = 0, ag = 0 }) {
  return {
    fixture: { id, date, timezone: 'UTC', venue: { id: 1, name: 'Arena' }, status: { short: status, elapsed: null } },
    league: { id: leagueId, name: `League ${leagueId}`, country: 'Ghana', season, logo: `https://img/${leagueId}.png` },
    teams: { home: { id: homeId, name: home, logo: `https://img/${homeId}.png` }, away: { id: awayId, name: away, logo: `https://img/${awayId}.png` } },
    goals: { home: hg, away: ag },
    score: { halftime: { home: 0, away: 0 }, fulltime: { home: hg, away: ag } }
  };
}

function sourceFixture({ id, kickoff, leagueId, season, homeId, awayId, home, away }) {
  return {
    id: String(id), sourceId: String(id), kickoff, status: 'NS',
    league: { id: leagueId, season, name: `League ${leagueId}`, country: 'Ghana' },
    home: { id: homeId, name: home, logo: `https://img/${homeId}.png` },
    away: { id: awayId, name: away, logo: `https://img/${awayId}.png` },
    odds: { homeWin: 1.9, draw: 2.9, awayWin: 4.2, under25: 1.75 },
    availableMarketCount: 4
  };
}

function venuePool({ leagueId, season, homeId, awayId, home, away, prefix = 10000 }) {
  const rows = [];
  for (let i = 0; i < 5; i += 1) {
    rows.push(apiRow({ id: prefix + i, date: `2020-0${i + 1}-01T12:00:00Z`, leagueId, season, homeId, awayId: 8000 + i, home, away: `Home Opp ${i}`, hg: 0, ag: 1 }));
    rows.push(apiRow({ id: prefix + 100 + i, date: `2020-0${i + 1}-02T12:00:00Z`, leagueId, season, homeId: 9000 + i, awayId, home: `Away Opp ${i}`, away, hg: 1, ag: 0 }));
  }
  return rows;
}

function odds(id) {
  return {
    fixture: { id }, update: '2040-06-01T10:00:00Z', bookmakers: [{ id: 8, name: 'Book', bets: [
      { name: 'Match Winner', values: [{ value: 'Home', odd: '1.90' }, { value: 'Draw', odd: '2.90' }, { value: 'Away', odd: '4.20' }] },
      { name: 'Goals Over/Under', values: [{ value: 'Under 2.5', odd: '1.75' }, { value: 'Over 2.5', odd: '2.05' }] }
    ] }]
  };
}

test('same-league fixtures share one league history request with no team fallback', async t => {
  let leagueCalls = 0;
  let teamCalls = 0;
  const pool = [
    ...venuePool({ leagueId: 777, season: 2040, homeId: 101, awayId: 202, home: 'Alpha', away: 'Beta', prefix: 10000 }),
    ...venuePool({ leagueId: 777, season: 2040, homeId: 303, awayId: 404, home: 'Gamma', away: 'Delta', prefix: 11000 })
  ];
  const { server, base } = await listen((req, res) => {
    const url = new URL(req.url, base);
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/fixtures' && url.searchParams.get('league') === '777') {
      leagueCalls += 1;
      return res.end(JSON.stringify({ response: pool, errors: [], paging: { current: 1, total: 1 } }));
    }
    if (url.pathname === '/fixtures' && url.searchParams.has('team')) teamCalls += 1;
    return res.end(JSON.stringify({ response: [], errors: [], paging: { current: 1, total: 1 } }));
  });
  t.after(() => server.close());

  const keys = ['API_FOOTBALL_KEY','API_FOOTBALL_BASE_URL','API_FOOTBALL_KEY_HEADER','API_FOOTBALL_RETRIES','API_FOOTBALL_REQUEST_MIN_INTERVAL_MS','API_FOOTBALL_ENGINE_LEAGUE_HISTORY','API_FOOTBALL_ENGINE_HISTORY_TTL_SECONDS'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    API_FOOTBALL_KEY: 'fast-key', API_FOOTBALL_BASE_URL: base, API_FOOTBALL_KEY_HEADER: 'x-apisports-key',
    API_FOOTBALL_RETRIES: '0', API_FOOTBALL_REQUEST_MIN_INTERVAL_MS: '0', API_FOOTBALL_ENGINE_LEAGUE_HISTORY: 'true', API_FOOTBALL_ENGINE_HISTORY_TTL_SECONDS: '21600'
  });
  t.after(() => restoreEnv(previous));

  const kickoff = '2040-06-15T18:00:00Z';
  const fixtures = [
    sourceFixture({ id: 501, kickoff, leagueId: 777, season: 2040, homeId: 101, awayId: 202, home: 'Alpha', away: 'Beta' }),
    sourceFixture({ id: 502, kickoff, leagueId: 777, season: 2040, homeId: 303, awayId: 404, home: 'Gamma', away: 'Delta' })
  ];
  const enriched = await enrichApiFootballStatsBoard('2040-06-15', fixtures);
  assert.equal(enriched.fixtures.length, 2);
  assert.equal(leagueCalls, 1);
  assert.equal(teamCalls, 0);
  assert.ok(enriched.fixtures.every(row => row.enrichment.matched));
});

test('a qualified prediction is published while a slower fixture is still processing', async t => {
  const port = await freePort();
  const apiPort = await freePort();
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const season = new Date().getUTCFullYear();
  const first = apiRow({ id: 6101, date: `${date}T17:00:00Z`, leagueId: 701, season, homeId: 101, awayId: 202, home: 'Alpha', away: 'Beta', status: 'NS', hg: null, ag: null });
  const second = apiRow({ id: 6102, date: `${date}T19:00:00Z`, leagueId: 702, season, homeId: 303, awayId: 404, home: 'Gamma', away: 'Delta', status: 'NS', hg: null, ag: null });
  const pool1 = venuePool({ leagueId: 701, season, homeId: 101, awayId: 202, home: 'Alpha', away: 'Beta', prefix: 12000 });
  const pool2 = venuePool({ leagueId: 702, season, homeId: 303, awayId: 404, home: 'Gamma', away: 'Delta', prefix: 13000 });

  const api = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader('content-type', 'application/json');
    const send = response => res.end(JSON.stringify({ response, errors: [], paging: { current: 1, total: 1 } }));
    if (url.pathname === '/fixtures' && url.searchParams.get('date') === date) return send([first, second]);
    if (url.pathname === '/odds') return send([odds(6101), odds(6102)]);
    if (url.pathname === '/fixtures' && url.searchParams.get('league') === '701') return send(pool1);
    if (url.pathname === '/fixtures' && url.searchParams.get('league') === '702') { await pause(2500); return send(pool2); }
    return send([]);
  });
  await new Promise((resolve, reject) => { api.listen(apiPort, '127.0.0.1', resolve); api.on('error', reject); });
  t.after(() => api.close());

  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env, PORT: String(port), NODE_ENV: 'test', AUTO_SETTLEMENT_ENABLED: 'false',
      API_FOOTBALL_KEY: 'key', API_FOOTBALL_BASE_URL: `http://127.0.0.1:${apiPort}/`, API_FOOTBALL_RETRIES: '0',
      API_FOOTBALL_REQUEST_MIN_INTERVAL_MS: '0', API_FOOTBALL_ENRICH_CONCURRENCY: '2', API_FOOTBALL_ENGINE_LEAGUE_HISTORY: 'true',
      SUPABASE_URL: '', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill('SIGTERM'));
  await waitFor(`http://127.0.0.1:${port}/api/health`);

  let partial = null;
  const end = Date.now() + 2200;
  while (Date.now() < end) {
    const response = await fetch(`http://127.0.0.1:${port}/api/apex-intelligence-board?date=${date}`);
    const body = await response.json();
    if (!body.complete && (body.qualified || []).length >= 1 && Number(body.progress?.processed || 0) >= 1) {
      partial = body;
      break;
    }
    await pause(100);
  }
  assert.ok(partial, 'expected a partial qualified prediction before the slow fixture completed');
  assert.equal(partial.complete, false);
  assert.equal(partial.qualified[0].engine.selection.market, 'UNDER_2_5');
});
