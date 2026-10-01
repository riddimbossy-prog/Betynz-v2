import test from 'node:test';
import assert from 'node:assert/strict';
import { mapTeamRow, columnFromCounts, combineColumns, applyHtft } from '../src/engine/htft.mjs';
import { parseHtftTable, findTeam } from '../src/providers/betexplorer-htft.mjs';

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

test('Sportybet gate blocks a formula pick outside 1.20-1.50', () => {
  const card = applyHtft({
    homeName: 'Chelsea', awayName: 'Bournemouth',
    homeRow: { 'W/W': 4, 'D/D': 1 },
    awayRow: { 'L/L': 4, 'D/D': 1 },
    markets: [{ desc: 'Double Chance', outcomes: [{ desc: 'Home or Draw', odds: '1.08', isActive: 1 }] }],
  });
  assert.equal(card.pick, null);
  assert.equal(card.gatedResult.gated, false);
});

test('parser reads the nine BetExplorer cells', () => {
  const html = '<table><tr><td>10.</td><td>Chelsea</td><td>5</td><td>2</td><td>0</td><td>0</td><td>0</td><td>0</td><td>2</td><td>0</td><td>1</td><td>0</td><td>7</td></tr></table>';
  const rows = parseHtftTable(html);
  assert.equal(findTeam(rows, 'Chelsea FC')['W/W'], 2);
  assert.equal(findTeam(rows, 'Chelsea FC')['L/D'], 1);
});
