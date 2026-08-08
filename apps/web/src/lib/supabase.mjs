import { configuredValue } from './env.mjs';

function credentials() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return configuredValue(url) && configuredValue(key) ? { url: url.replace(/\/$/, ''), key } : null;
}

function headers(config, extra = {}) {
  return {
    apikey: config.key,
    authorization: `Bearer ${config.key}`,
    'content-type': 'application/json',
    ...extra
  };
}


async function rpc(functionName, payload = {}) {
  const config = credentials();
  if (!config) return { ok: false, configured: false, reason: 'not_configured', data: null };
  const response = await fetch(`${config.url}/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(payload)
  });
  if (!response.ok) return { ok: false, configured: true, reason: `http_${response.status}`, detail: await response.text().catch(() => ''), data: null };
  let data = null;
  try { data = await response.json(); } catch {}
  return { ok: true, configured: true, data };
}

async function upsert(table, rows, onConflict) {
  const config = credentials();
  if (!config || !rows?.length) return { stored: false, reason: 'not_configured' };
  const conflict = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const response = await fetch(`${config.url}/rest/v1/${table}${conflict}`, {
    method: 'POST',
    headers: headers(config, { prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows)
  });
  if (!response.ok) return { stored: false, reason: `http_${response.status}`, detail: await response.text().catch(() => '') };
  return { stored: true };
}

async function insertIgnore(table, rows, onConflict) {
  const config = credentials();
  if (!config || !rows?.length) return { stored: false, reason: 'not_configured' };
  const conflict = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const response = await fetch(`${config.url}/rest/v1/${table}${conflict}`, {
    method: 'POST',
    headers: headers(config, { prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify(rows)
  });
  if (!response.ok) return { stored: false, reason: `http_${response.status}`, detail: await response.text().catch(() => '') };
  return { stored: true };
}

async function selectRows(table, params = {}) {
  const config = credentials();
  if (!config) return { rows: [], configured: false };
  const query = new URLSearchParams();
  query.set('select', params.select || '*');
  for (const [key, value] of Object.entries(params.filters || {})) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  if (params.order) query.set('order', params.order);
  if (params.limit) query.set('limit', String(params.limit));
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, { headers: headers(config) });
  if (!response.ok) return { rows: [], configured: true, error: `http_${response.status}` };
  return { rows: await response.json(), configured: true };
}

async function deleteRows(table, filters) {
  const config = credentials();
  if (!config) return { deleted: false, reason: 'not_configured' };
  const query = new URLSearchParams(filters || {});
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: headers(config, { prefer: 'return=minimal' })
  });
  if (!response.ok) return { deleted: false, reason: `http_${response.status}`, detail: await response.text().catch(() => '') };
  return { deleted: true };
}

async function patchRows(table, filters, payload) {
  const config = credentials();
  if (!config) return { updated: false, reason: 'not_configured' };
  const query = new URLSearchParams(filters || {});
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: headers(config, { prefer: 'return=minimal' }),
    body: JSON.stringify(payload)
  });
  if (!response.ok) return { updated: false, reason: `http_${response.status}`, detail: await response.text().catch(() => '') };
  return { updated: true };
}

export function supabaseConfigured() {
  return Boolean(credentials());
}


export function logEnginePredictions(rows) {
  return upsert('engine_predictions', rows, 'fixture_id,engine,market,fixture_date');
}


export function freezePredictionSnapshots(rows) {
  return insertIgnore('prediction_snapshots', rows, 'fixture_id,engine,fixture_date');
}

export function logOddsSnapshots(rows) {
  return insertIgnore('odds_snapshots', rows, 'fixture_id,captured_at');
}

export function upsertMatchResults(rows) {
  return upsert('match_results', rows, 'fixture_id,fixture_date');
}


export function getPredictionSnapshots({ from, to, engine, status, limit = 3000, includePending = true } = {}) {
  const filters = {};
  if (from) filters.fixture_date = `gte.${from}`;
  if (to) filters['fixture_date'] = filters.fixture_date ? `${filters.fixture_date}` : `lte.${to}`;
  if (from && to) {
    delete filters.fixture_date;
    filters['and'] = `(fixture_date.gte.${from},fixture_date.lte.${to})`;
  }
  if (engine && engine !== 'ALL') filters.engine = `eq.${engine}`;
  if (status && status !== 'ALL') filters.settlement_status = `eq.${status}`;
  else if (!includePending) filters.settlement_status = 'in.(WON,LOST,VOID,PUSH,REVIEW)';
  return selectRows('prediction_snapshots', { filters, order: 'fixture_date.desc,kickoff.desc', limit });
}

export function getPendingSnapshots(date, limit = 1000) {
  return selectRows('prediction_snapshots', {
    filters: { fixture_date: `eq.${date}`, settlement_status: 'in.(PENDING,LIVE)' },
    order: 'kickoff.asc', limit
  });
}

export function updateSnapshotSettlement(id, payload) {
  return patchRows('prediction_snapshots', { id: `eq.${id}` }, payload);
}

export function getMatchResults({ from, to, limit = 3000 } = {}) {
  const filters = {};
  if (from && to) filters.and = `(fixture_date.gte.${from},fixture_date.lte.${to})`;
  else if (from) filters.fixture_date = `gte.${from}`;
  else if (to) filters.fixture_date = `lte.${to}`;
  return selectRows('match_results', { filters, order: 'fixture_date.desc', limit });
}


export function getOddsSnapshots({ fixtureId, from, to, limit = 500 } = {}) {
  const filters = {};
  if (fixtureId) filters.fixture_id = `eq.${fixtureId}`;
  if (from && to) filters.and = `(captured_at.gte.${from},captured_at.lte.${to})`;
  else if (from) filters.captured_at = `gte.${from}`;
  else if (to) filters.captured_at = `lte.${to}`;
  return selectRows('odds_snapshots', { filters, order: 'captured_at.asc', limit });
}

export function upsertConsensusCandidates(rows) {
  return upsert('consensus_candidates', rows, 'fixture_id,fixture_date');
}

export function freezeConsensusSnapshots(rows) {
  return insertIgnore('consensus_snapshots', rows, 'fixture_id,fixture_date');
}

export function getConsensusCandidates({ from, to, limit = 3000 } = {}) {
  const filters = {};
  if (from && to) filters.and = `(fixture_date.gte.${from},fixture_date.lte.${to})`;
  else if (from) filters.fixture_date = `gte.${from}`;
  else if (to) filters.fixture_date = `lte.${to}`;
  return selectRows('consensus_candidates', { filters, order: 'fixture_date.asc,kickoff.asc', limit });
}

export function getConsensusSnapshots({ from, to, status, limit = 3000, includePending = true } = {}) {
  const filters = {};
  if (from && to) filters.and = `(fixture_date.gte.${from},fixture_date.lte.${to})`;
  else if (from) filters.fixture_date = `gte.${from}`;
  else if (to) filters.fixture_date = `lte.${to}`;
  if (status && status !== 'ALL') filters.settlement_status = `eq.${status}`;
  else if (!includePending) filters.settlement_status = 'in.(WON,LOST,VOID,PUSH,REVIEW)';
  return selectRows('consensus_snapshots', { filters, order: 'fixture_date.desc,kickoff.desc', limit });
}

export function getPendingConsensusSnapshots(date, limit = 1000) {
  return selectRows('consensus_snapshots', {
    filters: { fixture_date: `eq.${date}`, settlement_status: 'in.(PENDING,LIVE)' },
    order: 'kickoff.asc', limit
  });
}

export function updateConsensusSettlement(id, payload) {
  return patchRows('consensus_snapshots', { id: `eq.${id}` }, payload);
}

export function logPredictionLineage(rows) {
  return upsert('prediction_lineage', rows, 'fixture_id,engine,fixture_date');
}

export function upsertFeatureSnapshots(rows) {
  return upsert('feature_snapshots', rows, 'fixture_id,fixture_date');
}

export function upsertProviderIdentityMappings(rows) {
  return upsert('provider_identity_map', rows, 'canonical_key,provider');
}

export function getProviderIdentityMappings({ provider, canonicalKey, limit = 5000 } = {}) {
  const filters = {};
  if (provider) filters.provider = `eq.${provider}`;
  if (canonicalKey) filters.canonical_key = `eq.${canonicalKey}`;
  return selectRows('provider_identity_map', { filters, order: 'verified.desc,updated_at.desc', limit });
}

export function getFeatureSnapshots({ date, fixtureId, limit = 1000 } = {}) {
  const filters = {};
  if (date) filters.fixture_date = `eq.${date}`;
  if (fixtureId) filters.fixture_id = `eq.${fixtureId}`;
  return selectRows('feature_snapshots', { filters, order: 'updated_at.desc', limit });
}


export function upsertPreparedIntelligenceViews(rows) {
  return upsert('prepared_intelligence_views', rows, 'view_key,fixture_date');
}

export function getPreparedIntelligenceViews({ from, to, viewKey, date, limit = 200 } = {}) {
  const filters = {};
  if (from && to) filters.and = `(fixture_date.gte.${from},fixture_date.lte.${to})`;
  else if (from) filters.fixture_date = `gte.${from}`;
  else if (to) filters.fixture_date = `lte.${to}`;
  if (date) filters.fixture_date = `eq.${date}`;
  if (viewKey) filters.view_key = `eq.${viewKey}`;
  return selectRows('prepared_intelligence_views', { filters, order: 'fixture_date.asc,view_key.asc', limit });
}


// v5.2.0 Persistence Core --------------------------------------------------

export function upsertPredictionLedger(rows) {
  return upsert('prediction_ledger', rows, 'fixture_id,engine,fingerprint');
}

export function getPredictionLedger({ from, to, engine, status, limit = 500 } = {}) {
  const filters = {};
  if (from && to) filters.and = `(fixture_date.gte.${from},fixture_date.lte.${to})`;
  else if (from) filters.fixture_date = `gte.${from}`;
  else if (to) filters.fixture_date = `lte.${to}`;
  if (engine && engine !== 'ALL') filters.engine = `eq.${engine}`;
  if (status && status !== 'ALL') filters.settlement_status = `eq.${status}`;
  return selectRows('prediction_ledger', { filters, order: 'fixture_date.desc,kickoff.desc', limit });
}

export function upsertFixtureProcessingStates(rows) {
  return upsert('fixture_processing_state', rows, 'fixture_date,fixture_id');
}

export function getFixtureProcessingStates({ date, state, limit = 5000 } = {}) {
  const filters = {};
  if (date) filters.fixture_date = `eq.${date}`;
  if (state) filters.state = `eq.${state}`;
  return selectRows('fixture_processing_state', { filters, order: 'updated_at.asc', limit });
}

export function upsertPersistenceJobRun(row) {
  return upsert('persistence_job_runs', [row], 'job_key');
}

export function getPersistenceJobRuns({ jobKey, state, limit = 100 } = {}) {
  const filters = {};
  if (jobKey) filters.job_key = `eq.${jobKey}`;
  if (state) filters.state = `eq.${state}`;
  return selectRows('persistence_job_runs', { filters, order: 'updated_at.desc', limit });
}

export function getPersistenceLocks({ limit = 100 } = {}) {
  return selectRows('persistence_job_locks', { order: 'updated_at.desc', limit });
}

export async function acquirePersistenceLock(lockKey, owner, leaseSeconds = 900) {
  const result = await rpc('betynz_acquire_job_lock', { p_lock_key: lockKey, p_owner: owner, p_lease_seconds: leaseSeconds });
  return { ...result, acquired: result.ok && result.data === true };
}

export async function renewPersistenceLock(lockKey, owner, leaseSeconds = 900) {
  const result = await rpc('betynz_renew_job_lock', { p_lock_key: lockKey, p_owner: owner, p_lease_seconds: leaseSeconds });
  return { ...result, renewed: result.ok && result.data === true };
}

export async function releasePersistenceLock(lockKey, owner) {
  const result = await rpc('betynz_release_job_lock', { p_lock_key: lockKey, p_owner: owner });
  return { ...result, released: result.ok && result.data === true };
}

export async function persistBoardSnapshot({ boardKey, date, complete = false, processed = 0, total = 0, payload = {}, generatedAt = null } = {}) {
  const result = await rpc('betynz_upsert_board_snapshot', {
    p_board_key: boardKey,
    p_fixture_date: date,
    p_complete: Boolean(complete),
    p_progress_processed: Math.max(0, Number(processed) || 0),
    p_progress_total: Math.max(0, Number(total) || 0),
    p_payload: payload || {},
    p_generated_at: generatedAt || new Date().toISOString()
  });
  return { ...result, stored: result.ok && result.data === true };
}

export function getBoardSnapshots({ from, to, date, boardKey, limit = 100 } = {}) {
  const filters = {};
  if (from && to) filters.and = `(fixture_date.gte.${from},fixture_date.lte.${to})`;
  else if (date) filters.fixture_date = `eq.${date}`;
  else if (from) filters.fixture_date = `gte.${from}`;
  else if (to) filters.fixture_date = `lte.${to}`;
  if (boardKey) filters.board_key = `eq.${boardKey}`;
  return selectRows('board_snapshots', { filters, order: 'fixture_date.asc,updated_at.desc', limit });
}

export function deleteFixtureProcessingState(date, fixtureId) {
  return deleteRows('fixture_processing_state', { fixture_date: `eq.${date}`, fixture_id: `eq.${fixtureId}` });
}

export function getFixtureProcessingSummary(date, limit = 5000) {
  const filters = {};
  if (date) filters.fixture_date = `eq.${date}`;
  return selectRows('fixture_processing_state', {
    select: 'fixture_id,fixture_date,state,stage,analysis_ready,attempts,last_error,completed_at,updated_at',
    filters, order: 'updated_at.desc', limit
  });
}

export function updatePredictionLedgerSettlement(prediction, payload) {
  if (!prediction?.fixture_id || !prediction?.engine) return Promise.resolve({ updated: false, reason: 'missing_identity' });
  const filters = { fixture_id: `eq.${prediction.fixture_id}`, engine: `eq.${prediction.engine}` };
  if (prediction.market) filters.market = `eq.${prediction.market}`;
  if (prediction.selection_label) filters.selection_label = `eq.${prediction.selection_label}`;
  return patchRows('prediction_ledger', filters, payload);
}
