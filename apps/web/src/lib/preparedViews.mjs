import { getPreparedIntelligenceViews, upsertPreparedIntelligenceViews } from './supabase.mjs';

const memory = new Map();
const inflight = new Map();

export const PREPARED_VIEW_KEYS = Object.freeze({
  FIXTURE_BOARD: 'FIXTURE_BOARD',
  MARKET_ROUTE: 'MARKET_ROUTE',
  STATS_BUNDLE: 'STATS_BUNDLE',
  STREAK_VALUE: 'STREAK_VALUE',
  ZEUS: 'ZEUS',
  CONSENSUS_DAY: 'CONSENSUS_DAY'
});

function maxEntries() {
  return Math.max(42, Math.min(512, Number(process.env.PREPARED_VIEW_MAX_ENTRIES || 128)));
}

function keyOf(viewKey, date) {
  return `${String(viewKey || '').toUpperCase()}:${date}`;
}

function prune() {
  while (memory.size > maxEntries()) memory.delete(memory.keys().next().value);
}

function safeClone(value) {
  try { return JSON.parse(JSON.stringify(value ?? null)); }
  catch { return null; }
}

export function rememberPreparedView(viewKey, date, payload, { complete = true, generatedAt = new Date().toISOString() } = {}) {
  if (!viewKey || !date || payload == null) return null;
  const key = keyOf(viewKey, date);
  const record = {
    viewKey: String(viewKey).toUpperCase(),
    fixtureDate: date,
    complete: Boolean(complete),
    generatedAt,
    payload: safeClone(payload)
  };
  if (memory.has(key)) memory.delete(key);
  memory.set(key, record);
  prune();
  return record;
}

export function getPreparedView(viewKey, date, { completeOnly = true } = {}) {
  const key = keyOf(viewKey, date);
  const hit = memory.get(key) || null;
  if (!hit || (completeOnly && !hit.complete)) return null;
  memory.delete(key);
  memory.set(key, hit);
  return hit;
}

export function deletePreparedView(viewKey, date) {
  return memory.delete(keyOf(viewKey, date));
}

export function preparedViewStats() {
  const rows = [...memory.values()];
  return {
    entries: rows.length,
    maxEntries: maxEntries(),
    complete: rows.filter(row => row.complete).length,
    dates: [...new Set(rows.map(row => row.fixtureDate))].sort(),
    viewKeys: [...new Set(rows.map(row => row.viewKey))].sort(),
    inflight: inflight.size
  };
}

export async function persistPreparedViews(records = []) {
  const rows = records.filter(Boolean).map(record => ({
    view_key: record.viewKey,
    fixture_date: record.fixtureDate,
    complete: Boolean(record.complete),
    payload: safeClone(record.payload),
    generated_at: record.generatedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
  if (!rows.length) return { stored: false, reason: 'empty' };
  const batchKey = rows.map(row => `${row.view_key}:${row.fixture_date}`).sort().join('|');
  if (inflight.has(batchKey)) return inflight.get(batchKey);
  const task = upsertPreparedIntelligenceViews(rows).finally(() => inflight.delete(batchKey));
  inflight.set(batchKey, task);
  return task;
}

export async function persistPreparedView(viewKey, date, payload, options = {}) {
  const record = rememberPreparedView(viewKey, date, payload, options);
  if (!record) return { stored: false, reason: 'invalid' };
  return persistPreparedViews([record]);
}

export async function hydratePreparedViews({ from, to, limit = 160 } = {}) {
  const result = await getPreparedIntelligenceViews({ from, to, limit });
  for (const row of result.rows || []) {
    if (!row?.view_key || !row?.fixture_date || row?.payload == null) continue;
    rememberPreparedView(row.view_key, row.fixture_date, row.payload, {
      complete: row.complete !== false,
      generatedAt: row.generated_at || row.updated_at || new Date().toISOString()
    });
  }
  return { configured: result.configured, error: result.error || null, loaded: (result.rows || []).length, stats: preparedViewStats() };
}

export function preparedFixtureCounts(from, days, addDays) {
  const count = Math.max(1, Math.min(14, Number(days) || 7));
  const rows = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = addDays(from, offset);
    const record = getPreparedView(PREPARED_VIEW_KEYS.FIXTURE_BOARD, date);
    const fixtureCount = Number(record?.payload?.fixtures?.length);
    if (!Number.isFinite(fixtureCount)) return null;
    rows.push({ date, count: fixtureCount, prepared: true, generatedAt: record.generatedAt });
  }
  return { from, to: rows.at(-1)?.date || from, days: count, counts: rows, prepared: true };
}
