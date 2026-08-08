import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  supabaseConfigured,
  acquirePersistenceLock,
  renewPersistenceLock,
  releasePersistenceLock,
  upsertPersistenceJobRun,
  getPersistenceJobRuns,
  upsertFixtureProcessingStates,
  getFixtureProcessingStates,
  persistBoardSnapshot,
  getBoardSnapshots,
  getPersistenceLocks,
  getPredictionLedger,
  deleteFixtureProcessingState,
  getFixtureProcessingSummary
} from './supabase.mjs';

const instanceId = `${hostname() || 'betynz'}:${process.pid}:${randomUUID().slice(0, 8)}`;
const localLocks = new Map();
const localJobs = new Map();
const state = {
  instanceId,
  startedAt: new Date().toISOString(),
  lockAcquired: 0,
  lockRejected: 0,
  fixtureCheckpoints: 0,
  jobCheckpoints: 0,
  boardCheckpoints: 0,
  restoredFixtures: 0,
  lastWriteAt: null,
  lastRestoreAt: null,
  lastError: null
};

function rememberError(scope, error) {
  state.lastError = { scope, message: error?.message || String(error || 'unknown_error'), at: new Date().toISOString() };
}

function configured() {
  return supabaseConfigured();
}

export function persistenceInstanceId() {
  return instanceId;
}

export function persistenceCoreEnabled() {
  return String(process.env.PERSISTENCE_CORE_ENABLED || 'true').toLowerCase() === 'true';
}

export async function acquireJobLock(lockKey, leaseSeconds = 1800) {
  if (!persistenceCoreEnabled()) return { acquired: true, distributed: false, bypassed: true, owner: instanceId };
  const now = Date.now();
  const current = localLocks.get(lockKey);
  if (current && current.until > now) {
    state.lockRejected += 1;
    return { acquired: false, distributed: Boolean(current.distributed), owner: current.owner, reason: 'local_lock_busy' };
  }
  if (current) localLocks.delete(lockKey);

  const owner = `${instanceId}:${randomUUID().slice(0, 8)}`;
  if (configured()) {
    try {
      const result = await acquirePersistenceLock(lockKey, owner, leaseSeconds);
      if (result.ok) {
        if (result.acquired) {
          localLocks.set(lockKey, { owner, until: now + Math.max(30, leaseSeconds) * 1000, distributed: true });
          state.lockAcquired += 1;
        } else state.lockRejected += 1;
        return { ...result, distributed: true, owner };
      }
      // Migration may not have been applied yet. Never stop Betynz scheduling
      // because the persistence tables/RPC are temporarily unavailable.
      state.lastError = { scope: 'acquire_lock', message: result.reason || 'distributed_lock_unavailable', at: new Date().toISOString() };
    } catch (error) {
      rememberError('acquire_lock', error);
    }
  }

  localLocks.set(lockKey, { owner, until: now + Math.max(30, leaseSeconds) * 1000, distributed: false });
  state.lockAcquired += 1;
  return { acquired: true, distributed: false, owner };
}

export async function renewJobLock(lockKey, leaseSeconds = 1800) {
  if (!persistenceCoreEnabled()) return { renewed: true, distributed: false, bypassed: true };
  const current = localLocks.get(lockKey);
  if (!current) return { renewed: false, distributed: false, reason: 'lock_not_owned' };
  if (current.distributed && configured()) {
    try {
      const result = await renewPersistenceLock(lockKey, current.owner, leaseSeconds);
      if (result.ok) {
        if (result.renewed) current.until = Date.now() + Math.max(30, leaseSeconds) * 1000;
        return { ...result, distributed: true };
      }
    } catch (error) { rememberError('renew_lock', error); }
  }
  current.until = Date.now() + Math.max(30, leaseSeconds) * 1000;
  return { renewed: true, distributed: false };
}

export async function releaseJobLock(lockKey) {
  if (!persistenceCoreEnabled()) return { released: true, distributed: false, bypassed: true };
  const current = localLocks.get(lockKey);
  if (!current) return { released: true, distributed: false, alreadyReleased: true };
  localLocks.delete(lockKey);
  if (current.distributed && configured()) {
    try {
      const result = await releasePersistenceLock(lockKey, current.owner);
      if (result.ok) return { ...result, distributed: true };
    } catch (error) { rememberError('release_lock', error); }
  }
  return { released: true, distributed: false };
}

export async function checkpointJob(row = {}) {
  if (!row.job_key) return { stored: false, reason: 'job_key_required' };
  const previous = localJobs.get(row.job_key) || {};
  const payload = {
    job_key: row.job_key,
    job_kind: row.job_kind || previous.job_kind || 'GENERIC',
    fixture_date: row.fixture_date ?? previous.fixture_date ?? null,
    state: row.state || previous.state || 'RUNNING',
    phase: row.phase ?? previous.phase ?? null,
    cursor_value: Math.max(0, Number(row.cursor_value ?? previous.cursor_value ?? 0) || 0),
    total: Math.max(0, Number(row.total ?? previous.total ?? 0) || 0),
    completed_count: Math.max(0, Number(row.completed_count ?? previous.completed_count ?? 0) || 0),
    failed_count: Math.max(0, Number(row.failed_count ?? previous.failed_count ?? 0) || 0),
    attempts: Math.max(0, Number(row.attempts ?? previous.attempts ?? 0) || 0),
    payload: row.payload ?? previous.payload ?? {},
    last_error: row.last_error ?? previous.last_error ?? null,
    started_at: row.started_at ?? previous.started_at ?? null,
    completed_at: row.completed_at ?? previous.completed_at ?? null,
    updated_at: new Date().toISOString()
  };
  localJobs.set(payload.job_key, payload);
  state.jobCheckpoints += 1;
  state.lastWriteAt = payload.updated_at;
  if (!persistenceCoreEnabled() || !configured()) return { stored: false, local: true, reason: configured() ? 'disabled' : 'not_configured' };
  try { return await upsertPersistenceJobRun(payload); }
  catch (error) { rememberError('checkpoint_job', error); return { stored: false, error: error?.message }; }
}

export async function loadJob(jobKey) {
  if (!jobKey) return null;
  if (persistenceCoreEnabled() && configured()) {
    try {
      const result = await getPersistenceJobRuns({ jobKey, limit: 1 });
      if (result.rows?.[0]) return result.rows[0];
    } catch (error) { rememberError('load_job', error); }
  }
  return localJobs.get(jobKey) || null;
}

export async function checkpointFixtureStates(rows = []) {
  const safeRows = rows.filter(row => row?.fixture_id && row?.fixture_date);
  if (!safeRows.length) return { stored: false, reason: 'no_rows' };
  state.fixtureCheckpoints += safeRows.length;
  state.lastWriteAt = new Date().toISOString();
  if (!persistenceCoreEnabled() || !configured()) return { stored: false, local: true, reason: configured() ? 'disabled' : 'not_configured' };
  try { return await upsertFixtureProcessingStates(safeRows); }
  catch (error) { rememberError('checkpoint_fixtures', error); return { stored: false, error: error?.message }; }
}

export async function loadFixtureStates(date, limit = 5000) {
  if (!persistenceCoreEnabled() || !configured() || !date) return [];
  try {
    const result = await getFixtureProcessingStates({ date, limit });
    const rows = result.rows || [];
    state.restoredFixtures += rows.filter(row => row.analysis_ready).length;
    state.lastRestoreAt = new Date().toISOString();
    return rows;
  } catch (error) {
    rememberError('load_fixture_states', error);
    return [];
  }
}

export async function checkpointBoard({ boardKey, date, complete = false, processed = 0, total = 0, payload = {}, generatedAt = null } = {}) {
  if (!boardKey || !date) return { stored: false, reason: 'board_key_and_date_required' };
  state.boardCheckpoints += 1;
  state.lastWriteAt = new Date().toISOString();
  if (!persistenceCoreEnabled() || !configured()) return { stored: false, local: true, reason: configured() ? 'disabled' : 'not_configured' };
  try { return await persistBoardSnapshot({ boardKey, date, complete, processed, total, payload, generatedAt }); }
  catch (error) { rememberError('checkpoint_board', error); return { stored: false, error: error?.message }; }
}

export async function loadBoards({ from, to, date, boardKey, limit = 100 } = {}) {
  if (!persistenceCoreEnabled() || !configured()) return [];
  try { return (await getBoardSnapshots({ from, to, date, boardKey, limit })).rows || []; }
  catch (error) { rememberError('load_boards', error); return []; }
}


export async function dropFixtureCheckpoint(date, fixtureId) {
  if (!date || !fixtureId) return { deleted: false, reason: 'date_and_fixture_required' };
  if (!persistenceCoreEnabled() || !configured()) return { deleted: false, local: true, reason: configured() ? 'disabled' : 'not_configured' };
  try { return await deleteFixtureProcessingState(date, String(fixtureId)); }
  catch (error) { rememberError('drop_fixture_checkpoint', error); return { deleted: false, error: error?.message }; }
}

export async function persistenceOperationsSnapshot({ date = null, ledgerFrom = null, ledgerTo = null } = {}) {
  const base = {
    ...state,
    enabled: persistenceCoreEnabled(),
    supabase: configured(),
    distributedLocks: configured(),
    localLocks: [...localLocks.entries()].map(([lockKey, value]) => ({ lockKey, owner: value.owner, leaseUntil: new Date(value.until).toISOString() }))
  };
  if (!configured()) return { ...base, jobs: [...localJobs.values()], locks: base.localLocks, ledger: [] };
  try {
    const [jobs, locks, ledger, fixtureSummary] = await Promise.all([
      getPersistenceJobRuns({ limit: 80 }),
      getPersistenceLocks({ limit: 80 }),
      getPredictionLedger({ from: ledgerFrom, to: ledgerTo, limit: 100 }),
      date ? getFixtureProcessingSummary(date, 5000) : Promise.resolve({ rows: [] })
    ]);
    const fixtureRows = fixtureSummary.rows || [];
    const fixtureStates = fixtureRows.reduce((acc, row) => {
      const key = String(row.state || (row.analysis_ready ? 'READY' : 'PENDING')).toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const databaseReady = ![jobs.error, locks.error, ledger.error, fixtureSummary.error].some(Boolean);
    return { ...base, databaseReady, jobs: jobs.rows || [], locks: locks.rows || [], ledger: ledger.rows || [], fixtureRows, fixtureStates };
  } catch (error) {
    rememberError('operations_snapshot', error);
    return { ...base, jobs: [], locks: [], ledger: [], error: error?.message || 'operations_unavailable' };
  }
}
