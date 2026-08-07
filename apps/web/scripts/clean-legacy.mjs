import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const removed = [];

async function remove(relativePath) {
  await rm(resolve(root, relativePath), { recursive: true, force: true });
  removed.push(relativePath);
}

const allowedTests = new Set([
  'market-route.test.mjs',
  'ppg-route.test.mjs',
  'apex-intelligence.test.mjs',
  'convergence.test.mjs',
  'momentum-streak.test.mjs',
  'consensus.test.mjs',
  'calibration.test.mjs',
  'settlement.test.mjs',
  'eight-engine-zeus.test.mjs',
  'zeus-intelligence.test.mjs',
  'streak-value.test.mjs',
  'htft-momentum.test.mjs',
  'transient-502-resilience.test.mjs',
  'qualified-picks.test.mjs',
  'responsive-cinematic.test.mjs',
  'api-football.test.mjs',
  'api-football-source.test.mjs',
  'platform-smoke.test.mjs',
  'progressive-engine-analysis.test.mjs',
  'fast-prediction-pipeline.test.mjs',
  'universal-odds-gate.test.mjs',
  'runtime-stability.test.mjs',
  'data-backed-validation.test.mjs',
  'adaptive-market-recovery.test.mjs'
]);

try {
  const entries = await readdir(resolve(root, 'test'), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && allowedTests.has(entry.name)) continue;
    await remove(`test/${entry.name}`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const retiredPaths = [
  'src/engines/atlas8020.mjs',
  'src/engines/atlas.mjs',
  'src/engines/oddsThreshold.mjs',
  'src/engines/counterOdds.mjs',
  'src/engines/supervisor.mjs',
  'src/lib/oddsFeed.mjs',
  'public/atlas.html',
  'public/atlas.js',
  'public/odds-threshold.html',
  'public/odds-threshold.js',
  'public/counter-odds.html',
  'public/counter-odds.js',
  'public/counter-odds-audit.html',
  'public/counter-odds-audit.js',
  'public/best-picks.html',
  'public/best-picks.js',
  'public/admin-data-quality.html',
  'public/admin-data-quality.js'
];

for (const path of retiredPaths) await remove(path);
console.log(`API-Football-only cleanup complete. ${removed.length} retired path(s) removed or confirmed absent.`);
