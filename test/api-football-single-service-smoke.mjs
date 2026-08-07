import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const day = '2039-08-06';

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolvePort(port));
    });
    server.on('error', reject);
  });
}

function fixture({ id, status = 'NS', elapsed = null, homeGoals = null, awayGoals = null }) {
  return {
    fixture: { id, date: `${day}T16:00:00Z`, timezone: 'UTC', referee: null, venue: { id: 1, name: 'National Stadium' }, status: { short: status, elapsed } },
    league: { id: 39, name: 'Premier League', country: 'England', season: 2039, logo: 'https://img.test/league.png', flag: 'https://img.test/england.png' },
    teams: { home: { id: 1, name: 'Home United', logo: 'https://img.test/home.png' }, away: { id: 2, name: 'Away City', logo: 'https://img.test/away.png' } },
    goals: { home: homeGoals, away: awayGoals },
    score: { halftime: { home: homeGoals == null ? null : 1, away: awayGoals == null ? null : 0 }, fulltime: { home: homeGoals, away: awayGoals } }
  };
}

function oddsRow() {
  return {
    fixture: { id: 998877 },
    update: `${day}T12:00:00Z`,
    bookmakers: [{ id: 8, name: 'API Book', bets: [
      { name: 'Match Winner', values: [{ value: 'Home', odd: '1.72' }, { value: 'Draw', odd: '3.55' }, { value: 'Away', odd: '4.60' }] },
      { name: 'Double Chance', values: [{ value: 'Home/Draw', odd: '1.18' }, { value: 'Home/Away', odd: '1.25' }, { value: 'Draw/Away', odd: '2.00' }] },
      { name: 'Goals Over/Under', values: [{ value: 'Over 1.5', odd: '1.22' }, { value: 'Over 2.5', odd: '1.66' }, { value: 'Under 2.5', odd: '2.08' }, { value: 'Under 3.5', odd: '1.42' }] },
      { name: 'Both Teams To Score', values: [{ value: 'Yes', odd: '1.73' }, { value: 'No', odd: '1.95' }] }
    ] }]
  };
}

async function waitJson(url, timeout = 20000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      const bodyText = await response.text();
      if (response.ok) return { response, body: bodyText ? JSON.parse(bodyText) : null };
      lastError = new Error(`${response.status}: ${bodyText}`);
    } catch (error) { lastError = error; }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

const apiPort = await freePort();
const webPort = await freePort();
const scheduled = fixture({ id: 998877 });
const live = fixture({ id: 998877, status: '2H', elapsed: 67, homeGoals: 2, awayGoals: 1 });
const finished = fixture({ id: 998878, status: 'FT', elapsed: 90, homeGoals: 3, awayGoals: 1 });

const api = http.createServer((req, res) => {
  assert.equal(req.headers['x-apisports-key'], 'single-service-key');
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.writeHead(200, { 'content-type': 'application/json' });
  const send = (response, paging = { current: 1, total: 1 }) => res.end(JSON.stringify({ response, errors: [], paging }));
  if (url.pathname === '/fixtures' && url.searchParams.get('date') === day) return send([scheduled, finished]);
  if (url.pathname === '/fixtures' && url.searchParams.get('live') === 'all') return send([live]);
  if (url.pathname === '/odds') return send([oddsRow()]);
  if (url.pathname === '/fixtures/events') return send([{ time: { elapsed: 67 }, team: { id: 1, name: 'Home United' }, player: { id: 10, name: 'Player One' }, type: 'Goal', detail: 'Normal Goal' }]);
  if (url.pathname === '/fixtures' && url.searchParams.has('team')) return send([]);
  if (url.pathname === '/standings' || url.pathname === '/fixtures/headtohead' || url.pathname === '/predictions' || url.pathname === '/injuries' || url.pathname === '/fixtures/statistics' || url.pathname === '/fixtures/lineups' || url.pathname === '/fixtures/players') return send([]);
  if (url.pathname === '/teams/statistics') return res.end(JSON.stringify({ response: {}, errors: [] }));
  if (url.pathname === '/teams') return send([{ team: { id: 1, name: 'Home United', logo: 'https://img.test/home.png' }, venue: { country: 'England' } }]);
  return send([]);
});

let web;
try {
  api.listen(apiPort, '127.0.0.1');
  await once(api, 'listening');

  web = spawn(process.execPath, ['apps/web/src/server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(webPort),
      API_FOOTBALL_KEY: 'single-service-key',
      API_FOOTBALL_BASE_URL: `http://127.0.0.1:${apiPort}/`,
      API_FOOTBALL_KEY_HEADER: 'x-apisports-key',
      API_FOOTBALL_RETRIES: '0',
      API_FOOTBALL_REQUEST_MIN_INTERVAL_MS: '0',
      API_FOOTBALL_MAX_ODDS_PAGES: '0',
      AUTO_SETTLEMENT_ENABLED: 'false',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  web.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(`[single-service] ${chunk}`); });

  const health = await waitJson(`http://127.0.0.1:${webPort}/api/health`);
  assert.equal(health.body.version, '5.0.20');
  assert.equal(health.body.configured.apiFootball, true);
  assert.deepEqual(health.body.engines, ['MARKET_ROUTE', 'PPG_ROUTE', 'APEX_INTELLIGENCE', 'CONVERGENCE_ROUTE', 'MOMENTUM_STREAK', 'STREAK_VALUE', 'HTFT_MOMENTUM', 'ZEUS_SUPERVISOR']);
  assert.equal(health.body.sourceRoles.fixtures, 'API_FOOTBALL');
  assert.equal(health.body.sourceRoles.streakIntelligence, 'STATS_API');

  const config = await waitJson(`http://127.0.0.1:${webPort}/api/config`);
  assert.equal(config.body.dataSources.fixtures, 'API-Football');
  assert.equal(config.body.dataSources.streaksAndXg, 'Stats API');
  assert.equal(config.body.fixtureCoverage.applicationCap, null);

  const fixtures = await waitJson(`http://127.0.0.1:${webPort}/api/fixtures?date=${day}`);
  assert.equal(fixtures.body.source, 'API_FOOTBALL');
  assert.equal(fixtures.body.fixtures.length, 2);
  assert.equal(fixtures.body.oddsPending, true);
  let pricedFixtures = fixtures;
  const oddsDeadline = Date.now() + 5000;
  while (Date.now() < oddsDeadline) {
    const current = pricedFixtures.body.fixtures.find(row => row.id === '998877');
    if (Number(current?.odds?.homeWin || 0) > 1) break;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
    pricedFixtures = await waitJson(`http://127.0.0.1:${webPort}/api/fixtures?date=${day}&odds_refresh=${Date.now()}`);
  }
  const first = pricedFixtures.body.fixtures.find(row => row.id === '998877');
  assert.equal(first.odds.homeWin, 1.72);
  assert.equal(first.odds.over25, 1.66);
  assert.equal(first.odds.bttsYes, 1.73);
  assert.equal(first.home.logo, 'https://img.test/home.png');

  const livePayload = await waitJson(`http://127.0.0.1:${webPort}/api/live?date=${day}`);
  assert.equal(livePayload.body.source, 'API_FOOTBALL');
  assert.equal(livePayload.body.fixtures[0].minute, 67);
  assert.equal(livePayload.body.fixtures[0].score.home, 2);

  const results = await waitJson(`http://127.0.0.1:${webPort}/api/results?date=${day}`);
  assert.equal(results.body.source, 'API_FOOTBALL');
  assert.equal(results.body.fixtures.length, 1);
  assert.equal(results.body.fixtures[0].status, 'FT');
  assert.equal(results.body.fixtures[0].score.home, 3);

  const events = await waitJson(`http://127.0.0.1:${webPort}/api/live-events?fixture_id=998877`);
  assert.equal(events.body.events[0].type, 'Goal');
  assert.equal(events.body.events[0].minute, 67);

  console.log(JSON.stringify({
    ok: true,
    deployment: 'ONE_RENDER_SERVICE',
    provider: 'API_FOOTBALL',
    version: health.body.version,
    engines: health.body.engines,
    fixtures: fixtures.body.fixtures.length,
    live: livePayload.body.fixtures.length,
    results: results.body.fixtures.length,
    events: events.body.events.length,
    stderr: stderr || null
  }, null, 2));
} finally {
  if (web && !web.killed) web.kill('SIGTERM');
  api.close();
}
