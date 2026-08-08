const MARKET_LABELS = {
  homeWin: 'Home Win', draw: 'Draw', awayWin: 'Away Win',
  homeDoubleChance: '1X', awayDoubleChance: 'X2', noDraw: '12',
  over05: 'Over 0.5', under05: 'Under 0.5', over15: 'Over 1.5', under15: 'Under 1.5',
  over25: 'Over 2.5', under25: 'Under 2.5', over35: 'Over 3.5', under35: 'Under 3.5',
  bttsYes: 'BTTS Yes', bttsNo: 'BTTS No',
  homeOver05: 'Home Over 0.5', homeUnder05: 'Home Under 0.5',
  awayOver05: 'Away Over 0.5', awayUnder05: 'Away Under 0.5',
  firstHalfOver05: '1H Over 0.5', firstHalfUnder05: '1H Under 0.5'
};

const price = value => Number(value) > 1 ? Number(value) : null;
const round = (value, places = 2) => Number(Number(value || 0).toFixed(places));

export function marketMovement(opening, current, high = null, low = null) {
  const start = price(opening);
  const end = price(current);
  if (!start || !end) return null;
  const change = round((end - start) / start * 100, 2);
  const probabilityChange = round(((1 / end) - (1 / start)) * 100, 2);
  return {
    opening: start,
    current: end,
    high: price(high) || Math.max(start, end),
    low: price(low) || Math.min(start, end),
    changePercent: change,
    impliedProbabilityChange: probabilityChange,
    direction: change < -0.25 ? 'SHORTENING' : change > 0.25 ? 'DRIFTING' : 'STABLE',
    strength: Math.abs(change) >= 10 ? 'STRONG' : Math.abs(change) >= 4 ? 'MODERATE' : 'LIGHT'
  };
}

export function summarizeOddsSnapshots(rows = [], options = {}) {
  const snapshots = [...rows]
    .filter(row => row && row.markets && typeof row.markets === 'object')
    .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
  if (!snapshots.length) return { fixtureId: options.fixtureId || null, snapshots: 0, markets: [], capturedAt: null };
  const keys = new Set(snapshots.flatMap(row => Object.keys(row.markets || {})));
  const kickoffMs = options.kickoff ? new Date(options.kickoff).getTime() : NaN;
  const movements = [];
  for (const key of keys) {
    const series = snapshots.map(row => ({ at: row.captured_at, value: price(row.markets?.[key]) })).filter(item => item.value);
    if (!series.length) continue;
    const values = series.map(item => item.value);
    const summary = marketMovement(series[0].value, series.at(-1).value, Math.max(...values), Math.min(...values));
    if (!summary) continue;
    const preKickoff = Number.isFinite(kickoffMs) ? series.filter(item => new Date(item.at).getTime() <= kickoffMs) : [];
    const closing = preKickoff.length && kickoffMs <= Date.now() ? preKickoff.at(-1).value : null;
    movements.push({
      market: key,
      label: MARKET_LABELS[key] || key,
      ...summary,
      closing,
      firstCapturedAt: series[0].at,
      lastCapturedAt: series.at(-1).at,
      observations: series.length,
      series
    });
  }
  movements.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  return {
    fixtureId: options.fixtureId || snapshots[0]?.fixture_id || null,
    snapshots: snapshots.length,
    bookmaker: snapshots.at(-1)?.bookmaker || 'Live odds feed',
    capturedAt: snapshots.at(-1)?.captured_at || null,
    markets: movements
  };
}

export function closingLineValue(frozenOdds, closingOdds) {
  const frozen = price(frozenOdds);
  const closing = price(closingOdds);
  if (!frozen || !closing) return null;
  const percent = round((frozen / closing - 1) * 100, 2);
  return {
    frozen,
    closing,
    percent,
    direction: percent > 0.25 ? 'POSITIVE' : percent < -0.25 ? 'NEGATIVE' : 'NEUTRAL'
  };
}

export { MARKET_LABELS };
