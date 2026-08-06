import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const day = '2026-08-06';
const key = 'combined-integration-private-key';
const mockPort = 18940;
const corePort = 18941;
const webPort = 18942;

const baseMarkets = [
  { id: '1', desc: '1X2', outcomes: [
    { id: '1', desc: 'Home', odd: '1.72' },
    { id: '2', desc: 'Draw', odd: '3.55' },
    { id: '3', desc: 'Away', odd: '4.60' }
  ]},
  { id: 'dc', desc: 'Double Chance', outcomes: [
    { desc: '1X', odd: '1.18' }, { desc: '12', odd: '1.25' }, { desc: 'X2', odd: '2.00' }
  ]},
  { id: 'tg15', desc: 'Total Goals 1.5', outcomes: [
    { desc: 'Over', odd: '1.22' }, { desc: 'Under', odd: '3.80' }
  ]},
  { id: 'tg25', desc: 'Total Goals 2.5', outcomes: [
    { desc: 'Over', odd: '1.66' }, { desc: 'Under', odd: '2.08' }
  ]},
  { id: 'tg35', desc: 'Total Goals 3.5', outcomes: [
    { desc: 'Over', odd: '2.55' }, { desc: 'Under', odd: '1.42' }
  ]},
  { id: 'btts', desc: 'Both Teams To Score', outcomes: [
    { desc: 'Yes', odd: '1.73' }, { desc: 'No', odd: '1.95' }
  ]}
];

function fixture({ status = 'Not start', score, minute, halfTimeScore, markets = baseMarkets } = {}) {
  return {
    eventId: 'sr:match:998877',
    gameId: '998877',
    estimateStartTime: Date.parse(`${day}T16:00:00Z`),
    homeTeamName: 'Home United',
    awayTeamName: 'Away City',
    eventStatusDesc: status,
    score,
    minute,
    halfTimeScore,
    markets,
    incidents: status === '2nd Half'
      ? [{ minute: 67, type: 'goal', teamName: 'Home United', playerName: 'Player One' }]
      : []
  };
}

function payload(event) {
  return {
    bizCode: 10000,
    data: {
      tournamentList: [{
        tournamentId: 'sr:tournament:17',
        tournamentName: 'Premier League',
        categoryName: 'England',
        events: [event]
      }]
    }
  };
}

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let body;
  if (url.pathname === '/upcoming') body = payload(fixture());
  else if (url.pathname === '/live') body = payload(fixture({ status: '2nd Half', score: '2:1', minute: 67, halfTimeScore: '1:0' }));
  else if (url.pathname === '/results') body = payload(fixture({ status: 'Finished', score: '3:1', halfTimeScore: '1:0', markets: [] }));
  else if (url.pathname === '/detail') body = payload(fixture({ status: '2nd Half', score: '2:1', minute: 67, halfTimeScore: '1:0' }));
  else { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
});

async function waitJson(url, options = {}, timeout = 20000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      if (response.ok) return { response, body: text ? JSON.parse(text) : null };
      lastError = new Error(`${response.status}: ${text}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

let combined;
try {
  mock.listen(mockPort, '127.0.0.1');
  await once(mock, 'listening');

  combined = spawn(process.execPath, ['scripts/start-combined.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(webPort),
      SPORTYBET_INTERNAL_PORT: String(corePort),
      SPORTYBET_API_KEY: key,
      SPORTYBET_API_KEY_HEADER: 'X-API-Key',
      SPORTYBET_ALLOW_TEST_HOST: 'true',
      SPORTYBET_COUNTRY: 'gh',
      SPORTYBET_MAX_PAGES: '1',
      SPORTYBET_PAGE_SIZE: '100',
      SPORTYBET_PUBLIC_UPCOMING_URL: `http://127.0.0.1:${mockPort}/upcoming?page={page}&page_size={page_size}`,
      SPORTYBET_PUBLIC_LIVE_URL: `http://127.0.0.1:${mockPort}/live?page={page}&page_size={page_size}`,
      SPORTYBET_PUBLIC_RESULTS_URL: `http://127.0.0.1:${mockPort}/results?date={date}&page={page}&page_size={page_size}`,
      SPORTYBET_PUBLIC_EVENT_DETAIL_URL: `http://127.0.0.1:${mockPort}/detail?event_id={event_id}`,
      AUTO_SETTLEMENT_ENABLED: 'false',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  combined.stdout.on('data', chunk => process.stdout.write(`[combined-test] ${chunk}`));
  combined.stderr.on('data', chunk => process.stderr.write(`[combined-test] ${chunk}`));

  const coreHealth = await waitJson(`http://127.0.0.1:${corePort}/api/health`);
  assert.equal(coreHealth.body.source, 'SPORTYBET_CUSTOM_API');
  assert.equal(coreHealth.body.providers.apiFootball, false);

  const unauthorized = await fetch(`http://127.0.0.1:${corePort}/api/fixtures?date=${day}`);
  assert.equal(unauthorized.status, 401);

  const auth = { headers: { 'X-API-Key': key } };
  const coreFixtures = await waitJson(`http://127.0.0.1:${corePort}/api/fixtures?date=${day}`, auth);
  assert.equal(coreFixtures.body.count, 1);
  assert.equal(coreFixtures.body.fixtures[0].odds.homeWin, 1.72);
  assert.equal(coreFixtures.body.fixtures[0].odds.over25, 1.66);

  const coreLive = await waitJson(`http://127.0.0.1:${corePort}/api/live?date=${day}`, auth);
  assert.equal(coreLive.body.fixtures[0].minute, 67);
  assert.equal(coreLive.body.fixtures[0].score.home, 2);
  assert.equal(coreLive.body.fixtures[0].score.halftimeHome, 1);

  const coreResults = await waitJson(`http://127.0.0.1:${corePort}/api/results?date=${day}`, auth);
  assert.equal(coreResults.body.fixtures[0].status, 'FT');
  assert.equal(coreResults.body.fixtures[0].score.home, 3);
  assert.equal(coreResults.body.fixtures[0].score.away, 1);

  const webHealth = await waitJson(`http://127.0.0.1:${webPort}/api/health`);
  assert.equal(webHealth.body.version, '3.8.0');
  assert.deepEqual(webHealth.body.engines, ['MARKET_ROUTE', 'PPG_ROUTE', 'CONVERGENCE_ROUTE']);

  const config = await waitJson(`http://127.0.0.1:${webPort}/api/config`);
  assert.equal(config.body.dataSources.fixtures, 'SportyBet custom API');
  assert.equal(config.body.dataSources.live, 'SportyBet custom API');
  assert.equal(config.body.dataSources.results, 'SportyBet custom API');

  const webFixtures = await waitJson(`http://127.0.0.1:${webPort}/api/fixtures?date=${day}`);
  assert.equal(webFixtures.body.source, 'SPORTYBET_CUSTOM_API');
  assert.equal(webFixtures.body.fixtures.length, 1);
  assert.equal(webFixtures.body.fixtures[0].odds.homeWin, 1.72);
  assert.equal(webFixtures.body.fixtures[0].odds.bttsYes, 1.73);

  const webLive = await waitJson(`http://127.0.0.1:${webPort}/api/live?date=${day}`);
  assert.equal(webLive.body.source, 'SPORTYBET_CUSTOM_API');
  assert.equal(webLive.body.fixtures[0].minute, 67);
  assert.equal(webLive.body.fixtures[0].score.home, 2);

  console.log(JSON.stringify({
    ok: true,
    deployment: 'ONE_RENDER_SERVICE',
    renderYamlCount: 1,
    source: 'SPORTYBET_CUSTOM_API',
    engines: webHealth.body.engines,
    core: { fixtures: 1, live: 1, results: 1, auth: 'passed' },
    web: { fixtures: 1, live: 1, version: webHealth.body.version }
  }, null, 2));
} finally {
  if (combined && !combined.killed) combined.kill('SIGTERM');
  mock.close();
}
