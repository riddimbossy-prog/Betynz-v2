import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { createServer } from 'node:http';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

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

async function waitFor(url, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

test('full platform keeps all boards, consensus, calibration and SportyBet API endpoints', async () => {
  const server = await read('src/server.mjs');
  for (const route of [
    '/api/fixtures-week','/api/market-route-board','/api/ppg-route-board','/api/convergence-route-board',
    '/api/match-intelligence','/api/live','/api/proof','/api/performance','/api/odds-movement','/api/leagues',
    '/api/qualified-picks','/api/consensus-picks','/api/admin/engine-audit','/api/admin/calibration'
  ]) assert.match(server, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(server, /isSrlFixture/);
  assert.match(server, /getApiFootballIntelligence/);
  assert.match(server, /enrichApiFootballStatsBoard/);
  assert.match(server, /fetchDataApiFixtures/);
});

test('responsive interface includes phone, Z Fold, tablet, desktop and reduced-motion rules', async () => {
  const css = await read('public/styles.css');
  for (const pattern of [
    /@media\s*\(max-width:\s*380px\)/,
    /@media\s*\(min-width:\s*600px\)\s*and\s*\(max-width:\s*760px\)/,
    /@media\s*\(max-width:\s*560px\)/,
    /@media\s*\(max-width:\s*900px\)/,
    /@media\s*\(min-width:\s*1600px\)/,
    /prefers-reduced-motion/
  ]) assert.match(css, pattern);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /match-intel-dialog/);
  assert.match(css, /100dvw|100dvh/);
});

test('production server boots with SportyBet authority and optional API-Football enrichment', async t => {
  const port = await freePort();
  const feedPort = await freePort();
  const today = new Date().toISOString().slice(0, 10);
  const kickoff = `${today}T18:00:00Z`;
  const feed = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/search_matches') {
      res.end(JSON.stringify({ matches: [{
        id: 'sr:match:smoke-1', kickoff, status: 'NS',
        home_team: { name: 'Alpha FC' }, away_team: { name: 'Beta FC' },
        league: { name: 'Premier A', country: 'Ghana' },
        odds: { homeWin: 1.70, draw: 3.60, awayWin: 4.80, over15: 1.24, over25: 1.66, under25: 2.10, under35: 1.40, bttsYes: 1.72, bttsNo: 1.95 }
      }] }));
      return;
    }
    if (url.pathname === '/get_fixture_stats') {
      res.end(JSON.stringify({ fixture: {
        id: 'sr:match:smoke-1', kickoff, status: 'NS',
        home_team: { name: 'Alpha FC' }, away_team: { name: 'Beta FC' },
        league: { name: 'Premier A', country: 'Ghana' },
        odds: { homeWin: 1.70, draw: 3.60, awayWin: 4.80, over15: 1.24, over25: 1.66, under25: 2.10, under35: 1.40, bttsYes: 1.72, bttsNo: 1.95 }
      } }));
      return;
    }
    if (url.pathname === '/get_team_history') { res.end(JSON.stringify({ matches: [] })); return; }
    if (url.pathname === '/get_team_streaks') { res.end(JSON.stringify({ streaks: [] })); return; }
    if (url.pathname === '/get_standings') { res.end(JSON.stringify({ available: false })); return; }
    if (url.pathname === '/get_competition_stats') { res.end(JSON.stringify({ available: false })); return; }
    if (url.pathname === '/live') { res.end(JSON.stringify({ fixtures: [] })); return; }
    if (url.pathname === '/results') { res.end(JSON.stringify({ fixtures: [] })); return; }
    if (url.pathname === '/events') { res.end(JSON.stringify({ events: [] })); return; }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve, reject) => {
    feed.listen(feedPort, '127.0.0.1', resolve);
    feed.on('error', reject);
  });
  t.after(() => feed.close());

  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      AUTO_SETTLEMENT_ENABLED: 'false',
      NODE_ENV: 'test',
      BETYNZ_DATA_API_BASE_URL: `http://127.0.0.1:${feedPort}/`,
      BETYNZ_DATA_API_KEY: 'smoke-key',
      BETYNZ_DATA_API_KEY_HEADER: 'X-API-Key',
      BETYNZ_DATA_API_FIXTURES_PATH: 'search_matches?date={date}&page=1&page_size=100',
      BETYNZ_DATA_API_FIXTURE_STATS_PATH: 'get_fixture_stats',
      BETYNZ_DATA_API_TEAM_HISTORY_PATH: 'get_team_history',
      BETYNZ_DATA_API_TEAM_STREAKS_PATH: 'get_team_streaks',
      BETYNZ_DATA_API_STANDINGS_PATH: 'get_standings',
      BETYNZ_DATA_API_COMPETITION_STATS_PATH: 'get_competition_stats',
      BETYNZ_DATA_API_LIVE_PATH: 'live',
      BETYNZ_DATA_API_RESULTS_PATH: 'results',
      BETYNZ_DATA_API_EVENTS_PATH: 'events',
      BETYNZ_DATA_API_MAX_PAGES: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill('SIGTERM'));

  const health = await (await waitFor(`http://127.0.0.1:${port}/api/health`)).json();
  assert.equal(health.version, '4.0.2');
  assert.deepEqual(health.engines, ['MARKET_ROUTE', 'PPG_ROUTE', 'CONVERGENCE_ROUTE']);

  const fixturePayload = await (await fetch(`http://127.0.0.1:${port}/api/fixtures?date=${today}`)).json();
  assert.equal(fixturePayload.source, 'SPORTYBET_CUSTOM_API');
  assert.equal(fixturePayload.fixtures.length, 1);

  for (const route of ['ppg-route-board','convergence-route-board']) {
    const response = await fetch(`http://127.0.0.1:${port}/api/${route}?date=${today}`);
    assert.equal(response.status, 200);
    assert.ok(Array.isArray((await response.json()).all));
  }

  for (const path of ['/', '/picks.html', '/convergence.html', '/ppg-route.html', '/admin-engine-audit.html', '/admin-calibration.html']) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200);
  }
});
