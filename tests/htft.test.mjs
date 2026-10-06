import test from 'node:test';
import assert from 'node:assert/strict';
import { mapTeamRow, columnFromCounts, combineColumns, applyHtft } from '../src/engine/htft.mjs';
import { parseHtftTable, findTeam, leaguePath, BetexplorerHtft } from '../src/providers/betexplorer-htft.mjs';

test('away BetExplorer W/W is formula 2/2, an away win, not a home win', () => {
  const counts = mapTeamRow({ 'W/W': 3, 'L/L': 1 }, 'away');
  assert.equal(counts['2/2'], 3);
  assert.equal(counts['1/1'], 1);
});

test('home BetExplorer W/W is formula 1/1', () => {
  const counts = mapTeamRow({ 'W/W': 2, 'W/D': 1, 'L/W': 1 }, 'home');
  assert.equal(counts['1/1'], 2);
  assert.equal(counts['1/X'], 1);
  assert.equal(counts['2/1'], 1);
});

test('full comebacks in both columns choose the open route and confirm Over 2.5', () => {
  const home = columnFromCounts(mapTeamRow({ 'L/W': 2, 'W/D': 1, 'W/W': 2 }, 'home'), { side: 'home', venueConfirmed: true });
  const away = columnFromCounts(mapTeamRow({ 'L/W': 2, 'W/D': 1, 'L/L': 2 }, 'away'), { side: 'away', venueConfirmed: true });
  const combined = combineColumns(home, away);
  assert.equal(combined.route, 'open');
  assert.equal(home.g25Count, 2);
  assert.equal(away.g25Count, 2);
  assert.ok(combined.goals);
});

test('no comebacks and frequent HT-or-FT draws choose closed, not Under 2.5', () => {
  const home = columnFromCounts(mapTeamRow({ 'D/D': 3, 'D/W': 2, 'W/W': 1 }, 'home'), { side: 'home', venueConfirmed: true });
  const away = columnFromCounts(mapTeamRow({ 'D/D': 3, 'D/L': 2, 'L/L': 1 }, 'away'), { side: 'away', venueConfirmed: true });
  const combined = combineColumns(home, away);
  assert.equal(combined.route, 'closed');
  assert.equal(combined.goals, null);
});

test('sure markets publish from 1.20 up; a price under 1.20 is blocked', () => {
  const blocked = applyHtft({
    homeName: 'Chelsea', awayName: 'Bournemouth',
    homeRow: { 'W/W': 4, 'D/D': 1 },
    awayRow: { 'L/L': 4, 'D/D': 1 },
    markets: [{ desc: 'Double Chance', outcomes: [{ desc: 'Home or Draw', odds: '1.08', isActive: 1 }] }],
  });
  assert.equal(blocked.pick, null);
  assert.match(blocked.gatedResult.gateReason, /1\.20/);
  const sure = applyHtft({
    homeName: 'Chelsea', awayName: 'Bournemouth',
    homeRow: { 'W/W': 4, 'D/D': 1 },
    awayRow: { 'L/L': 4, 'D/D': 1 },
    markets: [{ desc: 'Double Chance', outcomes: [{ desc: 'Home or Draw', odds: '1.65', isActive: 1 }] }],
  });
  assert.equal(sure.pick.gated, true);
  assert.equal(sure.pick.odds, 1.65);
  assert.ok(sure.pick.s >= 0.9);
  const soft = applyHtft({
    homeName: 'Chelsea', awayName: 'Bournemouth',
    homeRow: { 'W/W': 6, 'D/D': 2, 'L/L': 2 },
    awayRow: { 'L/L': 6, 'D/D': 2, 'W/W': 2 },
    markets: [{ desc: 'Double Chance', outcomes: [{ desc: 'Home or Draw', odds: '1.35', isActive: 1 }] }],
  });
  assert.equal(soft.pick, null);
  assert.equal(soft.gatedResult.gated, false);
  assert.match(soft.gatedResult.gateReason, /90/);
});

test('parser reads the nine BetExplorer cells', () => {
  const html = '<table><tr><td>10.</td><td>Chelsea</td><td>5</td><td>2</td><td>0</td><td>0</td><td>0</td><td>0</td><td>2</td><td>0</td><td>1</td><td>0</td><td>7</td></tr></table>';
  const rows = parseHtftTable(html);
  assert.equal(findTeam(rows, 'Chelsea FC')['W/W'], 2);
  assert.equal(findTeam(rows, 'Chelsea FC')['L/D'], 1);
});

test('league paths use the BetExplorer slug, not the Sportybet name', () => {
  assert.equal(leaguePath({ country: 'Spain', name: 'LALIGA HYPERMOTION' }), 'spain/laliga2');
  assert.equal(leaguePath({ country: 'Turkiye', name: '1. Lig' }), 'turkey/1-lig');
  assert.equal(leaguePath({ country: 'Brazil', name: 'Brasileiro Serie A' }), 'brazil/serie-a-betano');
  assert.equal(leaguePath({ country: 'Brazil', name: 'Brasileiro Serie B' }), 'brazil/serie-b');
  assert.equal(leaguePath({ country: 'International', name: 'UEFA Nations League' }), 'europe/uefa-nations-league');
  assert.equal(leaguePath({ country: 'Czechia', name: 'FNL' }), 'czech-republic/chnl');
  assert.equal(leaguePath({ country: 'China', name: 'Chinese Super League' }), 'china/super-league');
  assert.equal(leaguePath({ country: 'Saudi Arabia', name: 'Saudi Pro League' }), 'saudi-arabia/saudi-professional-league');
  assert.equal(leaguePath({ country: 'Colombia', name: 'Liga DIMAYOR' }), 'colombia/primera-a');
  assert.equal(leaguePath({ country: 'England', name: 'Championship' }), 'england/championship');
});

test('a BetExplorer 429 is retried before the table is accepted', async () => {
  let calls = 0;
  const client = new BetexplorerHtft({
    interval: 0,
    retryWait: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 429, text: async () => '' };
      return { ok: true, status: 200, text: async () => 'ok' };
    },
  });
  assert.equal(await client.text('https://example.test/table'), 'ok');
  assert.equal(calls, 2);
});
