import { access, readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '../..');
const read = path => readFile(resolve(appRoot, path), 'utf8');
const readRoot = path => readFile(resolve(repoRoot, path), 'utf8');

const required = [
  'src/server.mjs','src/lib/apiFootball.mjs','src/lib/results.mjs','src/lib/venueStats.mjs',
  'src/engines/marketRoute.mjs','src/engines/ppgRoute.mjs','src/engines/apexIntelligence.mjs','src/engines/convergence.mjs','src/engines/momentumStreak.mjs','src/engines/consensus.mjs','src/engines/settlement.mjs',
  'public/index.html','public/app.js','public/styles.css','public/sw.js','public/live.html','public/live.js',
  'public/ppg-route.html','public/ppg-route.js','public/apex-intelligence.html','public/apex-intelligence.js','public/momentum-streak.html','public/momentum-streak.js',
  'public/assets/betynz-logo.png','public/assets/betynz-mark.png','public/assets/favicon-16x16.png','public/assets/favicon-32x32.png','public/assets/apple-touch-icon.png','public/assets/maskable-192.png','public/assets/maskable-512.png','public/assets/pwa-splash-portrait.png','public/assets/pwa-splash-landscape.png','public/favicon.ico',
  'docs/API_FOOTBALL_ONLY_CONTRACT.md','docs/PPG_ROUTE_RULES.md','docs/APEX_INTELLIGENCE_RULES.md','docs/MOMENTUM_STREAK_RULES.md','docs/CONSENSUS_RULES.md',
  'sql/014_five_engine_ppg_apex.sql','package.json','package-lock.json','.env.example'
];
for (const path of required) await access(resolve(appRoot, path));
for (const path of ['render.yaml','package.json','scripts/verify-single-render.mjs','RELEASE_V5_0_10.md']) await access(resolve(repoRoot, path));

const [server, apiFootball, sw, styles, motion, env, render, rootPkgText, pkgText, lockText, indexHtml, appJs, picksHtml] = await Promise.all([
  read('src/server.mjs'), read('src/lib/apiFootball.mjs'), read('public/sw.js'), read('public/styles.css'), read('public/motion.js'), read('.env.example'), readRoot('render.yaml'), readRoot('package.json'), read('package.json'), read('package-lock.json'), read('public/index.html'), read('public/app.js'), read('public/picks.html')
]);

if (!/const APP_VERSION = '5\.0\.10'/.test(server)) throw new Error('Server version is not 5.0.10.');
for (const code of ['MARKET_ROUTE','PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK']) if (!server.includes(code)) throw new Error(`Missing engine ${code}.`);
for (const token of ['analyzeMarketRoute','analyzePpgRoute','analyzeApexIntelligence','analyzeConvergence','analyzeMomentumStreak']) if (!server.includes(token)) throw new Error(`Missing analysis function ${token}.`);
for (const route of ['market-route-board','ppg-route-board','apex-intelligence-board','convergence-route-board','momentum-streak-board']) if (!server.includes(route)) throw new Error(`Missing route ${route}.`);
for (const label of ['Market Route','PPG Route','Apex Intelligence','Convergence','Momentum']) if (!indexHtml.includes(label)) throw new Error(`Dashboard is missing ${label}.`);
if (!/FIVE ENGINES · SHARED DIRECTION/.test(indexHtml) || !/5\/5 agreement/.test(indexHtml) || !/4\/5 agreement/.test(indexHtml)) throw new Error('Five-engine consensus labels are missing.');
if (!/renderPpgEngine/.test(appJs) || !/renderApexEngine/.test(appJs)) throw new Error('PPG or Apex match-intelligence rendering is missing.');
if (!/betynz-v5-0-10/.test(sw) || !/ppg-route\.html/.test(sw)) throw new Error('Service-worker cache was not bumped or PPG is absent.');
if (!/five independent engines/i.test(picksHtml)) throw new Error('Picks page does not describe the five-engine system.');
if (!/grid-template-columns:repeat\(5/.test(styles) || !/brand-orange/.test(styles) || !/ppg-result-card/.test(styles)) throw new Error('Unified five-engine logo palette is missing.');
if (/IntersectionObserver|pointermove|data-lightning/.test(motion) || !/prefers-reduced-motion/.test(motion)) throw new Error('Minimal-motion safeguards are missing.');
for (const token of ['getApiFootballFixtureBoard','getApiFootballOddsForDate','getApiFootballLiveBoard','getApiFootballResults','getApiFootballFixtureEvents','getApiFootballIntelligence','enrichApiFootballStatsBoard','enrichApiFootballVisuals','resolveApiFootballTeam','apiFootballRateState','registerRateLimit','rateLimitMessage']) if (!apiFootball.includes(token)) throw new Error(`API-Football contract is missing ${token}.`);
if (!/apex-soft-pulse/.test(styles) || !/apexSoftReveal/.test(styles)) throw new Error('Light Apex motion treatment is missing.');
for (const requiredKey of ['API_FOOTBALL_KEY','API_FOOTBALL_BASE_URL','API_FOOTBALL_KEY_HEADER','API_FOOTBALL_MAX_ODDS_PAGES','API_FOOTBALL_REQUESTS_PER_MINUTE','API_FOOTBALL_RATE_LIMIT_RETRIES','API_FOOTBALL_RATE_LIMIT_COOLDOWN_MS']) if (!env.includes(requiredKey) || !render.includes(requiredKey)) throw new Error(`Configuration is missing ${requiredKey}.`);
if ((render.match(/^\s*-\s+type:\s+web\s*$/gm) || []).length !== 1) throw new Error('Render must define exactly one web service.');

const pkg = JSON.parse(pkgText);
const lock = JSON.parse(lockText);
const rootPkg = JSON.parse(rootPkgText);
if (pkg.version !== '5.0.10' || lock.version !== '5.0.10' || rootPkg.version !== '5.0.10') throw new Error('Package versions are not 5.0.10.');

const tests = (await readdir(resolve(appRoot, 'test'))).sort();
const allowed = [
  'apex-intelligence.test.mjs','api-football-source.test.mjs','api-football.test.mjs','calibration.test.mjs','consensus.test.mjs','convergence.test.mjs','fast-prediction-pipeline.test.mjs','five-engine-reset.test.mjs','market-route.test.mjs','momentum-streak.test.mjs','platform-smoke.test.mjs','ppg-route.test.mjs','progressive-engine-analysis.test.mjs','qualified-picks.test.mjs','responsive-cinematic.test.mjs','settlement.test.mjs'
].sort();
if (JSON.stringify(tests) !== JSON.stringify(allowed)) throw new Error(`Unexpected test files remain: ${tests.join(', ')}`);

console.log('Release verification passed: Betynz 5.0.10 adaptive rate-limit recovery edition.');
