import { cacheGet, cacheSet } from './cache.mjs';
import { normalizeName, similarity } from './utils.mjs';
import { getDataApiResults } from './dataApi.mjs';

const finished = status => /^(FT|AET|PEN|FINISHED|ENDED|COMPLETED)$/i.test(String(status || ''));

function dataApiResults(fixtures) {
  return (fixtures || []).map(item => ({
    source: 'SPORTYBET_CUSTOM_API',
    sourceId: String(item.sourceId || item.id || ''),
    kickoff: item.kickoff,
    status: item.status,
    league: item.league?.name || '',
    country: item.league?.country || '',
    home: item.home?.name || '',
    away: item.away?.name || '',
    homeId: item.home?.id || null,
    awayId: item.away?.id || null,
    score: item.score || item.result || null
  })).filter(row => row.home && row.away && (row.score || finished(row.status)));
}

export async function fetchResultsForDate(date) {
  const key = `results:${date}:custom-data-api-v1`;
  const hit = cacheGet(key);
  if (hit) return hit;
  let rows = [];
  try { rows = dataApiResults((await getDataApiResults(date)).fixtures); } catch { rows = []; }
  const response = { date, rows, source: rows.length ? 'SPORTYBET_CUSTOM_API' : 'UNAVAILABLE', generatedAt: new Date().toISOString() };
  cacheSet(key, response, Number(process.env.RESULTS_CACHE_TTL_SECONDS || 300));
  return response;
}

export function matchResultToPrediction(prediction, rows = []) {
  const sourceId = String(prediction?.source_fixture_id || prediction?.fixture_id || '');
  const direct = rows.find(row => row.sourceId && sourceId && String(row.sourceId) === sourceId);
  if (direct) return { row: direct, confidence: 1 };

  const home = prediction?.home_team || '';
  const away = prediction?.away_team || '';
  let best = null;
  for (const row of rows) {
    const directScore = (similarity(home, row.home) + similarity(away, row.away)) / 2;
    const reverseScore = (similarity(home, row.away) + similarity(away, row.home)) / 2;
    const score = Math.max(directScore, reverseScore * 0.7);
    const leagueBoost = prediction?.league_name && row.league && normalizeName(prediction.league_name) === normalizeName(row.league) ? 0.06 : 0;
    const confidence = Math.min(1, score + leagueBoost);
    if (!best || confidence > best.confidence) best = { row, confidence };
  }
  return best && best.confidence >= 0.72 ? best : null;
}
