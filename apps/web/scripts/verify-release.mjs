import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const combinedRoot = resolve(root, '..', '..');
const required = [
  'package.json','package-lock.json','.env.example','src/server.mjs','src/lib/dataApi.mjs','src/lib/apiFootball.mjs','src/lib/results.mjs',
  'src/engines/marketRoute.mjs','src/engines/ppgRoute.mjs','src/engines/convergence.mjs','src/engines/consensus.mjs','src/engines/settlement.mjs',
  'public/index.html','public/app.js','public/styles.css','public/motion.js','public/sw.js','public/picks.html','public/picks.js',
  'public/market-route.html','public/ppg-route.html','public/convergence.html','public/live.html','public/proof.html','public/performance.html',
  'public/admin-engine-audit.html','public/admin-calibration.html','docs/SPORTYBET_CORE_API_CONTRACT.md','docs/API_FOOTBALL_ENRICHMENT.md'
];
for (const path of required) await access(resolve(root, path));
for (const path of ['render.yaml','scripts/start-combined.mjs','apps/sportybet-api/src/server.mjs']) await access(resolve(combinedRoot, path));

const forbiddenFiles = [
  'src/lib/oddsFeed.mjs','src/engines/atlas8020.mjs','src/engines/oddsThreshold.mjs',
  'src/engines/counterOdds.mjs','src/engines/supervisor.mjs','public/atlas.html','public/odds-threshold.html',
  'public/counter-odds.html','public/best-picks.html','render.yaml'
];
for (const path of forbiddenFiles) {
  try { await access(resolve(root, path)); throw new Error(`Retired or duplicate file remains: ${path}`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const read = path => readFile(resolve(root, path), 'utf8');
const readCombined = path => readFile(resolve(combinedRoot, path), 'utf8');
const [env, render, launcher, server, adapter, apiFootball, results, marketRoute, sw, pkgText, lockText, styles, motion] = await Promise.all([
  read('.env.example'),readCombined('render.yaml'),readCombined('scripts/start-combined.mjs'),read('src/server.mjs'),read('src/lib/dataApi.mjs'),
  read('src/lib/apiFootball.mjs'),read('src/lib/results.mjs'),read('src/engines/marketRoute.mjs'),read('public/sw.js'),read('package.json'),
  read('package-lock.json'),read('public/styles.css'),read('public/motion.js')
]);
const pkg = JSON.parse(pkgText);
const lock = JSON.parse(lockText);

if (!/BETYNZ_DATA_API_BASE_URL/.test(env) || !/BETYNZ_DATA_API_BASE_URL/.test(launcher)) throw new Error('Internal SportyBet API wiring is incomplete.');
for (const key of ['SPORTYBET_PUBLIC_UPCOMING_URL','SPORTYBET_PUBLIC_LIVE_URL','SPORTYBET_PUBLIC_RESULTS_URL','SPORTYBET_PUBLIC_EVENT_DETAIL_URL','API_FOOTBALL_KEY','API_FOOTBALL_BASE_URL','API_FOOTBALL_KEY_HEADER']) {
  if (!render.includes(key)) throw new Error(`Root Render configuration is missing ${key}.`);
}
if ((render.match(/^\s*-\s+type:\s+web\s*$/gm) || []).length !== 1) throw new Error('Root render.yaml must create exactly one web service.');
if (!/sync:\s*false/.test(render.split('API_FOOTBALL_KEY')[1]?.slice(0, 80) || '')) throw new Error('API_FOOTBALL_KEY must remain a private Render secret.');

const privateText = `${env}\n${render}\n${launcher}\n${server}\n${adapter}\n${apiFootball}\n${results}\n${pkgText}`.toLowerCase();
for (const forbidden of ['parse.bot','betexplorer','the-odds-api','odds_api']) {
  if (privateText.includes(forbidden)) throw new Error(`A retired provider reference remains: ${forbidden}`);
}
if (!/const APP_VERSION = '4\.0\.2'/.test(server)) throw new Error('Server version is not 4.0.2.');
if (!/fetchDataApiFixtures/.test(server) || !/enrichDataApiMarketOdds/.test(server)) throw new Error('SportyBet custom API is not wired into the server.');
if (!/enrichApiFootballStatsBoard/.test(server) || !/getApiFootballIntelligence/.test(server) || !/resolveApiFootballTeam/.test(server)) throw new Error('API-Football enrichment is not wired into the server.');
if (!/SPORTYBET_CUSTOM_API/.test(adapter) || !/getDataApiResults/.test(results)) throw new Error('SportyBet live/results data flow is incomplete.');
if (!/x-apisports-key/.test(apiFootball) || !/fixtures\/statistics/.test(apiFootball) || !/fixtures\/lineups/.test(apiFootball) || !/injuries/.test(apiFootball)) throw new Error('API-Football deep-stat contract is incomplete.');
if (!/STAT_CONFLICT/.test(marketRoute) || !/statisticalValidation/.test(marketRoute)) throw new Error('Market Route statistical gate is missing.');
if (!/betynz-v4-0-2/.test(sw)) throw new Error('Service-worker cache was not bumped.');
if (pkg.version !== '4.0.2' || lock.version !== '4.0.2') throw new Error('Package versions are not 4.0.2.');
if (pkg.name !== 'betynz-sportybet-api-football-intelligence' || lock.name !== pkg.name) throw new Error('Package names do not match.');
if (!/@media\(max-width:380px\)/.test(styles) || !/@media\(min-width:600px\) and \(max-width:760px\)/.test(styles) || !/@media\(prefers-reduced-motion:reduce\)/.test(styles)) throw new Error('Responsive safeguards are missing.');
if (!/IntersectionObserver/.test(motion) || !/prefers-reduced-motion/.test(motion)) throw new Error('Motion accessibility safeguards are missing.');

const tests = (await readdir(resolve(root, 'test'))).sort();
const allowed = [
  'market-route.test.mjs','ppg-route.test.mjs','convergence.test.mjs','consensus.test.mjs','calibration.test.mjs','settlement.test.mjs',
  'three-engine-reset.test.mjs','qualified-picks.test.mjs','responsive-cinematic.test.mjs','custom-data-api.test.mjs','api-football.test.mjs','platform-smoke.test.mjs'
].sort();
if (JSON.stringify(tests) !== JSON.stringify(allowed)) throw new Error(`Unexpected test files remain: ${tests.join(', ')}`);

console.log('Release verification passed: Betynz 4.0.2 SportyBet + API-Football intelligence release.');
