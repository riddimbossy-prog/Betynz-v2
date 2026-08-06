import { oddsBucket, profitForSettlement, settleMarket } from '../engines/settlement.mjs';
import { fetchResultsForDate, matchResultToPrediction } from './results.mjs';
import {
  getPendingSnapshots,
  getPredictionSnapshots,
  getPendingConsensusSnapshots,
  updateSnapshotSettlement,
  updateConsensusSettlement,
  upsertMatchResults
} from './supabase.mjs';

const pct = (a, b) => b ? Number((a / b * 100).toFixed(1)) : 0;
const round = value => Number((Number(value) || 0).toFixed(2));

export function summarizeSnapshots(rows = []) {
  const settled = rows.filter(row => ['WON', 'LOST', 'VOID', 'PUSH', 'REVIEW'].includes(row.settlement_status));
  const decisions = settled.filter(row => ['WON', 'LOST'].includes(row.settlement_status));
  const wins = decisions.filter(row => row.settlement_status === 'WON').length;
  const losses = decisions.filter(row => row.settlement_status === 'LOST').length;
  const profit = settled.reduce((sum, row) => sum + profitForSettlement(row.settlement_status, row.odds, 1), 0);
  const stake = decisions.length;
  return {
    total: rows.length,
    settled: settled.length,
    pending: rows.filter(row => ['PENDING', 'LIVE'].includes(row.settlement_status)).length,
    wins,
    losses,
    voids: settled.filter(row => row.settlement_status === 'VOID').length,
    pushes: settled.filter(row => row.settlement_status === 'PUSH').length,
    review: settled.filter(row => row.settlement_status === 'REVIEW').length,
    hitRate: pct(wins, wins + losses),
    profit: round(profit),
    roi: stake ? round(profit / stake * 100) : 0
  };
}

function groupRows(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].map(([key, items]) => ({ key, ...summarizeSnapshots(items), rows: items }));
}

export function buildPerformance(rows = []) {
  const settled = rows.filter(row => ['WON', 'LOST', 'VOID', 'PUSH'].includes(row.settlement_status));
  const byEngine = groupRows(settled, row => row.engine).map(item => ({ ...item, engine: item.key, rows: undefined }));
  const byMarket = groupRows(settled, row => `${row.engine}|${row.market}`).map(item => {
    const [engine, market] = item.key.split('|');
    return { ...item, engine, market, rows: undefined };
  });
  const byLeague = groupRows(settled, row => `${row.engine}|${row.country || ''}|${row.league_name || ''}`).map(item => {
    const [engine, country, league] = item.key.split('|');
    return { ...item, engine, country, league, rows: undefined };
  });
  const byOdds = groupRows(settled, row => `${row.engine}|${row.market}|${oddsBucket(row.odds)}`).map(item => {
    const [engine, market, bucket] = item.key.split('|');
    return { ...item, engine, market, bucket, rows: undefined };
  });
  return {
    summary: summarizeSnapshots(rows),
    byEngine: byEngine.sort((a, b) => b.settled - a.settled),
    byMarket: byMarket.sort((a, b) => b.settled - a.settled),
    byLeague: byLeague.sort((a, b) => b.settled - a.settled),
    byOdds: byOdds.sort((a, b) => b.settled - a.settled)
  };
}

export function buildLearningRecommendations(rows = []) {
  const perf = buildPerformance(rows);
  const patterns = perf.byOdds.map(item => {
    const stage = item.settled < 20 ? 'AUDIT' : item.settled < 40 ? 'PROVISIONAL' : item.settled < 100 ? 'ACTIVE' : 'ESTABLISHED';
    let recommendation = 'KEEP_AUDITING';
    if (stage === 'PROVISIONAL' && item.hitRate >= 72 && item.roi > 0) recommendation = 'REVIEW_FOR_PROMOTION';
    if (['ACTIVE', 'ESTABLISHED'].includes(stage) && item.hitRate >= 70 && item.roi > 0) recommendation = 'KEEP_ACTIVE';
    if (item.settled >= 20 && (item.hitRate < 60 || item.roi < -8)) recommendation = 'SUSPEND_AND_REVIEW';
    return { ...item, stage, recommendation };
  });
  return {
    summary: perf.summary,
    strongest: [...patterns].filter(item => item.settled >= 20).sort((a, b) => b.roi - a.roi || b.hitRate - a.hitRate).slice(0, 20),
    weakest: [...patterns].filter(item => item.settled >= 20).sort((a, b) => a.roi - b.roi || a.hitRate - b.hitRate).slice(0, 20),
    awaitingSample: patterns.filter(item => item.settled < 20).sort((a, b) => b.settled - a.settled).slice(0, 40),
    recommendations: patterns.filter(item => item.recommendation !== 'KEEP_AUDITING').slice(0, 60)
  };
}

export async function settleDate(date) {
  const [pending, pendingConsensus] = await Promise.all([
    getPendingSnapshots(date, 5000),
    getPendingConsensusSnapshots(date, 2000)
  ]);
  if (!pending.configured && !pendingConsensus.configured) return { date, configured: false, checked: 0, settled: 0, consensusSettled: 0, source: 'SUPABASE_NOT_CONFIGURED' };
  const results = await fetchResultsForDate(date);
  let settled = 0;
  let consensusSettled = 0;
  let matched = 0;
  let reviews = 0;
  const matchRows = [];

  async function settleRows(rows, updater, consensus = false) {
    for (const prediction of rows || []) {
      const match = matchResultToPrediction(prediction, results.rows);
      if (!match) continue;
      matched += 1;
      const outcome = settleMarket(prediction.market, { ...match.row.score, status: match.row.status });
      if (!['WON', 'LOST', 'VOID', 'PUSH', 'REVIEW'].includes(outcome)) continue;
      if (outcome === 'REVIEW') reviews += 1;
      else if (consensus) consensusSettled += 1;
      else settled += 1;
      await updater(prediction.id, {
        settlement_status: outcome,
        home_score: match.row.score?.home ?? null,
        away_score: match.row.score?.away ?? null,
        halftime_home_score: match.row.score?.htHome ?? null,
        halftime_away_score: match.row.score?.htAway ?? null,
        result_source: match.row.source,
        result_match_confidence: Math.round(match.confidence * 100),
        settled_at: new Date().toISOString(),
        profit_units: profitForSettlement(outcome, prediction.odds, 1),
        updated_at: new Date().toISOString()
      });
      matchRows.push({
        fixture_id: prediction.fixture_id,
        fixture_date: prediction.fixture_date,
        kickoff: prediction.kickoff,
        country: prediction.country,
        league_name: prediction.league_name,
        home_team: prediction.home_team,
        away_team: prediction.away_team,
        status: match.row.status,
        home_score: match.row.score?.home,
        away_score: match.row.score?.away,
        halftime_home_score: match.row.score?.htHome,
        halftime_away_score: match.row.score?.htAway,
        source: match.row.source,
        source_fixture_id: match.row.sourceId || null,
        payload: match.row
      });
    }
  }

  await settleRows(pending.rows, updateSnapshotSettlement, false);
  await settleRows(pendingConsensus.rows, updateConsensusSettlement, true);
  if (matchRows.length) {
    const unique = [...new Map(matchRows.map(row => [`${row.fixture_id}:${row.fixture_date}`, row])).values()];
    await upsertMatchResults(unique);
  }
  return {
    date,
    configured: true,
    checked: (pending.rows?.length || 0) + (pendingConsensus.rows?.length || 0),
    engineChecked: pending.rows?.length || 0,
    consensusChecked: pendingConsensus.rows?.length || 0,
    matched,
    settled,
    consensusSettled,
    reviews,
    calibrationRefreshReady: true,
    source: results.source
  };
}

export async function proofData({ from, to, engine, status, includePending = true, limit = 3000 } = {}) {
  const result = await getPredictionSnapshots({ from, to, engine, status, includePending, limit });
  return {
    configured: result.configured,
    error: result.error || null,
    rows: result.rows || [],
    summary: summarizeSnapshots(result.rows || [])
  };
}
