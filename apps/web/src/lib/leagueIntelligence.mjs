const round = (value, places = 1) => Number(Number(value || 0).toFixed(places));

function statusFor(sample, hitRate, roi, coverage = 100) {
  if (coverage < 50 || sample < 10) return 'INSUFFICIENT_DATA';
  if (sample >= 40 && hitRate >= 72 && roi > 0) return 'TRUSTED';
  if (sample >= 20 && hitRate >= 60 && roi >= -3) return 'PROVISIONAL';
  if (sample >= 20 && (hitRate < 48 || roi < -12)) return 'AVOID';
  return 'VOLATILE';
}

export function buildLeagueIntelligence(predictions = [], results = []) {
  const map = new Map();
  const resultMap = new Map(results.map(row => [`${row.fixture_id}|${row.fixture_date}`, row]));
  for (const row of predictions) {
    const country = row.country || 'International';
    const league = row.league_name || 'Unknown league';
    const key = `${country}|${league}`;
    const bucket = map.get(key) || {
      country, league, predictions: 0, settled: 0, wins: 0, losses: 0, voids: 0,
      profit: 0, markets: new Map(), fixtures: new Set(), goals: []
    };
    bucket.predictions += 1;
    bucket.fixtures.add(`${row.fixture_id}|${row.fixture_date}`);
    const settlement = String(row.settlement_status || '').toUpperCase();
    if (['WON', 'LOST', 'VOID', 'PUSH', 'REVIEW'].includes(settlement)) bucket.settled += 1;
    if (settlement === 'WON') bucket.wins += 1;
    if (settlement === 'LOST') bucket.losses += 1;
    if (['VOID', 'PUSH'].includes(settlement)) bucket.voids += 1;
    bucket.profit += Number(row.profit_units || 0);
    const market = row.market || 'UNKNOWN';
    const marketRow = bucket.markets.get(market) || { market, sample: 0, wins: 0, losses: 0, profit: 0 };
    if (['WON', 'LOST'].includes(settlement)) marketRow.sample += 1;
    if (settlement === 'WON') marketRow.wins += 1;
    if (settlement === 'LOST') marketRow.losses += 1;
    marketRow.profit += Number(row.profit_units || 0);
    bucket.markets.set(market, marketRow);
    map.set(key, bucket);
  }

  for (const bucket of map.values()) {
    for (const fixtureKey of bucket.fixtures) {
      const result = resultMap.get(fixtureKey);
      if (result && Number.isFinite(Number(result.home_score)) && Number.isFinite(Number(result.away_score))) {
        bucket.goals.push(Number(result.home_score) + Number(result.away_score));
      }
    }
  }

  return [...map.values()].map(bucket => {
    const decisions = bucket.wins + bucket.losses;
    const hitRate = decisions ? bucket.wins / decisions * 100 : 0;
    const roi = decisions ? bucket.profit / decisions * 100 : 0;
    const coverage = bucket.predictions ? bucket.settled / bucket.predictions * 100 : 0;
    const markets = [...bucket.markets.values()].map(item => ({
      ...item,
      hitRate: item.sample ? round(item.wins / item.sample * 100) : 0,
      roi: item.sample ? round(item.profit / item.sample * 100) : 0
    })).sort((a, b) => b.sample - a.sample || b.hitRate - a.hitRate);
    return {
      country: bucket.country,
      league: bucket.league,
      predictions: bucket.predictions,
      settled: bucket.settled,
      sample: decisions,
      wins: bucket.wins,
      losses: bucket.losses,
      hitRate: round(hitRate),
      roi: round(roi),
      settlementCoverage: round(coverage),
      averageGoals: bucket.goals.length ? round(bucket.goals.reduce((sum, value) => sum + value, 0) / bucket.goals.length, 2) : null,
      bestMarket: markets.filter(item => item.sample >= 3).sort((a, b) => b.hitRate - a.hitRate || b.roi - a.roi)[0] || null,
      weakestMarket: markets.filter(item => item.sample >= 3).sort((a, b) => a.hitRate - b.hitRate || a.roi - b.roi)[0] || null,
      markets,
      classification: statusFor(decisions, hitRate, roi, coverage)
    };
  }).sort((a, b) => b.sample - a.sample || b.hitRate - a.hitRate);
}
