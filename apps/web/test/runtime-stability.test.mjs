import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

process.env.BETYNZ_CACHE_MAX_ENTRIES = '100';
const { cacheSet, cacheStats } = await import('../src/lib/cache.mjs');

test('general runtime cache is bounded and evicts old entries', () => {
  for (let i = 0; i < 180; i += 1) cacheSet(`runtime-stability-${i}`, { i }, 3600);
  const stats = cacheStats();
  assert.equal(stats.maxEntries, 100);
  assert.ok(stats.entries <= 100);
});

test('Render runtime uses bounded media, Stats API and analysis snapshot caches', async () => {
  const repoRoot = resolve(process.cwd(), '../..');
  const render = await readFile(resolve(repoRoot, 'render.yaml'), 'utf8');
  const server = await readFile(resolve(process.cwd(), 'src/server.mjs'), 'utf8');
  const statsApi = await readFile(resolve(process.cwd(), 'src/lib/statsApi.mjs'), 'utf8');
  for (const key of [
    'BETYNZ_CACHE_MAX_ENTRIES',
    'API_FOOTBALL_MEDIA_CACHE_MAX_ENTRIES',
    'API_FOOTBALL_MEDIA_CACHE_MAX_MB',
    'STATS_API_CACHE_MAX_ENTRIES',
    'ANALYSIS_SNAPSHOT_MAX_DATES',
    'CONSENSUS_SNAPSHOT_MAX_WINDOWS',
    'AUTO_SETTLEMENT_START_DELAY_SECONDS'
  ]) assert.ok(render.includes(key), `render.yaml missing ${key}`);
  assert.match(server, /pruneMediaCache/);
  assert.match(server, /runtimeMemory/);
  assert.match(server, /one deep date alive at a time/i);
  assert.match(server, /requestRecentSettlements[\s\S]*for \(let offset = 0;/);
  assert.match(statsApi, /STATS_API_CACHE_MAX_ENTRIES/);
});
