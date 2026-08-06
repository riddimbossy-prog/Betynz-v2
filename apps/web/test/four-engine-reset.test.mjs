import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readRoot = path => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('production server exposes the four engines with API-Football as the sole provider', async () => {
  const server = await read('src/server.mjs');
  assert.match(server, /MARKET_ROUTE/);
  assert.match(server, /PPG_ROUTE/);
  assert.match(server, /CONVERGENCE_ROUTE/);
  assert.match(server, /MOMENTUM_STREAK/);
  assert.match(server, /getApiFootballFixtureBoard/);
  assert.match(server, /getApiFootballLiveBoard/);
  assert.match(server, /getApiFootballResults/);
  assert.match(server, /getApiFootballIntelligence/);
  assert.match(server, /enrichApiFootballStatsBoard/);
  assert.match(server, /buildConsensusWindow|buildConsensusForFixture/);
  assert.doesNotMatch(server, /analyzeAtlas|analyzeOddsThreshold|analyzeCounterOdds|superviseEngines/);
});

test('public dashboard contains the four current engines and no retired engines', async () => {
  const html = await read('public/index.html');
  assert.match(html, /Market Route/);
  assert.match(html, /PPG Route/);
  assert.match(html, /Convergence/);
  assert.match(html, /Momentum/);
  assert.match(html, /Consensus Command Centre/);
  assert.doesNotMatch(html, /Atlas 80\/20|Odds Threshold|Counter Odds|Supervisor|Best Picks/);
});

test('one Render service contains only API-Football football configuration', async () => {
  const env = await read('.env.example');
  const render = await readRoot('render.yaml');
  const rootPackage = JSON.parse(await readRoot('package.json'));
  assert.match(env, /API_FOOTBALL_KEY=/);
  assert.match(render, /API_FOOTBALL_KEY/);
  assert.match(render, /API_FOOTBALL_BASE_URL/);
  assert.match(render, /API_FOOTBALL_MAX_ODDS_PAGES/);
  assert.equal((render.match(/type:\s*web/g) || []).length, 1);
  assert.equal(rootPackage.scripts.start, 'node apps/web/src/server.mjs');
});

test('only the current four engine modules and provider module remain', async () => {
  for (const path of ['src/engines/marketRoute.mjs','src/engines/ppgRoute.mjs','src/engines/convergence.mjs','src/engines/momentumStreak.mjs','src/engines/consensus.mjs','src/lib/apiFootball.mjs']) {
    await access(new URL(`../${path}`, import.meta.url));
  }
  const apps = (await import('node:fs/promises')).readdir(new URL('../../../apps/', import.meta.url), { withFileTypes: true });
  assert.deepEqual((await apps).filter(entry => entry.isDirectory()).map(entry => entry.name), ['web']);
});

test('fresh database schema accepts all four current engine codes', async () => {
  const sql = await read('sql/001_market_route_fresh.sql');
  assert.match(sql, /MARKET_ROUTE/);
  assert.match(sql, /PPG_ROUTE/);
  assert.match(sql, /CONVERGENCE_ROUTE/);
  assert.match(sql, /MOMENTUM_STREAK/);
  assert.match(sql, /consensus_candidates/);
  assert.match(sql, /consensus_snapshots/);
});

test('API-Football contract owns fixtures odds live results statistics and visuals', async () => {
  const module = await read('src/lib/apiFootball.mjs');
  for (const token of [
    'getApiFootballFixtureBoard','getApiFootballOddsForDate','getApiFootballLiveBoard','getApiFootballResults',
    'getApiFootballFixtureEvents','getApiFootballIntelligence','enrichApiFootballStatsBoard','resolveApiFootballTeam'
  ]) assert.match(module, new RegExp(token));
  assert.match(module, /SOLE_FOOTBALL_DATA_PROVIDER/);
  assert.match(module, /ALL_DAILY_FIXTURES_RETURNED_BY_PROVIDER/);
});
