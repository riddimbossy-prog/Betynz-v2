import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProgressiveBoard, mergeConsensusPayload } from '../public/api-client.js';
import { PREPARED_VIEW_KEYS, rememberPreparedView, getPreparedView } from '../src/lib/preparedViews.mjs';

function item(id, decision, market = null) {
  return {
    fixture: { id, kickoff: '2099-08-08T18:00:00Z', home: { name: `H${id}` }, away: { name: `A${id}` } },
    engine: { decision, selection: market ? { market, label: market, odds: 1.5, decision } : null }
  };
}

test('automatic polling cannot roll a fired engine card back to WAITING', () => {
  const previous = {
    date: '2099-08-08', complete: false, failed: false,
    progress: { processed: 7, total: 19, percent: 37 },
    all: [item(1, 'FIRE', 'over15')], qualified: [item(1, 'FIRE', 'over15')],
    summary: { fixtures: 19, analysed: 7, fire: 1 }
  };
  const incoming = {
    date: '2099-08-08', complete: false, failed: false,
    progress: { processed: 0, total: 19, percent: 0 },
    all: [item(1, 'WAITING'), item(2, 'WAITING')], qualified: [],
    summary: { fixtures: 19, analysed: 0, fire: 0 }
  };
  const merged = mergeProgressiveBoard(previous, incoming);
  assert.equal(merged.progress.processed, 7);
  assert.equal(merged.all.find(row => row.fixture.id === 1).engine.decision, 'FIRE');
  assert.equal(merged.qualified.length, 1);
  assert.equal(merged.summary.fire, 1);
});

test('complete browser snapshot stays visible while a server rebuild resumes polling', () => {
  const previous = {
    date: '2099-08-08', complete: true, failed: false,
    progress: { processed: 19, total: 19, percent: 100 },
    all: [item(1, 'FIRE', 'over15')], qualified: [item(1, 'FIRE', 'over15')]
  };
  const incoming = {
    date: '2099-08-08', complete: false, failed: false,
    progress: { processed: 0, total: 19, percent: 0 },
    all: [item(1, 'WAITING')], qualified: []
  };
  const merged = mergeProgressiveBoard(previous, incoming);
  assert.equal(merged.complete, false);
  assert.equal(merged.all[0].engine.decision, 'FIRE');
  assert.equal(merged.progress.processed, 19);
});

test('a genuinely analysed newer decision can replace an older fired card', () => {
  const previous = { date: '2099-08-08', complete: false, progress: { processed: 7, total: 19 }, all: [item(1, 'FIRE', 'over15')] };
  const incoming = { date: '2099-08-08', complete: false, progress: { processed: 8, total: 19 }, all: [item(1, 'CONFLICT')] };
  const merged = mergeProgressiveBoard(previous, incoming);
  assert.equal(merged.all[0].engine.decision, 'CONFLICT');
  assert.equal(merged.qualified.length, 0);
});

test('consensus polling preserves visible picks when progress regresses', () => {
  const row = { fixtureId: 44, date: '2099-08-08', classification: 'CONSENSUS_BANKER', final: { market: 'over15' } };
  const previous = {
    from: '2099-08-08', complete: false,
    progress: { processed: 7, total: 19, percent: 37 },
    consensus: { all: [row] }, enginePicks: [{ fixtureId: 44 }], summary: { consensus: 1 }
  };
  const incoming = {
    from: '2099-08-08', complete: false,
    progress: { processed: 0, total: 19, percent: 0 },
    consensus: { all: [] }, enginePicks: [], summary: { consensus: 0 }
  };
  const merged = mergeConsensusPayload(previous, incoming);
  assert.equal(merged.progress.processed, 7);
  assert.equal(merged.consensus.all.length, 1);
});

test('complete prepared intelligence is never downgraded by a partial refresh', () => {
  const date = '2099-10-18';
  rememberPreparedView(PREPARED_VIEW_KEYS.STATS_BUNDLE, date, { marker: 'complete', apex: { complete: true } }, { complete: true, generatedAt: '2099-10-18T01:00:00Z' });
  rememberPreparedView(PREPARED_VIEW_KEYS.STATS_BUNDLE, date, { marker: 'partial', apex: { complete: false } }, { complete: false, generatedAt: '2099-10-18T02:00:00Z' });
  const hit = getPreparedView(PREPARED_VIEW_KEYS.STATS_BUNDLE, date);
  assert.equal(hit.complete, true);
  assert.equal(hit.payload.marker, 'complete');
});
