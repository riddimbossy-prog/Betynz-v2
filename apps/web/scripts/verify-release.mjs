import { access, readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repoRoot=resolve(appRoot,'../..');
const read=p=>readFile(resolve(appRoot,p),'utf8');
const readRoot=p=>readFile(resolve(repoRoot,p),'utf8');
const VERSION='5.1.0';

const required=[
  'src/server.mjs','src/lib/apiFootball.mjs','src/lib/statsApi.mjs','src/lib/venueStats.mjs',
  'src/lib/identityRegistry.mjs','src/lib/featureStore.mjs','src/lib/requestGuard.mjs','src/lib/telemetry.mjs',
  'src/engines/evidenceIndependence.mjs','src/engines/predictionLineage.mjs',
  'src/engines/marketRoute.mjs','src/engines/ppgRoute.mjs','src/engines/apexIntelligence.mjs','src/engines/convergence.mjs',
  'src/engines/momentumStreak.mjs','src/engines/streakValue.mjs','src/engines/htftMomentum.mjs','src/engines/zeusIntelligence.mjs',
  'src/engines/universalOddsGate.mjs','src/engines/dataBackedValidation.mjs','src/engines/adaptiveMarketRecovery.mjs','src/engines/consensus.mjs',
  'public/index.html','public/engine-lab.html','public/app.js','public/api-client.js','public/data-backed-ui.js','public/styles.css','public/sw.js',
  'public/zeus.html','public/zeus.js','sql/016_zeus_statistical_supervisor.sql','sql/017_foundation_intelligence.sql','package.json','package-lock.json','.env.example'
];
for(const p of required) await access(resolve(appRoot,p));
for(const p of ['render.yaml','package.json','scripts/verify-single-render.mjs','RELEASE_V5_1_0.md']) await access(resolve(repoRoot,p));

const [server,stats,api,sw,styles,env,render,rootPkgText,pkgText,lockText,index,picks,lab,consensus,calibration,results,requestGuard]=await Promise.all([
  read('src/server.mjs'),read('src/lib/statsApi.mjs'),read('src/lib/apiFootball.mjs'),read('public/sw.js'),read('public/styles.css'),read('.env.example'),readRoot('render.yaml'),readRoot('package.json'),read('package.json'),read('package-lock.json'),read('public/index.html'),read('public/picks.html'),read('public/engine-lab.html'),read('src/engines/consensus.mjs'),read('src/lib/calibration.mjs'),read('src/lib/results.mjs'),read('src/lib/requestGuard.mjs')
]);

if(!new RegExp(`const APP_VERSION = '${VERSION.replaceAll('.','\\.')}'`).test(server)) throw new Error(`Server version is not ${VERSION}.`);
for(const code of ['MARKET_ROUTE','PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK','STREAK_VALUE','HTFT_MOMENTUM','ZEUS_SUPERVISOR']) if(!server.includes(code)) throw new Error(`Missing engine/supervisor ${code}.`);
for(const token of ['buildPredictionLineage','featureStoreStats','publicAnalysisDateState','telemetrySnapshot','logPredictionLineage','persistFeatureSnapshots']) if(!server.includes(token)) throw new Error(`Missing foundation wiring ${token}.`);
for(const route of ['streak-value-board','htft-momentum-board','zeus-board','ppg-route-board','apex-intelligence-board','convergence-route-board','momentum-streak-board','admin/telemetry']) if(!server.includes(route)) throw new Error(`Missing route ${route}.`);
if(!/Engine Lab/.test(index)||!/Zeus Intelligence/.test(index)||/href="\/admin-calibration\.html"/.test(index)) throw new Error('Public navigation was not simplified.');
for(const label of ['Market Route','PPG Route','Apex Intelligence','Convergence','Momentum & Streak','Atlas Streak Value','Chronos HT/FT','Zeus Intelligence']) if(!lab.includes(label)) throw new Error(`Engine Lab missing ${label}.`);
if(!/effectiveEvidence/.test(consensus)||!/correlationAdjustedConfidence/.test(consensus)) throw new Error('Correlation-aware Consensus missing.');
for(const metric of ['brierScore','logLoss','marketBrierScore','averageClosingLineValue','observedWinRate95CI','buildEngineErrorCorrelation']) if(!calibration.includes(metric)) throw new Error(`Calibration metric missing: ${metric}`);
if(!/STRICT_FUZZY_TEAM_LEAGUE_KICKOFF/.test(results)||!/>= 0\.90/.test(results)) throw new Error('Strict settlement identity protection missing.');
if(!/HISTORICAL_ANALYSIS_LOCKED/.test(requestGuard)||!/ANALYSIS_WINDOW_EXCEEDED/.test(requestGuard)) throw new Error('Historical/future analysis guard missing.');
for(const key of ['FEATURE_STORE_MAX_ENTRIES','PRECOMPUTE_ENABLED','PUBLIC_API_REQUESTS_PER_MINUTE','STATS_API_MAPPING_THRESHOLD']) if(!render.includes(key)||!env.includes(key)) throw new Error(`Foundation env setting missing ${key}.`);
if(!/value: "0\.82"/.test(render)) throw new Error('Stats API mapping threshold is not hardened to 0.82.');
if(!/api\.thestatsapi\.com/.test(stats)||!/date_to/.test(stats)||!/mappingSource/.test(stats)) throw new Error('Stats API cutoff/identity mapping incomplete.');
if(!/htftHomeHome/.test(api)) throw new Error('API-Football HT/FT normalization missing.');
if(!/betynz-v5-1-0/.test(sw)||!/engine-lab\.html/.test(sw)||!/api-client\.js/.test(sw)) throw new Error('PWA foundation shell incomplete.');
if(!/engine-lab-page/.test(styles)||!/independence-meta/.test(styles)) throw new Error('Foundation UI styles missing.');
if(!/seven specialist engines/i.test(picks)||!/Zeus/i.test(picks)) throw new Error('Picks copy is not foundation-aware.');
if((render.match(/^\s*-\s+type:\s+web\s*$/gm)||[]).length!==1) throw new Error('Render must define one web service.');

const pkg=JSON.parse(pkgText),lock=JSON.parse(lockText),rootPkg=JSON.parse(rootPkgText);
if(pkg.version!==VERSION||lock.version!==VERSION||rootPkg.version!==VERSION) throw new Error(`Package versions are not ${VERSION}.`);

const sql=await read('sql/017_foundation_intelligence.sql');
for(const table of ['prediction_lineage','provider_identity_map','feature_snapshots']) if(!sql.includes(table)) throw new Error(`Foundation migration missing ${table}.`);
const gate=await read('src/engines/universalOddsGate.mjs');
if(!/MIN_ODDS = 1\.20/.test(gate)||!/MAX_ODDS = 2\.00/.test(gate)) throw new Error('Universal 1.20–2.00 odds gate is missing.');
const adaptive=await read('src/engines/adaptiveMarketRecovery.mjs');
if(!/evaluatedCandidates/.test(adaptive)||!/searchPenalty/.test(adaptive)) throw new Error('Adaptive recovery audit/multiple-comparison control missing.');
const validator=await read('src/engines/dataBackedValidation.mjs');
if(!/validationDiversity/.test(validator)||!/independentlyCorroborated/.test(validator)) throw new Error('Data-validation source-diversity reporting missing.');

const tests=(await readdir(resolve(appRoot,'test'))).sort();
for(const name of ['foundation-intelligence.test.mjs','universal-odds-gate.test.mjs','runtime-stability.test.mjs','data-backed-validation.test.mjs','adaptive-market-recovery.test.mjs']) if(!tests.includes(name)) throw new Error(`Missing test ${name}.`);
console.log(`Release verification passed: Betynz ${VERSION} Foundation Intelligence with correlation-aware Consensus, forward calibration, lineage, canonical identity mapping, feature precomputation, historical integrity and Zeus supervision; ${tests.length} test files.`);
