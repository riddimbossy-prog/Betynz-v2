import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function freshPersistenceModule() {
  const href = new URL(`../src/lib/persistenceCore.mjs?test=${Date.now()}-${Math.random()}`, import.meta.url).href;
  return import(href);
}

test('persistence core prevents overlapping local jobs when distributed storage is unavailable', async () => {
  const previous = process.env.PERSISTENCE_CORE_ENABLED;
  process.env.PERSISTENCE_CORE_ENABLED = 'true';
  try {
    const core = await freshPersistenceModule();
    const key = `test-lock-${Date.now()}`;
    const first = await core.acquireJobLock(key, 60);
    assert.equal(first.acquired, true);
    const second = await core.acquireJobLock(key, 60);
    assert.equal(second.acquired, false);
    assert.equal(second.reason, 'local_lock_busy');
    const released = await core.releaseJobLock(key);
    assert.equal(released.released, true);
    const third = await core.acquireJobLock(key, 60);
    assert.equal(third.acquired, true);
    await core.releaseJobLock(key);
  } finally {
    if (previous == null) delete process.env.PERSISTENCE_CORE_ENABLED;
    else process.env.PERSISTENCE_CORE_ENABLED = previous;
  }
});

test('job checkpoints remain resumable through the local safe fallback', async () => {
  const previous = process.env.PERSISTENCE_CORE_ENABLED;
  process.env.PERSISTENCE_CORE_ENABLED = 'true';
  try {
    const core = await freshPersistenceModule();
    const jobKey = `weekly:test-${Date.now()}`;
    await core.checkpointJob({
      job_key: jobKey,
      job_kind: 'WEEKLY_PRECOMPUTE',
      state: 'RUNNING',
      phase: 'STATS_BUNDLE',
      cursor_value: 3,
      total: 7,
      completed_count: 3,
      payload: { completedDates: ['2026-08-09', '2026-08-10', '2026-08-11'] }
    });
    const restored = await core.loadJob(jobKey);
    assert.equal(restored.job_key, jobKey);
    assert.equal(restored.phase, 'STATS_BUNDLE');
    assert.equal(restored.completed_count, 3);
    assert.deepEqual(restored.payload.completedDates, ['2026-08-09', '2026-08-10', '2026-08-11']);
  } finally {
    if (previous == null) delete process.env.PERSISTENCE_CORE_ENABLED;
    else process.env.PERSISTENCE_CORE_ENABLED = previous;
  }
});

test('server wires per-fixture restore, durable checkpoints and private operations controls', async () => {
  const server = await readFile(resolve(root, 'src/server.mjs'), 'utf8');
  const operations = await readFile(resolve(root, 'public/admin-operations.js'), 'utf8');
  const html = await readFile(resolve(root, 'public/admin-operations.html'), 'utf8');

  for (const token of [
    'loadFixtureStates(date)',
    'checkpointFixtureStates',
    'hydratePersistentStatsDate',
    'acquireJobLock',
    'checkpointJob',
    "'/api/admin/operations'",
    "'/api/admin/operations/refresh-date'",
    "'/api/admin/operations/retry-failed'",
    "'/api/admin/operations/recompute-fixture'"
  ]) assert.ok(server.includes(token), `server should contain ${token}`);

  assert.ok(html.includes('Operations Control'));
  assert.ok(operations.includes('/api/admin/operations'));
  assert.ok(operations.includes('recompute-fixture'));
  assert.ok(operations.includes('retry-failed'));
});

test('persistence migration defines durable ledger, checkpoints, snapshots and distributed locks', async () => {
  const sql = await readFile(resolve(root, 'sql/019_persistence_core.sql'), 'utf8');
  for (const token of [
    'create table if not exists prediction_ledger',
    'create table if not exists fixture_processing_state',
    'create table if not exists persistence_job_runs',
    'create table if not exists persistence_job_locks',
    'create table if not exists board_snapshots',
    'betynz_acquire_job_lock',
    'betynz_renew_job_lock',
    'betynz_release_job_lock',
    'betynz_upsert_board_snapshot'
  ]) assert.ok(sql.toLowerCase().includes(token.toLowerCase()), `migration should contain ${token}`);
});
