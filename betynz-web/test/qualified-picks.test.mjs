import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('consensus picks endpoint covers a seven-day pre-match window and freezes before kickoff', async () => {
  const server = await read('src/server.mjs');
  assert.match(server, /\/api\/qualified-picks/);
  assert.match(server, /\/api\/consensus-picks/);
  assert.match(server, /Math\.min\(7, Number\(days\)/);
  assert.match(server, /kickoff <= Date\.now\(\)/);
  assert.match(server, /CONSENSUS_FREEZE_MINUTES/);
  assert.match(server, /freezeConsensusSnapshots/);
});

test('consensus page clearly separates every public classification', async () => {
  const html = await read('public/picks.html');
  const js = await read('public/picks.js');
  for (const label of ['Consensus Bankers','Elite Bankers','Qualified Picks','Safer Picks','Engine Conflicts']) assert.match(html, new RegExp(label));
  for (const code of ['ELITE_BANKER','CONSENSUS_BANKER','QUALIFIED_PICK','SAFER_PICK','CONFLICT']) assert.match(js, new RegExp(code));
  assert.match(js, /\/api\/consensus-picks/);
  assert.match(html, /All engine involvement/);
  assert.match(js, /row\.engines/);
});

test('public files do not name the private odds provider', async () => {
  const files = [
    'public/index.html', 'public/app.js', 'public/picks.html', 'public/picks.js',
    'public/market-route.html', 'public/ppg-route.html', 'public/ppg-route.js', 'public/convergence.html', 'public/convergence.js', 'public/odds-movement.html', 'public/odds-movement.js',
    'public/proof.html', 'public/performance.html', 'public/live.html', 'public/leagues.html',
    'public/admin-engine-audit.html', 'public/admin-calibration.html', 'public/motion.js'
  ];
  const source = (await Promise.all(files.map(read))).join('\n');
  assert.equal(source.toLowerCase().includes(String.fromCharCode(115,112,111,114,116,121,98,101,116)), false);
});

test('homepage puts consensus command centre before the fixture board', async () => {
  const html = await read('public/index.html');
  const spotlight = html.indexOf('home-picks-spotlight');
  const board = html.indexOf('matches-panel');
  assert.ok(spotlight >= 0 && board > spotlight);
  assert.match(html, /Consensus Command Centre/);
  assert.match(html, /Today’s Elite Bankers/);
  assert.match(html, /Today’s Consensus Bankers/);
  assert.match(html, /Tomorrow’s Early Picks/);
});
