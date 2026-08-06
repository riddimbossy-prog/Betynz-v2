import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readCombined = path => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('production server exposes the three engines, SportyBet authority and API-Football enrichment', async () => {
  const server = await read('src/server.mjs');
  assert.match(server, /MARKET_ROUTE/);
  assert.match(server, /PPG_ROUTE/);
  assert.match(server, /CONVERGENCE_ROUTE/);
  assert.match(server, /fetchDataApiFixtures/);
  assert.match(server, /getApiFootballIntelligence/);
  assert.match(server, /enrichApiFootballStatsBoard/);
  assert.match(server, /buildConsensusWindow|buildConsensusForFixture/);
  assert.doesNotMatch(server, /analyzeAtlas|analyzeOddsThreshold|analyzeCounterOdds|superviseEngines/);
});

test('public dashboard contains the three current engines and no retired engines', async () => {
  const html = await read('public/index.html');
  assert.match(html, /Market Route/);
  assert.match(html, /PPG Route/);
  assert.match(html, /Convergence/);
  assert.match(html, /Consensus Command Centre/);
  assert.doesNotMatch(html, /Atlas 80\/20|Odds Threshold|Counter Odds|Supervisor|Best Picks/);
});

test('combined Render service keeps SportyBet authoritative and adds private API-Football enrichment', async () => {
  const env = await read('.env.example');
  const render = await readCombined('render.yaml');
  const launcher = await readCombined('scripts/start-combined.mjs');
  assert.match(env, /BETYNZ_DATA_API_BASE_URL/);
  assert.match(render, /SPORTYBET_PUBLIC_UPCOMING_URL/);
  assert.match(render, /SPORTYBET_PUBLIC_LIVE_URL/);
  assert.match(render, /SPORTYBET_PUBLIC_RESULTS_URL/);
  assert.match(launcher, /BETYNZ_DATA_API_BASE_URL/);
  assert.match(launcher, /127\.0\.0\.1/);
  assert.match(render, /API_FOOTBALL_KEY/);
  assert.match(render, /API_FOOTBALL_BASE_URL/);
  assert.match(env, /API_FOOTBALL_KEY=/);
  assert.doesNotMatch(`${env}\n${render}\n${launcher}`, /ODDS_FEED_/);
});

test('retired engine and old data-adapter modules are absent', async () => {
  for (const path of [
    'src/engines/atlas8020.mjs','src/engines/oddsThreshold.mjs','src/engines/counterOdds.mjs','src/engines/supervisor.mjs',
    'src/lib/oddsFeed.mjs'
  ]) await assert.rejects(access(new URL(`../${path}`, import.meta.url)));
  await access(new URL('../src/lib/dataApi.mjs', import.meta.url));
  await access(new URL('../src/lib/apiFootball.mjs', import.meta.url));
});

test('fresh database schema accepts all three current engine codes', async () => {
  const sql = await read('sql/001_market_route_fresh.sql');
  assert.match(sql, /MARKET_ROUTE/);
  assert.match(sql, /PPG_ROUTE/);
  assert.match(sql, /CONVERGENCE_ROUTE/);
  assert.match(sql, /consensus_candidates/);
  assert.match(sql, /consensus_snapshots/);
});
