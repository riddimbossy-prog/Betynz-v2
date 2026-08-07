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
