import { upsertFeatureSnapshots, getFeatureSnapshots } from './supabase.mjs';

const memory = new Map();
const inflight = new Map();
const keyOf = (date, fixtureId) => `${date}:${fixtureId}`;

function maxEntries() {
  return Math.max(100, Math.min(5000, Number(process.env.FEATURE_STORE_MAX_ENTRIES || 1200)));
}

function prune() {
  while (memory.size > maxEntries()) memory.delete(memory.keys().next().value);
}

function safeJson(value) {
  try { return JSON.parse(JSON.stringify(value ?? null)); } catch { return null; }
}

export function featureStoreStats() {
  return { entries: memory.size, maxEntries: maxEntries(), inflight: inflight.size };
}

export function rememberFeatureSnapshot({ date, fixture, venueForm = null, statsEvidence = null, zeus = null, engines = [] } = {}) {
  if (!date || !fixture?.id) return null;
  const key = keyOf(date, fixture.id);
  const snapshot = {
    fixtureId: String(fixture.id),
    fixtureDate: date,
    kickoff: fixture.kickoff || null,
    dataQuality: Number(zeus?.dataQuality || 0) || null,
    identity: {
      sourceFixtureId: fixture.sourceId || fixture.id || null,
      leagueId: fixture.league?.id || null,
      homeId: fixture.home?.id || null,
      awayId: fixture.away?.id || null,
      home: fixture.home?.name || null,
      away: fixture.away?.name || null
    },
    venueForm: safeJson(venueForm),
    statsEvidence: safeJson(statsEvidence),
    zeus: safeJson(zeus ? { confidence: zeus.confidence, dataQuality: zeus.dataQuality, dominantDirection: zeus.dominantDirection, decision: zeus.decision, evidenceFamilies: zeus.evidenceFamilies, contradictions: zeus.contradictions } : null),
    engines: safeJson(engines),
    generatedAt: new Date().toISOString()
  };
  if (memory.has(key)) memory.delete(key);
  memory.set(key, snapshot);
  prune();
  return snapshot;
}

export function getRememberedFeatureSnapshot(date, fixtureId) {
  const key = keyOf(date, fixtureId);
  const hit = memory.get(key) || null;
  if (hit) { memory.delete(key); memory.set(key, hit); }
  return hit;
}

export function persistFeatureSnapshots(snapshots = []) {
  const rows = snapshots.filter(Boolean).map(snapshot => ({
    fixture_id: snapshot.fixtureId,
    fixture_date: snapshot.fixtureDate,
    kickoff: snapshot.kickoff,
    data_quality: snapshot.dataQuality,
    features: snapshot,
    updated_at: new Date().toISOString()
  }));
  if (!rows.length) return Promise.resolve({ stored: false, reason: 'empty' });
  const batchKey = rows.map(row => `${row.fixture_date}:${row.fixture_id}`).sort().join('|');
  if (inflight.has(batchKey)) return inflight.get(batchKey);
  const task = upsertFeatureSnapshots(rows).finally(() => inflight.delete(batchKey));
  inflight.set(batchKey, task);
  return task;
}

export async function loadFeatureSnapshot(date, fixtureId) {
  const local = getRememberedFeatureSnapshot(date, fixtureId);
  if (local) return local;
  const result = await getFeatureSnapshots({ date, fixtureId, limit: 1 });
  const row = result.rows?.[0];
  if (!row?.features) return null;
  const snapshot = row.features;
  memory.set(keyOf(date, fixtureId), snapshot);
  prune();
  return snapshot;
}
