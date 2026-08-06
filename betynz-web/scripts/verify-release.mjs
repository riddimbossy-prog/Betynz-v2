import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const required = [
  'package.json','package-lock.json','render.yaml','.env.example','src/server.mjs','src/lib/dataApi.mjs','src/lib/results.mjs',
  'src/engines/marketRoute.mjs','src/engines/ppgRoute.mjs','src/engines/convergence.mjs','src/engines/consensus.mjs','src/engines/settlement.mjs',
  'public/index.html','public/app.js','public/styles.css','public/motion.js','public/sw.js','public/picks.html','public/picks.js',
  'public/market-route.html','public/ppg-route.html','public/convergence.html','public/live.html','public/proof.html','public/performance.html',
  'public/admin-engine-audit.html','public/admin-calibration.html','DEPLOY_V3_8.md','V3_8_CHANGES.md','docs/SPORTYBET_CORE_API_CONTRACT.md'
];
for (const path of required) await access(resolve(root, path));

const forbiddenFiles = [
  'src/lib/oddsFeed.mjs','src/lib/apiFootball.mjs','src/engines/atlas8020.mjs','src/engines/oddsThreshold.mjs',
  'src/engines/counterOdds.mjs','src/engines/supervisor.mjs','public/atlas.html','public/odds-threshold.html',
  'public/counter-odds.html','public/best-picks.html'
];
for (const path of forbiddenFiles) {
  try { await access(resolve(root, path)); throw new Error(`Retired file remains: ${path}`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const read = path => readFile(resolve(root, path), 'utf8');
const [env, render, server, adapter, results, sw, pkgText, lockText, styles, motion] = await Promise.all([
  read('.env.example'),read('render.yaml'),read('src/server.mjs'),read('src/lib/dataApi.mjs'),read('src/lib/results.mjs'),
  read('public/sw.js'),read('package.json'),read('package-lock.json'),read('public/styles.css'),read('public/motion.js')
]);
const pkg = JSON.parse(pkgText);
const lock = JSON.parse(lockText);

if (!/BETYNZ_DATA_API_BASE_URL/.test(env) || !/BETYNZ_DATA_API_FIXTURES_PATH/.test(render)) throw new Error('Betynz Data API configuration is incomplete.');
if (/ODDS_FEED_|API_FOOTBALL_/i.test(`${env}\n${render}\n${server}\n${results}`)) throw new Error('A retired data-source configuration remains.');
const projectFiles = ['.env.example','render.yaml','src/server.mjs','src/lib/dataApi.mjs','src/lib/results.mjs','package.json'];
const projectText = (await Promise.all(projectFiles.map(read))).join('\n').toLowerCase();
for (const forbidden of ['parse.bot','betexplorer','api-football','api_football','odds_api','the-odds-api']) {
  if (projectText.includes(forbidden)) throw new Error(`A retired provider reference remains: ${forbidden}`);
}
if (!/const APP_VERSION = '3\.8\.0'/.test(server)) throw new Error('Server version is not 3.8.0.');
if (!/fetchDataApiFixtures/.test(server) || !/getDataApiIntelligence/.test(server)) throw new Error('Betynz Data API is not wired into the server.');
if (!/SPORTYBET_CUSTOM_API/.test(adapter) || !/getDataApiResults/.test(results)) throw new Error('SportyBet custom API data flow is incomplete.');
if (!/betynz-v3-8-0/.test(sw)) throw new Error('Service-worker cache was not bumped.');
if (pkg.version !== '3.8.0' || lock.version !== '3.8.0') throw new Error('Package versions are not 3.8.0.');
if (pkg.name !== 'betynz-custom-data-api-cinematic' || lock.name !== pkg.name) throw new Error('Package names do not match.');
if (!/@media\(max-width:380px\)/.test(styles) || !/@media\(min-width:600px\) and \(max-width:760px\)/.test(styles) || !/@media\(prefers-reduced-motion:reduce\)/.test(styles)) throw new Error('Responsive safeguards are missing.');
if (!/IntersectionObserver/.test(motion) || !/prefers-reduced-motion/.test(motion)) throw new Error('Motion accessibility safeguards are missing.');

const tests = (await readdir(resolve(root, 'test'))).sort();
const allowed = [
  'market-route.test.mjs','ppg-route.test.mjs','convergence.test.mjs','consensus.test.mjs','calibration.test.mjs','settlement.test.mjs',
  'three-engine-reset.test.mjs','qualified-picks.test.mjs','responsive-cinematic.test.mjs','custom-data-api.test.mjs','platform-smoke.test.mjs'
].sort();
if (JSON.stringify(tests) !== JSON.stringify(allowed)) throw new Error(`Unexpected test files remain: ${tests.join(', ')}`);

console.log('Release verification passed: Betynz 3.8.0 SportyBet-only core release.');
