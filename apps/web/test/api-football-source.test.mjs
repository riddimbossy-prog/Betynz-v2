import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readRoot = path => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('API-Football owns core football data while Stats API is additive enrichment', async () => {
  const [server, module, env, render, rootPackage] = await Promise.all([
    read('src/server.mjs'),
    read('src/lib/apiFootball.mjs'),
    read('.env.example'),
    readRoot('render.yaml'),
    readRoot('package.json')
  ]);
  for (const text of [server, module, env, render]) assert.match(text, /API_FOOTBALL/);
  assert.match(server,/STATS_API/); assert.match(env,/STATS_API_KEY/); assert.match(render,/STATS_API_KEY/);
  assert.match(rootPackage, /API-Football/);
  const apps = (await readdir(new URL('../../../apps/', import.meta.url), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
  assert.deepEqual(apps, ['web']);
  const providerModules = (await readdir(new URL('../src/lib/', import.meta.url))).filter(name => /apiFootball|statsApi/i.test(name)).sort();
  assert.deepEqual(providerModules, ['apiFootball.mjs','statsApi.mjs']);
});

test('all football responsibilities are wired to the single provider module', async () => {
  const module = await read('src/lib/apiFootball.mjs');
  const server = await read('src/server.mjs');
  for (const exportName of [
    'getApiFootballFixtureBoard',
    'getApiFootballOddsForDate',
    'getApiFootballLiveBoard',
    'getApiFootballResults',
    'getApiFootballFixtureEvents',
    'getApiFootballIntelligence',
    'enrichApiFootballStatsBoard',
    'enrichApiFootballVisuals',
    'resolveApiFootballTeam'
  ]) {
    assert.match(module, new RegExp(`export (?:async )?function ${exportName}`));
  }
  assert.match(server, /sourceRoles:\s*\{[^}]*fixtures:\s*'API_FOOTBALL'[^}]*odds:\s*'API_FOOTBALL'/s);
  assert.match(server, /dataSources:\s*\{[^}]*fixtures:\s*'API-Football'[^}]*results:\s*'API-Football'/s);
});

test('daily fixture coverage and odds pagination have no application cap', async () => {
  const module = await read('src/lib/apiFootball.mjs');
  const render = await readRoot('render.yaml');
  assert.match(module, /applicationFixtureCap:\s*null/);
  assert.match(module, /ALL_DAILY_FIXTURES_RETURNED_BY_PROVIDER/);
  assert.match(module, /maxOddsPages:\s*Math\.max\(0/);
  assert.match(render, /API_FOOTBALL_MAX_ODDS_PAGES[\s\S]*value:\s*"0"/);
  assert.doesNotMatch(render, /API_FOOTBALL_MAX_FIXTURES/);
});
