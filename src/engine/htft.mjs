const ROWS = ['1/1','1/X','1/2','X/1','X/X','X/2','2/1','2/X','2/2'];

const HOME_FROM_TEAM = { 'W/W':'1/1','W/D':'1/X','W/L':'1/2','D/W':'X/1','D/D':'X/X','D/L':'X/2','L/W':'2/1','L/D':'2/X','L/L':'2/2' };
const AWAY_FROM_TEAM = { 'L/L':'1/1','L/D':'1/X','L/W':'1/2','D/L':'X/1','D/D':'X/X','D/W':'X/2','W/L':'2/1','W/D':'2/X','W/W':'2/2' };

export function emptyCounts() {
  return Object.fromEntries(ROWS.map(row => [row, 0]));
}

export function mapTeamRow(teamRow, side) {
  const table = side === 'away' ? AWAY_FROM_TEAM : HOME_FROM_TEAM;
  const counts = emptyCounts();
  for (const [from, to] of Object.entries(table)) counts[to] = Number(teamRow[from] || 0);
  return counts;
}

function sum(counts, rows) {
  return rows.reduce((total, row) => total + Number(counts[row] || 0), 0);
}

function rate(part, total) {
  return total ? part / total : null;
}

export function columnFromCounts(counts, { side, team, venueConfirmed }) {
  const n = Object.fromEntries(ROWS.map(row => [row, Number(counts[row] || 0)]));
  const N = ROWS.reduce((total, row) => total + n[row], 0);
  const H = rate(sum(n, ['1/1','X/1','2/1']), N);
  const X = rate(sum(n, ['1/X','X/X','2/X']), N);
  const A = rate(sum(n, ['1/2','X/2','2/2']), N);
  const g15 = sum(n, ['2/1','1/X','2/X','1/2']);
  const g25 = sum(n, ['2/1','1/2']);
  const C = g25;
  const L = sum(n, ['1/X','2/X']);
  const Omin = sum(n, ['1/X','X/X','2/X','2/1','1/2']);
  const D = sum(n, ['X/1','X/X','X/2','1/X','2/X']);
  return {
    side, team, venueConfirmed: Boolean(venueConfirmed), counts: n, N,
    H, X, A,
    home1X: rate(sum(n, ['1/1','X/1','2/1','1/X','X/X','2/X']), N),
    awayX2: rate(sum(n, ['1/X','X/X','2/X','1/2','X/2','2/2']), N),
    homeDnb: { win: sum(n, ['1/1','X/1','2/1']), push: sum(n, ['1/X','X/X','2/X']), lose: sum(n, ['1/2','X/2','2/2']) },
    awayDnb: { win: sum(n, ['1/2','X/2','2/2']), push: sum(n, ['1/X','X/X','2/X']), lose: sum(n, ['1/1','X/1','2/1']) },
    G15: rate(g15, N), Ggg: rate(g15, N), G25: rate(g25, N),
    C: rate(C, N), L: rate(L, N), Omin: rate(Omin, N), D: rate(D, N),
    cCount: C, lCount: L, ominCount: Omin, dCount: D, g15Count: g15, g25Count: g25,
  };
}

function avg(a, b) {
  if (a == null || b == null) return null;
  return (a + b) / 2;
}

function bothFavour(homeValue, awayValue, homeRest, awayRest) {
  return homeValue != null && awayValue != null && homeValue > homeRest[0] && homeValue > homeRest[1] && awayValue > awayRest[0] && awayValue > awayRest[1];
}

export function combineColumns(home, away) {
  const markets = [
    { id: 'home-win', label: 'Home win', market: '1X2', selection: 'Home', s: avg(home.H, away.H), agreed: bothFavour(home.H, away.H, [home.X, home.A], [away.X, away.A]) },
    { id: 'draw', label: 'Draw', market: '1X2', selection: 'Draw', s: avg(home.X, away.X), agreed: bothFavour(home.X, away.X, [home.H, home.A], [away.H, away.A]) },
    { id: 'away-win', label: 'Away win', market: '1X2', selection: 'Away', s: avg(home.A, away.A), agreed: bothFavour(home.A, away.A, [home.H, home.X], [away.H, away.X]) },
    { id: 'home-1x', label: 'Home 1X', market: 'Double Chance', selection: 'Home or Draw', s: avg(home.home1X, away.home1X), agreed: home.home1X > home.A && away.home1X > away.A },
    { id: 'away-x2', label: 'Away X2', market: 'Double Chance', selection: 'Draw or Away', s: avg(home.awayX2, away.awayX2), agreed: home.awayX2 > home.H && away.awayX2 > away.H },
    { id: 'home-dnb', label: 'Home DNB', market: 'Draw No Bet', selection: 'Home', s: avg(rate(home.homeDnb.win, home.N), rate(away.homeDnb.win, away.N)), agreed: home.homeDnb.win > home.homeDnb.lose && away.homeDnb.win > away.homeDnb.lose, pushes: { home: home.homeDnb.push, away: away.homeDnb.push } },
    { id: 'away-dnb', label: 'Away DNB', market: 'Draw No Bet', selection: 'Away', s: avg(rate(home.awayDnb.win, home.N), rate(away.awayDnb.win, away.N)), agreed: home.awayDnb.win > home.awayDnb.lose && away.awayDnb.win > away.awayDnb.lose, pushes: { home: home.awayDnb.push, away: away.awayDnb.push } },
  ];
  const agreed = markets.filter(item => item.agreed && item.s != null);
  agreed.sort((a, b) => b.s - a.s);
  const result = agreed.length && (agreed.length === 1 || agreed[0].s > agreed[1].s) ? agreed[0] : null;
  const goals = [
    { id: 'over-1.5', label: 'Over 1.5', market: 'Over/Under', selection: 'Over 1.5', s: avg(home.G15, away.G15), justified: home.g15Count > 0 && away.g15Count > 0 },
    { id: 'gg', label: 'GG', market: 'GG/NG', selection: 'Yes', s: avg(home.Ggg, away.Ggg), justified: home.g15Count > 0 && away.g15Count > 0 },
    { id: 'over-2.5', label: 'Over 2.5', market: 'Over/Under', selection: 'Over 2.5', s: avg(home.G25, away.G25), justified: home.g25Count > 0 && away.g25Count > 0 },
  ];
  const open = home.cCount >= 2 && away.cCount >= 2;
  const scarce = home.cCount === 0 && away.cCount === 0;
  const frequent = scarce && home.dCount > home.cCount && away.dCount > away.cCount && home.D > home.H && home.D > home.A && away.D > away.H && away.D > away.A;
  let route = 'no combo';
  if (!home.N || !away.N) route = 'no combo';
  else if (open) route = 'open';
  else if (frequent) route = 'closed';
  const goalsPick = goals.filter(item => item.justified).sort((a, b) => b.s - a.s)[0] || null;
  return {
    support: {
      homeWin: avg(home.H, away.H), draw: avg(home.X, away.X), awayWin: avg(home.A, away.A),
      home1X: avg(home.home1X, away.home1X), awayX2: avg(home.awayX2, away.awayX2),
      over15: avg(home.G15, away.G15), gg: avg(home.Ggg, away.Ggg), over25: avg(home.G25, away.G25),
      C: avg(home.C, away.C), L: avg(home.L, away.L), Omin: avg(home.Omin, away.Omin), D: avg(home.D, away.D),
    },
    route,
    result,
    goals: goalsPick,
    markets,
  };
}

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function inBand(odds, min, max) {
  return Number.isFinite(odds) && odds >= min && odds <= max;
}

export function gatePick(pick, markets, { minimumOdds = 1.2, maximumOdds = 1.5 } = {}) {
  if (!pick) return null;
  const wantedMarket = norm(pick.market);
  const wantedSelection = norm(pick.selection);
  for (const market of markets || []) {
    const name = norm(market.desc || market.name || market.market);
    const outcomes = market.outcomes || market.selections || [];
    for (const outcome of outcomes) {
      const label = norm(outcome.desc || outcome.name || outcome.selection);
      const active = outcome.isActive == null || Number(outcome.isActive) === 1 || outcome.active === true;
      const odds = Number(outcome.odds);
      const marketHit = name.includes(wantedMarket) || wantedMarket.includes(name);
      const selectionHit = label === wantedSelection || label.includes(wantedSelection) || wantedSelection.includes(label);
      if (active && marketHit && selectionHit && inBand(odds, minimumOdds, maximumOdds)) {
        return { ...pick, odds, sportybetMarket: market.desc || market.name, sportybetSelection: outcome.desc || outcome.name, gated: true };
      }
    }
  }
  return { ...pick, odds: null, gated: false, gateReason: `No active Sportybet price from ${minimumOdds.toFixed(2)} to ${maximumOdds.toFixed(2)}` };
}

export function applyHtft({ homeRow, awayRow, homeName, awayName, markets, minimumOdds, maximumOdds, venueConfirmed = true }) {
  if (!homeRow || !awayRow) {
    return { status: 'unavailable', route: 'no combo', pick: null, caveat: 'BetExplorer home or away HT/FT column was not found.' };
  }
  const home = columnFromCounts(mapTeamRow(homeRow, 'home'), { side: 'home', team: homeName, venueConfirmed });
  const away = columnFromCounts(mapTeamRow(awayRow, 'away'), { side: 'away', team: awayName, venueConfirmed });
  const combined = combineColumns(home, away);
  const result = gatePick(combined.result, markets, { minimumOdds, maximumOdds });
  const goals = gatePick(combined.goals, markets, { minimumOdds, maximumOdds });
  const published = [result, goals].filter(item => item?.gated).sort((a, b) => b.s - a.s)[0] || null;
  const caveat = [
    venueConfirmed ? 'Home column is BetExplorer home HT/FT. Away column is BetExplorer away HT/FT, translated into match codes.' : 'Venue filtering was not confirmed.',
    `Sample ${home.N} home and ${away.N} away. The average is a ranking aid, not a probability.`,
  ].join(' ');
  return {
    status: 'ready',
    source: 'BetExplorer',
    venueConfirmed,
    home, away, ...combined,
    gatedResult: result,
    gatedGoals: goals,
    pick: published,
    caveat,
  };
}
