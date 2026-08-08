const FINISHED = new Set(['FT', 'AET', 'PEN', 'FINISHED', 'ENDED', 'COMPLETED']);
const VOIDED = new Set(['CANC', 'CANCELLED', 'ABD', 'ABANDONED', 'PST', 'POSTPONED', 'SUSP', 'SUSPENDED']);

const n = value => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

export function normalizedResult(input = {}) {
  const status = String(input.status || input.short || '').trim().toUpperCase();
  return {
    status,
    home: n(input.home ?? input.homeGoals ?? input.goals?.home),
    away: n(input.away ?? input.awayGoals ?? input.goals?.away),
    htHome: n(input.htHome ?? input.halftime?.home ?? input.score?.halftime?.home),
    htAway: n(input.htAway ?? input.halftime?.away ?? input.score?.halftime?.away)
  };
}

export function resultState(input = {}) {
  const result = normalizedResult(input);
  if (VOIDED.has(result.status)) return 'VOID';
  if (!FINISHED.has(result.status)) return 'PENDING';
  if (result.home == null || result.away == null) return 'REVIEW';
  return 'READY';
}

function totalOutcome(total, line, side) {
  if (total == null) return 'REVIEW';
  if (total === line) return 'PUSH';
  if (side === 'OVER') return total > line ? 'WON' : 'LOST';
  return total < line ? 'WON' : 'LOST';
}

function teamTotalOutcome(goals, line, side) {
  if (goals == null) return 'REVIEW';
  if (goals === line) return 'PUSH';
  if (side === 'OVER') return goals > line ? 'WON' : 'LOST';
  return goals < line ? 'WON' : 'LOST';
}

export function settleMarket(market, input = {}) {
  const result = normalizedResult(input);
  const state = resultState(result);
  if (state === 'VOID') return 'VOID';
  if (state !== 'READY') return state;

  const h = result.home;
  const a = result.away;
  const htH = result.htHome;
  const htA = result.htAway;
  const total = h + a;
  const code = String(market || '').trim().toUpperCase();

  if (code === 'HOME_WIN') return h > a ? 'WON' : 'LOST';
  if (code === 'AWAY_WIN') return a > h ? 'WON' : 'LOST';
  if (code === 'DRAW') return h === a ? 'WON' : 'LOST';
  if (['HOME_DOUBLE_CHANCE', 'DOUBLE_CHANCE_1X', '1X'].includes(code)) return h >= a ? 'WON' : 'LOST';
  if (['AWAY_DOUBLE_CHANCE', 'DOUBLE_CHANCE_X2', 'X2'].includes(code)) return a >= h ? 'WON' : 'LOST';
  if (['DOUBLE_CHANCE_12', '12'].includes(code)) return h !== a ? 'WON' : 'LOST';
  if (['HOME_DNB', 'DRAW_NO_BET_HOME'].includes(code)) return h === a ? 'PUSH' : h > a ? 'WON' : 'LOST';
  if (['AWAY_DNB', 'DRAW_NO_BET_AWAY'].includes(code)) return h === a ? 'PUSH' : a > h ? 'WON' : 'LOST';
  if (code === 'BTTS_YES') return h > 0 && a > 0 ? 'WON' : 'LOST';
  if (code === 'BTTS_NO') return h === 0 || a === 0 ? 'WON' : 'LOST';

  const totalMatch = code.match(/^(OVER|UNDER)_(\d+)_(\d+)$/);
  if (totalMatch) return totalOutcome(total, Number(`${totalMatch[2]}.${totalMatch[3]}`), totalMatch[1]);

  const homeTotal = code.match(/^HOME_(OVER|UNDER)_(\d+)_(\d+)$/);
  if (homeTotal) return teamTotalOutcome(h, Number(`${homeTotal[2]}.${homeTotal[3]}`), homeTotal[1]);

  const awayTotal = code.match(/^AWAY_(OVER|UNDER)_(\d+)_(\d+)$/);
  if (awayTotal) return teamTotalOutcome(a, Number(`${awayTotal[2]}.${awayTotal[3]}`), awayTotal[1]);

  const halfTotal = code.match(/^FIRST_HALF_(OVER|UNDER)_(\d+)_(\d+)$/);
  if (halfTotal) {
    if (htH == null || htA == null) return 'REVIEW';
    return totalOutcome(htH + htA, Number(`${halfTotal[2]}.${halfTotal[3]}`), halfTotal[1]);
  }

  const htft = code.match(/^HTFT_(HOME|DRAW|AWAY)_(HOME|DRAW|AWAY)$/);
  if (htft) {
    if (htH == null || htA == null) return 'REVIEW';
    const half = htH > htA ? 'HOME' : htA > htH ? 'AWAY' : 'DRAW';
    const full = h > a ? 'HOME' : a > h ? 'AWAY' : 'DRAW';
    return half === htft[1] && full === htft[2] ? 'WON' : 'LOST';
  }

  return 'REVIEW';
}

export function profitForSettlement(status, odds, stake = 1) {
  const price = Number(odds);
  const unit = Number(stake) || 1;
  if (status === 'WON' && Number.isFinite(price) && price > 1) return Number(((price - 1) * unit).toFixed(3));
  if (status === 'LOST') return -unit;
  return 0;
}

export function oddsBucket(odds) {
  const value = Number(odds);
  if (!Number.isFinite(value) || value <= 1) return 'UNKNOWN';
  if (value < 1.20) return '1.01-1.19';
  if (value < 1.30) return '1.20-1.29';
  if (value < 1.40) return '1.30-1.39';
  if (value < 1.60) return '1.40-1.59';
  if (value < 1.80) return '1.60-1.79';
  if (value < 2.00) return '1.80-1.99';
  if (value < 2.50) return '2.00-2.49';
  return '2.50+';
}
