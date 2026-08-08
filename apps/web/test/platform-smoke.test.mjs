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
    '/api/fixtures-week','/api/market-route-board','/api/apex-intelligence-board','/api/convergence-route-board',
    '/api/match-intelligence','/api/live','/api/results','/api/proof','/api/performance','/api/odds-movement','/api/leagues',
    '/api/qualified-picks','/api/consensus-picks','/api/wins-carousel','/api/settlement-status','/api/admin/engine-audit','/api/admin/calibration'
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



test('dashboard crests use the same-origin API-Football media proxy with a fallback', async () => {
  const [server, app, live] = await Promise.all([read('src/server.mjs'), read('public/app.js'), read('public/live.js')]);
  assert.match(server, /serveApiFootballMedia/);
  assert.match(server, /API_FOOTBALL_MEDIA_BASE_URL/);
  assert.match(app, /\/api\/media\/team\//);
  assert.match(app, /bindCrestFallbacks/);
  assert.match(live, /live-crest/);
});

test('dashboard experience includes board-aware sections, rolling settled wins and complete PWA branding', async () => {
  const [index, app, picks, picksJs, manifest, motion, sw] = await Promise.all([
    read('public/index.html'), read('public/app.js'), read('public/picks.html'), read('public/picks.js'),
    read('public/manifest.webmanifest'), read('public/motion.js'), read('public/sw.js')
  ]);
  assert.match(index, /id="winCarousel"/);
  assert.match(app, /loadWinCarousel/);
  assert.match(picks, /data-board-aware/);
  assert.match(picksJs, /setBoardAwareVisibility/);
  assert.match(manifest, /maskable-512\.png/);
  assert.match(manifest, /launch_handler/);
  assert.match(motion, /pwa-launch-splash/);
  assert.match(sw, /betynz-v5-2-0/);
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
    if (url.pathname === '/media/teams/101.png') {
      res.setHeader('content-type', 'image/png');
      return res.end(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]));
    }
    res.setHeader('content-type', 'application/json');
    const send = (response, paging = { current: 1, total: 1 }) => res.end(JSON.stringify({ response, errors: [], paging }));
    if (url.pathname === '/fixtures' && url.searchParams.get('date') === today) return send([scheduled]);
    if (url.pathname === '/fixtures' && url.searchParams.get('live') === 'all') return send([fixture({ id: 5002, date: kickoff, status: '2H', homeGoals: 2, awayGoals: 1 })]);
    if (url.pathname === '/fixtures' && url.searchParams.get('team') === '101') return send(historyHome);
    if (url.pathname === '/fixtures' && url.searchParams.get('team') === '202') return send(historyAway);
    if (url.pathname === '/odds') return setTimeout(() => send([odds(5001)]), 1200);
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
      API_FOOTBALL_MEDIA_BASE_URL: `http://127.0.0.1:${apiPort}/media`,
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
  assert.equal(health.version, '5.2.0');
  assert.equal(health.configured.apiFootball, true);
  assert.deepEqual(health.engines, ['MARKET_ROUTE', 'PPG_ROUTE', 'APEX_INTELLIGENCE', 'CONVERGENCE_ROUTE', 'MOMENTUM_STREAK', 'STREAK_VALUE', 'HTFT_MOMENTUM', 'ZEUS_SUPERVISOR']);
  assert.equal(health.sourceRoles.fixtures, 'API_FOOTBALL');
  assert.equal(health.sourceRoles.streakIntelligence, 'STATS_API');

  const config = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
  assert.equal(config.dataSources.fixtures, 'API-Football');
  assert.equal(config.dataSources.streaksAndXg, 'Stats API');

  const winsResponse = await fetch(`http://127.0.0.1:${port}/api/wins-carousel?days=14&limit=10`);
  assert.equal(winsResponse.status, 200, logs);
  const winsPayload = await winsResponse.json();
  assert.ok(Array.isArray(winsPayload.rows));

  const settlementResponse = await fetch(`http://127.0.0.1:${port}/api/settlement-status?date=${today}`);
  assert.equal(settlementResponse.status, 200, logs);

  const fixtureStarted = Date.now();
  const firstFixtureResponse = await fetch(`http://127.0.0.1:${port}/api/fixtures?date=${today}`);
  const fixturePayload = await firstFixtureResponse.json();
  assert.ok(Date.now() - fixtureStarted < 1000, 'dashboard fixtures must not wait for odds pagination');
  assert.equal(fixturePayload.source, 'API_FOOTBALL');
  assert.equal(fixturePayload.fixtures.length, 1);
  assert.equal(fixturePayload.oddsPending, true);
  assert.equal(fixturePayload.fixtures[0].home.logo, 'https://img.test/101.png');

  let pricedPayload = fixturePayload;
  const pricedDeadline = Date.now() + 7000;
  while (Date.now() < pricedDeadline && Number(pricedPayload.fixtures?.[0]?.odds?.homeWin || 0) <= 1) {
    await new Promise(resolve => setTimeout(resolve, 300));
    pricedPayload = await (await fetch(`http://127.0.0.1:${port}/api/fixtures?date=${today}&odds_refresh=${Date.now()}`, { cache: 'no-store' })).json();
  }
  assert.equal(pricedPayload.oddsPending, false);
  assert.equal(pricedPayload.fixtures[0].odds.homeWin, 1.70);

  const crestResponse = await fetch(`http://127.0.0.1:${port}/api/media/team/101.png`);
  assert.equal(crestResponse.status, 200, logs);
  assert.equal(crestResponse.headers.get('content-type'), 'image/png');
  assert.ok((await crestResponse.arrayBuffer()).byteLength > 8);

  const livePayload = await (await fetch(`http://127.0.0.1:${port}/api/live?date=${today}`)).json();
  assert.equal(livePayload.source, 'API_FOOTBALL');
  assert.equal(livePayload.fixtures[0].minute, 67);

  for (const route of ['apex-intelligence-board','convergence-route-board']) {
    const response = await fetch(`http://127.0.0.1:${port}/api/${route}?date=${today}`);
    assert.equal(response.status, 200, logs);
    assert.ok(Array.isArray((await response.json()).all));
  }

  for (const path of ['/', '/picks.html', '/convergence.html', '/apex-intelligence.html', '/admin-engine-audit.html', '/admin-calibration.html']) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200);
  }
});
