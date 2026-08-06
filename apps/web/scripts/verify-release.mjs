import { access, readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '../..');
const read = path => readFile(resolve(appRoot, path), 'utf8');
const readRoot = path => readFile(resolve(repoRoot, path), 'utf8');

const required = [
  'src/server.mjs','src/lib/apiFootball.mjs','src/lib/results.mjs','src/lib/venueStats.mjs',
  'src/engines/marketRoute.mjs','src/engines/ppgRoute.mjs','src/engines/convergence.mjs','src/engines/consensus.mjs','src/engines/settlement.mjs',
  'public/index.html','public/app.js','public/styles.css','public/sw.js','public/live.html','public/live.js',
  'public/assets/betynz-logo.png','public/assets/betynz-mark.png',
  'docs/API_FOOTBALL_ONLY_CONTRACT.md','package.json','package-lock.json','.env.example'
];
for (const path of required) await access(resolve(appRoot, path));
for (const path of ['render.yaml','package.json','scripts/verify-single-render.mjs']) await access(resolve(repoRoot, path));

const [server, apiFootball, results, marketRoute, sw, styles, motion, env, render, rootPkgText, pkgText, lockText] = await Promise.all([
  read('src/server.mjs'), read('src/lib/apiFootball.mjs'), read('src/lib/results.mjs'), read('src/engines/marketRoute.mjs'),
  read('public/sw.js'), read('public/styles.css'), read('public/motion.js'), read('.env.example'), readRoot('render.yaml'), readRoot('package.json'), read('package.json'), read('package-lock.json')
]);

if (!/const APP_VERSION = '5\.0\.2'/.test(server)) throw new Error('Server version is not 5.0.2.');
for (const token of [
  'getApiFootballFixtureBoard','getApiFootballOddsForDate','getApiFootballLiveBoard','getApiFootballResults',
  'getApiFootballFixtureEvents','getApiFootballIntelligence','enrichApiFootballStatsBoard','enrichApiFootballVisuals','resolveApiFootballTeam'
]) if (!apiFootball.includes(token)) throw new Error(`API-Football contract is missing ${token}.`);
if (!/SOLE_FOOTBALL_DATA_PROVIDER/.test(apiFootball)) throw new Error('The sole-provider role is missing.');
if (!/ALL_DAILY_FIXTURES_RETURNED_BY_PROVIDER/.test(apiFootball)) throw new Error('Unlimited daily fixture scope is missing.');
if (!/API_FOOTBALL/.test(results)) throw new Error('Results are not wired to API-Football.');
if (!/STAT_CONFLICT/.test(marketRoute) || !/statisticalValidation/.test(marketRoute)) throw new Error('Market Route statistical gate is missing.');
if (!/betynz-v5-0-2/.test(sw)) throw new Error('Service-worker cache was not bumped to v5.0.2.');

for (const requiredKey of ['API_FOOTBALL_KEY','API_FOOTBALL_BASE_URL','API_FOOTBALL_KEY_HEADER','API_FOOTBALL_MAX_ODDS_PAGES']) {
  if (!env.includes(requiredKey) || !render.includes(requiredKey)) throw new Error(`Configuration is missing ${requiredKey}.`);
}
if ((render.match(/^\s*-\s+type:\s+web\s*$/gm) || []).length !== 1) throw new Error('Render must define exactly one web service.');
if (/API_FOOTBALL_MAX_FIXTURES/.test(render)) throw new Error('A daily fixture cap remains in Render configuration.');

const pkg = JSON.parse(pkgText);
const lock = JSON.parse(lockText);
const rootPkg = JSON.parse(rootPkgText);
if (pkg.version !== '5.0.2' || lock.version !== '5.0.2' || rootPkg.version !== '5.0.2') throw new Error('Package versions are not 5.0.2.');
if (pkg.name !== 'betynz-api-football-only-web' || lock.name !== pkg.name) throw new Error('Web package names do not match.');
if (rootPkg.name !== 'betynz-api-football-only') throw new Error('Root package name is incorrect.');
if (!/@media\s*\(max-width:\s*380px\)/.test(styles) || !/@media\s*\(min-width:\s*600px\)\s*and\s*\(max-width:\s*760px\)/.test(styles) || !/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(styles)) throw new Error('Responsive safeguards are missing.');
if (!/IntersectionObserver/.test(motion) || !/prefers-reduced-motion/.test(motion)) throw new Error('Motion accessibility safeguards are missing.');

const tests = (await readdir(resolve(appRoot, 'test'))).sort();
const allowed = [
  'market-route.test.mjs','ppg-route.test.mjs','convergence.test.mjs','consensus.test.mjs','calibration.test.mjs','settlement.test.mjs',
  'three-engine-reset.test.mjs','qualified-picks.test.mjs','responsive-cinematic.test.mjs','api-football.test.mjs','api-football-source.test.mjs','platform-smoke.test.mjs','progressive-engine-analysis.test.mjs'
].sort();
if (JSON.stringify(tests) !== JSON.stringify(allowed)) throw new Error(`Unexpected test files remain: ${tests.join(', ')}`);

console.log('Release verification passed: Betynz 5.0.2 API-Football-only single-service release.');
