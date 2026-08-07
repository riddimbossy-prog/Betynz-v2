import { cacheGet, cacheSet } from './cache.mjs';
import { normalizeName, similarity } from './utils.mjs';
import { getApiFootballResults } from './apiFootball.mjs';

const finished = status => /^(FT|AET|PEN|FINISHED|ENDED|COMPLETED)$/i.test(String(status || ''));

function normalizedResults(fixtures) {
  return (fixtures || []).map(item => ({
    source: 'API_FOOTBALL',
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
  const key = `results:${date}:api-football-v1`;
  const hit = cacheGet(key);
  if (hit) return hit;
  let rows = [];
  try { rows = normalizedResults((await getApiFootballResults(date)).fixtures); } catch { rows = []; }
  const response = { date, rows, source: rows.length ? 'API_FOOTBALL' : 'UNAVAILABLE', generatedAt: new Date().toISOString() };
  cacheSet(key, response, Number(process.env.RESULTS_CACHE_TTL_SECONDS || 300));
  return response;
}

export function matchResultToPrediction(prediction, rows = []) {
  const sourceId = String(prediction?.source_fixture_id || prediction?.fixture_id || '');
  const direct = rows.find(row => row.sourceId && sourceId && String(row.sourceId) === sourceId);
  if (direct) return { row: direct, confidence: 1, identityMatch: 'EXACT_PROVIDER_FIXTURE_ID' };

  const home = prediction?.home_team || '';
  const away = prediction?.away_team || '';
  const predictionKickoff = Date.parse(prediction?.kickoff || 0);
  let best = null;
  for (const row of rows) {
    const homeScore = similarity(home, row.home);
    const awayScore = similarity(away, row.away);
    // Settlement never reverses the home/away orientation. A wrong settlement
    // is worse than leaving one row for manual review.
    if (homeScore < 0.82 || awayScore < 0.82) continue;
    let confidence = ((homeScore + awayScore) / 2) * 0.86;
    if (prediction?.league_name && row.league) confidence += normalizeName(prediction.league_name) === normalizeName(row.league) ? 0.05 : similarity(prediction.league_name, row.league) * 0.03;
    if (prediction?.country && row.country) confidence += normalizeName(prediction.country) === normalizeName(row.country) ? 0.02 : 0;
    const resultKickoff = Date.parse(row.kickoff || 0);
    if (Number.isFinite(predictionKickoff) && Number.isFinite(resultKickoff)) {
      const minutes = Math.abs(predictionKickoff - resultKickoff) / 60000;
      if (minutes <= 5) confidence += 0.07;
      else if (minutes <= 30) confidence += 0.05;
      else if (minutes <= 120) confidence += 0.02;
      else if (minutes > 360) continue;
    }
    confidence = Math.min(1, confidence);
    if (!best || confidence > best.confidence) best = { row, confidence, identityMatch: 'STRICT_FUZZY_TEAM_LEAGUE_KICKOFF' };
  }
  return best && best.confidence >= 0.90 ? best : null;
}
