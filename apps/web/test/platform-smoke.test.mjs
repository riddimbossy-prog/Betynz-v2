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

async function waitFor(url, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${response.status}: ${await response.text()}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function fixture({ id, date, homeId = 101, awayId = 202, home = 'Alpha FC', away = 'Beta FC', status = 'NS', homeGoals = null, awayGoals = null }) {
  return {
    fixture: { id, date, timezone: 'UTC', referee: null, venue: { id: 1, name: 'Arena' }, status: { short: status, elapsed: status === '2H' ? 67 : null } },
    league: { id: 55, name: 'Premier A', country: 'Ghana', season: 2038, logo: 'https://img.test/league.png', flag: 'https://img.test/gh.png' },
    teams: { home: { id: homeId, name: home, logo: `https://img.test/${homeId}.png` }, away: { id: awayId, name: away, logo: `https://img.test/${awayId}.png` } },
    goals: { home: homeGoals, away: awayGoals },
    score: { halftime: { home: homeGoals == null ? null : Math.min(1, homeGoals), away: awayGoals == null ? null : Math.min(1, awayGoals) }, fulltime: { home: homeGoals, away: awayGoals } }
  };
}

function odds(fixtureId) {
  return {
    fixture: { id: fixtureId },
    update: '2038-01-01T10:00:00Z',
    bookmakers: [{ id: 8, name: 'Test Book', bets: [
      { name: 'Match Winner', values: [{ value: 'Home', odd: '1.70' }, { value: 'Draw', odd: '3.60' }, { value: 'Away', odd: '4.80' }] },
      { name: 'Goals Over/Under', values: [{ value: 'Over 1.5', odd: '1.24' }, { value: 'Over 2.5', odd: '1.66' }, { value: 'Under 2.5', odd: '2.10' }, { value: 'Under 3.5', odd: '1.40' }] },
      { name: 'Both Teams To Score', values: [{ value: 'Yes', odd: '1.72' }, { value: 'No', odd: '1.95' }] }
    ] }]
  };
}

test('full platform keeps all boards, consensus, calibration and API-Football endpoints', async () => {
  const server = await read('src/server.mjs');
  for (const route of [
    '/api/fixtures-week','/api/market-route-board','/api/ppg-route-board','/api/convergence-route-board',
    '/api/match-intelligence','/api/live','/api/results','/api/proof','/api/performance','/api/odds-movement','/api/leagues',
    '/api/qualified-picks','/api/consensus-picks','/api/admin/engine-audit','/api/admin/calibration'
  ]) assert.match(server, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(server, /getApiFootballFixtureBoard/);
  assert.match(server, /getApiFootballLiveBoard/);
  assert.match(server, /getApiFootballIntelligence/);
  assert.match(server, /enrichApiFootballStatsBoard/);
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

test('production server boots with API-Football as the only football source', async t => {
  const port = await freePort();
  const apiPort = await freePort();
  const today = new Date().toISOString().slice(0, 10);
  const kickoff = `${today}T18:00:00Z`;
  const scheduled = fixture({ id: 5001, date: kickoff });
  const historyHome = Array.from({ length: 5 }, (_, index) => fixture({ id: 6000 + index, date: `${today}T0${index + 1}:00:00Z`, homeId: 101, awayId: 300 + index, home: 'Alpha FC', away: `Home Opp ${index}`, status: 'FT', homeGoals: 2, awayGoals: index % 2 }));
  const historyAway = Array.from({ length: 5 }, (_, index) => fixture({ id: 7000 + index, date: `${today}T0${index + 1}:30:00Z`, homeId: 400 + index, awayId: 202, home: `Away Opp ${index}`, away: 'Beta FC', status: 'FT', homeGoals: index % 2, awayGoals: 1 }));

  const api = createServer((req, res) => {
    assert.equal(req.headers['x-apisports-key'], 'smoke-api-key');
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader('content-type', 'application/json');
    const send = (response, paging = { current: 1, total: 1 }) => res.end(JSON.stringify({ response, errors: [], paging }));
    if (url.pathname === '/fixtures' && url.searchParams.get('date') === today) return send([scheduled]);
    if (url.pathname === '/fixtures' && url.searchParams.get('live') === 'all') return send([fixture({ id: 5002, date: kickoff, status: '2H', homeGoals: 2, awayGoals: 1 })]);
    if (url.pathname === '/fixtures' && url.searchParams.get('team') === '101') return send(historyHome);
    if (url.pathname === '/fixtures' && url.searchParams.get('team') === '202') return send(historyAway);
    if (url.pathname === '/odds') return send([odds(5001)]);
    if (url.pathname === '/standings') return send([{ league: { id: 55, name: 'Premier A', country: 'Ghana', season: 2038, standings: [[]] } }]);
    if (url.pathname === '/teams/statistics') return res.end(JSON.stringify({ response: { form: 'WWDWL', fixtures: { played: { total: 20 } }, goals: {} }, errors: [] }));
    if (url.pathname === '/fixtures/headtohead' || url.pathname === '/predictions' || url.pathname === '/injuries' || url.pathname === '/fixtures/statistics' || url.pathname === '/fixtures/lineups' || url.pathname === '/fixtures/players') return send([]);
    if (url.pathname === '/fixtures/events') return send([{ time: { elapsed: 67 }, team: { id: 101, name: 'Alpha FC' }, type: 'Goal', detail: 'Normal Goal' }]);
    if (url.pathname === '/teams') return send([{ team: { id: 101, name: 'Alpha FC', logo: 'https://img.test/101.png' }, venue: { country: 'Ghana' } }]);
    return send([]);
  });
  await new Promise((resolve, reject) => { api.listen(apiPort, '127.0.0.1', resolve); api.on('error', reject); });
  t.after(() => api.close());

  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      AUTO_SETTLEMENT_ENABLED: 'false',
      NODE_ENV: 'test',
      API_FOOTBALL_KEY: 'smoke-api-key',
      API_FOOTBALL_BASE_URL: `http://127.0.0.1:${apiPort}/`,
      API_FOOTBALL_KEY_HEADER: 'x-apisports-key',
      API_FOOTBALL_RETRIES: '0',
      API_FOOTBALL_REQUEST_MIN_INTERVAL_MS: '0',
      API_FOOTBALL_MAX_ODDS_PAGES: '0',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stderr.on('data', chunk => { logs += chunk; });
  t.after(() => child.kill('SIGTERM'));

  const health = await (await waitFor(`http://127.0.0.1:${port}/api/health`)).json();
  assert.equal(health.version, '5.0.1');
  assert.equal(health.configured.apiFootball, true);
  assert.deepEqual(health.engines, ['MARKET_ROUTE', 'PPG_ROUTE', 'CONVERGENCE_ROUTE']);
  assert.deepEqual(new Set(Object.values(health.sourceRoles)), new Set(['API_FOOTBALL']));

  const config = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
  assert.deepEqual(new Set(Object.values(config.dataSources)), new Set(['API-Football']));

  const fixturePayload = await (await fetch(`http://127.0.0.1:${port}/api/fixtures?date=${today}`)).json();
  assert.equal(fixturePayload.source, 'API_FOOTBALL');
  assert.equal(fixturePayload.fixtures.length, 1);
  assert.equal(fixturePayload.fixtures[0].odds.homeWin, 1.70);
  assert.equal(fixturePayload.fixtures[0].home.logo, 'https://img.test/101.png');

  const livePayload = await (await fetch(`http://127.0.0.1:${port}/api/live?date=${today}`)).json();
  assert.equal(livePayload.source, 'API_FOOTBALL');
  assert.equal(livePayload.fixtures[0].minute, 67);

  for (const route of ['ppg-route-board','convergence-route-board']) {
    const response = await fetch(`http://127.0.0.1:${port}/api/${route}?date=${today}`);
    assert.equal(response.status, 200, logs);
    assert.ok(Array.isArray((await response.json()).all));
  }

  for (const path of ['/', '/picks.html', '/convergence.html', '/ppg-route.html', '/admin-engine-audit.html', '/admin-calibration.html']) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200);
  }
});
