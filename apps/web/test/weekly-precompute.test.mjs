import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PREPARED_VIEW_KEYS, rememberPreparedView, getPreparedView, preparedFixtureCounts, preparedViewStats } from '../src/lib/preparedViews.mjs';

const addDays = (date, offset) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(offset || 0));
  return d.toISOString().slice(0, 10);
};

test('prepared weekly views can serve seven fixture counts without provider calls', () => {
  const from = '2099-08-07';
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(from, i);
    rememberPreparedView(PREPARED_VIEW_KEYS.FIXTURE_BOARD, date, { date, fixtures: Array.from({ length: i + 3 }, (_, n) => ({ id: `${i}-${n}` })) });
  }
  const counts = preparedFixtureCounts(from, 7, addDays);
  assert.equal(counts.prepared, true);
  assert.equal(counts.counts.length, 7);
  assert.equal(counts.counts[0].count, 3);
  assert.equal(counts.counts[6].count, 9);
  assert.ok(preparedViewStats().entries >= 7);
});

test('prepared engine view returns complete stored payload', () => {
  const date = '2099-09-01';
  rememberPreparedView(PREPARED_VIEW_KEYS.STATS_BUNDLE, date, { ppg: { complete: true }, apex: { complete: true } }, { complete: true });
  const hit = getPreparedView(PREPARED_VIEW_KEYS.STATS_BUNDLE, date);
  assert.equal(hit.complete, true);
  assert.equal(hit.payload.ppg.complete, true);
});

test('server precomputes full odds plus all engine layers before serving prepared week', async () => {
  const server = await readFile(new URL('../src/server.mjs', import.meta.url), 'utf8');
  for (const token of ['getApiFootballFixtureBoard(date)','buildCompleteStatsBundle','getStreakValueBoard(date)','composeZeusBoard','getQualifiedPicksWindow(date, 1)','persistPreparedViews','combinePreparedConsensusWindow','NEXT_WEEK_PREBUILD']) {
    assert.ok(server.includes(token), `missing weekly-precompute wiring: ${token}`);
  }
  assert.match(server, /SUNDAY_HOUR_UTC/);
  assert.match(server, /PRECOMPUTED_COMPLETE/);
});

test('weekly prepared intelligence is persisted in Supabase migration and fresh schema', async () => {
  const migration = await readFile(new URL('../sql/018_weekly_precomputed_intelligence.sql', import.meta.url), 'utf8');
  const fresh = await readFile(new URL('../sql/001_market_route_fresh.sql', import.meta.url), 'utf8');
  for (const text of [migration, fresh]) {
    assert.match(text, /prepared_intelligence_views/);
    assert.match(text, /CONSENSUS_DAY/);
    assert.match(text, /STATS_BUNDLE/);
  }
});

test('Render and dashboard expose weekly precompute controls and readiness', async () => {
  const render = await readFile(new URL('../../../render.yaml', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const key of ['WEEKLY_PRECOMPUTE_ENABLED','WEEKLY_PRECOMPUTE_DAYS','WEEKLY_PRECOMPUTE_SUNDAY_HOUR_UTC','PREPARED_VIEW_MAX_ENTRIES']) assert.match(render, new RegExp(key));
  assert.match(app, /\/api\/precompute-status/);
  assert.match(index, /Weekly intelligence/);
});
