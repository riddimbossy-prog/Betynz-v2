import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {calculateSplitStats,analyseMatch,analyseBoard}=require('./goldenBanker.cjs');
const {applyLowWinUnder35ToAnalysis}=require('./goldenUnder35.cjs');

const stats=calculateSplitStats([{gf:2,ga:0},{gf:1,ga:0},{gf:3,ga:1},{gf:2,ga:1},{gf:1,ga:0}]);
assert.equal(stats.ppg,3);
assert.equal(stats.avgGA,.4);

const dnb=analyseMatch({league:'T',homeTeam:'H',awayTeam:'A',homeLast5:[{gf:2,ga:0},{gf:1,ga:0},{gf:1,ga:1},{gf:2,ga:1},{gf:0,ga:0}],awayLast5:[{gf:0,ga:2},{gf:0,ga:1},{gf:1,ga:1},{gf:0,ga:3},{gf:0,ga:2}]});
assert.equal(dnb.markets.winDnb.dnbEligible,true);
assert.equal(dnb.markets.winDnb.straightWinEligible,false);

const forcedUnder=analyseMatch({
  league:'T',homeTeam:'Low Home',awayTeam:'Low Away',
  homeLast5:[{gf:3,ga:3},{gf:4,ga:5},{gf:2,ga:2},{gf:3,ga:4},{gf:5,ga:6}],
  awayLast5:[{gf:2,ga:2},{gf:3,ga:4},{gf:4,ga:4},{gf:2,ga:5},{gf:3,ga:6}]
});
assert.equal(forcedUnder.split.home.wins,0);
assert.equal(forcedUnder.split.away.wins,0);
assert.ok(forcedUnder.split.home.ppg<1);
assert.ok(forcedUnder.split.away.ppg<1);
assert.equal(forcedUnder.markets.under35.forced,true);
assert.equal(forcedUnder.finalRecommendation.primaryBet,'Under 3.5');
assert.equal(forcedUnder.finalRecommendation.score,10);
assert.equal(forcedUnder.finalRecommendation.hardOverride,true);
assert.equal(forcedUnder.banker,true);
assert.equal(forcedUnder.markets.over25.qualified,true,'Hard U3.5 must override even when the normal goals model strongly qualifies Over 2.5');

const legacyForced={
  ...forcedUnder,
  markets:{over25:forcedUnder.markets.over25,btts:forcedUnder.markets.btts,winDnb:forcedUnder.markets.winDnb},
  finalRecommendation:{primaryBet:'Over 2.5',score:9.4,confidence:'High',bankerStatus:'Banker',summary:'legacy pick'},
  banker:true,
};
const migratedForced=applyLowWinUnder35ToAnalysis(legacyForced);
assert.equal(migratedForced.markets.under35.forced,true);
assert.equal(migratedForced.finalRecommendation.primaryBet,'Under 3.5');
assert.equal(migratedForced.finalRecommendation.score,10);
assert.equal(migratedForced.finalRecommendation.hardOverride,true);
assert.equal(migratedForced.banker,true);

const legacyNormal={
  ...dnb,
  markets:{over25:dnb.markets.over25,btts:dnb.markets.btts,winDnb:dnb.markets.winDnb},
};
const migratedNormal=applyLowWinUnder35ToAnalysis(legacyNormal);
assert.equal(migratedNormal.markets.under35.forced,false);
assert.equal(migratedNormal.finalRecommendation.primaryBet,dnb.finalRecommendation.primaryBet,'Non-triggering cached picks must keep their prior primary market');

const exactTwenty=analyseMatch({
  league:'T',homeTeam:'20 Home',awayTeam:'0 Away',
  homeLast5:[{gf:1,ga:0},{gf:0,ga:1},{gf:0,ga:2},{gf:1,ga:2},{gf:0,ga:3}],
  awayLast5:[{gf:0,ga:1},{gf:0,ga:2},{gf:1,ga:2},{gf:0,ga:3},{gf:0,ga:4}]
});
assert.equal(exactTwenty.split.home.wins,1);
assert.equal(exactTwenty.split.home.ppg,.6);
assert.equal(exactTwenty.markets.under35.forced,false,'Exactly 20% wins must not trigger a strict under-20% rule');
assert.notEqual(exactTwenty.finalRecommendation.primaryBet,'Under 3.5');

const exactOnePPG=analyseMatch({
  league:'T',homeTeam:'Draw Home',awayTeam:'Low Away',
  homeLast5:[{gf:0,ga:0},{gf:1,ga:1},{gf:2,ga:2},{gf:3,ga:3},{gf:4,ga:4}],
  awayLast5:[{gf:0,ga:1},{gf:1,ga:1},{gf:0,ga:2},{gf:1,ga:2},{gf:0,ga:3}]
});
assert.equal(exactOnePPG.split.home.wins,0);
assert.equal(exactOnePPG.split.home.ppg,1);
assert.equal(exactOnePPG.markets.under35.forced,false,'Exactly 1.00 PPG must not trigger a strict below-1.00 rule');
assert.notEqual(exactOnePPG.finalRecommendation.primaryBet,'Under 3.5');

const board=analyseBoard(new Array(6).fill(0).map((_,i)=>({id:`m${i}`,league:'T',homeTeam:`H${i}`,awayTeam:`A${i}`,homeLast5:[{gf:3,ga:0},{gf:2,ga:0},{gf:3,ga:1},{gf:2,ga:1},{gf:3,ga:0}],awayLast5:[{gf:0,ga:3},{gf:0,ga:2},{gf:1,ga:4},{gf:0,ga:3},{gf:1,ga:4}]})));
assert.ok(board.topBankers.length<=4);

const html=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('./public/styles.css',import.meta.url),'utf8');
const compact=readFileSync(new URL('./public/compact-board.css',import.meta.url),'utf8');
const glassCss=readFileSync(new URL('./public/glass-orange.css',import.meta.url),'utf8');
const splashCss=readFileSync(new URL('./public/splash.css',import.meta.url),'utf8');
const splashJs=readFileSync(new URL('./public/splash.js',import.meta.url),'utf8');
const ratedHtml=readFileSync(new URL('./public/highly-rated.html',import.meta.url),'utf8');
const ratedJs=readFileSync(new URL('./public/highly-rated.js',import.meta.url),'utf8');
const ratedCss=readFileSync(new URL('./public/highly-rated.css',import.meta.url),'utf8');
const ratedLink=readFileSync(new URL('./public/rated-link.js',import.meta.url),'utf8');
const bangersHtml=readFileSync(new URL('./public/bangers.html',import.meta.url),'utf8');
const bangersJs=readFileSync(new URL('./public/bangers.js',import.meta.url),'utf8');
const bangersCss=readFileSync(new URL('./public/bangers.css',import.meta.url),'utf8');
const bangersSource=readFileSync(new URL('./goldenBangers.cjs',import.meta.url),'utf8');
const bangersScan=readFileSync(new URL('./bangersScan.mjs',import.meta.url),'utf8');
const precompute=readFileSync(new URL('./precompute.mjs',import.meta.url),'utf8');
const runtimeConfig=readFileSync(new URL('./runtimeConfig.mjs',import.meta.url),'utf8');
const runtimeBoard=readFileSync(new URL('./runtimeBoard.mjs',import.meta.url),'utf8');
const runtimeJobs=readFileSync(new URL('./runtimeJobs.mjs',import.meta.url),'utf8');
const under35Source=readFileSync(new URL('./goldenUnder35.cjs',import.meta.url),'utf8');
const serverSource=readFileSync(new URL('./server.mjs',import.meta.url),'utf8');
const splashAsset=new URL('../web/public/assets/zeus-board-loading.jpg',import.meta.url);

assert.match(html,/data-scope="CANDIDATES"/);
assert.match(html,/id="matchCentreToggle"/);
assert.match(html,/id="centreBody" hidden/);
assert.match(html,/id="pagination"/);
assert.match(html,/id="market"/);
assert.match(html,/value="UNDER35">Under 3\.5/);
assert.match(html,/id="confidence"/);
assert.match(html,/id="league"/);
assert.match(html,/id="moreHighlyRated"/);
assert.match(html,/highly-rated\.html/);
assert.match(html,/href="\/bangers\.html"/);
assert.match(html,/glass-orange\.css\?v=7\.0\.0/);
assert.match(html,/href="\/proof"/);
assert.match(html,/Zeus supervisor active/);
assert.match(html,/Published picks locked/);
assert.match(html,/id="boardSplash"/);
assert.match(html,/id="boardSplashMedia"/);
assert.match(html,/class="splash-active"/);
assert.doesNotMatch(html,/splashSharpen/);
assert.doesNotMatch(html,/feConvolveMatrix/);
assert.doesNotMatch(html,/id="boardSplashVideo"/);
assert.doesNotMatch(html,/zeus-board-loading\.jpg/);
assert.doesNotMatch(html,/preload" as="video"/);
assert.match(html,/BETYNZ\.COM/);
assert.match(js,/pageSize:\s*20/);
assert.match(js,/CANDIDATE/);
assert.match(js,/finalBankerIds/);
assert.match(js,/WAITING FOR 5\+5/);
assert.match(js,/Why this pick/);
assert.match(js,/exact home results/);
assert.match(js,/exact away results/);
assert.match(js,/bet==='Under 3\.5'/);
assert.match(js,/s\.h\+s\.a<=3\?'WON':'LOST'/);
assert.match(js,/marketCard\('Under 3\.5',a\.markets\.under35\)/);
assert.match(js,/Zeus/);
assert.match(compact,/\.status-badge\.candidate/);
assert.match(compact,/@media\(max-width:540px\)/);
assert.match(css,/@media\(max-width:620px\)/);
assert.match(glassCss,/--orange:#ff8a00/);
assert.match(glassCss,/backdrop-filter:blur\(18px\)/);
assert.match(glassCss,/\.banker-card:after/);
assert.match(glassCss,/\.status-badge\.candidate/);
assert.match(glassCss,/\.rated-card\.top-four/);
assert.match(glassCss,/@media\(max-width:540px\)/);
assert.match(splashCss,/\.board-splash__video/);
assert.match(splashCss,/object-fit:contain/);
assert.match(splashCss,/background:#000/);
assert.doesNotMatch(splashCss,/splashSharpen/);
assert.doesNotMatch(splashCss,/zeus-breathe/);
assert.doesNotMatch(splashCss,/zeus-board-loading\.jpg/);
assert.match(splashJs,/document\.createElement\('video'\)/);
assert.match(splashJs,/v\.play\(\)/);
assert.match(splashJs,/v\.loop=false/);
assert.match(splashJs,/boardReady&&mediaDone/);
assert.match(splashJs,/MAX_SPLASH_MS=3600/);
assert.match(splashJs,/v\.src='\/media\/zeus-thunder-original\.mp4'/);
assert.match(splashJs,/controlslist/);
assert.equal(existsSync(splashAsset),false,'Legacy Zeus loading poster must be removed');
assert.match(under35Source,/homeWinRate<0\.20/);
assert.match(under35Source,/awayWinRate<0\.20/);
assert.match(under35Source,/homeLowPPG=Number\(home\?\.ppg\)<1\.0/);
assert.match(under35Source,/awayLowPPG=Number\(away\?\.ppg\)<1\.0/);
assert.match(under35Source,/applyLowWinUnder35ToAnalysis/);
assert.match(runtimeBoard,/UNDER_3_5/);
assert.match(runtimeBoard,/upgradeAnalysisForCurrentRules/);
assert.match(runtimeBoard,/applyLowWinUnder35ToAnalysis/);
assert.match(runtimeBoard,/topRowsFromItems/);
assert.match(runtimeBoard,/trust|zeus/i);
assert.match(runtimeJobs,/m==='UNDER_3_5'/);
assert.match(runtimeJobs,/h\+a<=3\?'WON':'LOST'/);
assert.match(runtimeJobs,/ANALYSIS_LOCK_REVISION='trust-proof-v1'/);
assert.match(runtimeJobs,/ANALYSIS_LOCK_LEASE_SECONDS=Math\.min\(1800/);
assert.match(runtimeJobs,/renewJobLock\(lockKey,ANALYSIS_LOCK_LEASE_SECONDS\)/);
assert.match(runtimeJobs,/scheduleRetry\(date,force\)/);
assert.match(runtimeJobs,/upgradeAnalysisForCurrentRules\(old\.payload\.analysis,fixture\)/);
assert.match(runtimeJobs,/PRELOAD_DAYS_AHEAD=6/);
assert.match(runtimeJobs,/async function preloadUpcomingWeek\(\)/);
assert.match(runtimeJobs,/for\(let n=0;n<=PRELOAD_DAYS_AHEAD;n\+\+\)/);
assert.match(runtimeJobs,/queueMicrotask\(\(\)=>preloadUpcomingWeek\(\)\.catch\(\(\)=>null\)\)/);
assert.match(runtimeJobs,/preloadDaysAhead:PRELOAD_DAYS_AHEAD/);
assert.match(runtimeJobs,/proof/);
assert.match(runtimeConfig,/renewJobLock/);
assert.match(runtimeConfig,/apiFootballRequest/);
assert.match(serverSource,/zeus-thunder-original\.mp4/);
assert.match(serverSource,/readFile\(splashVideoPath\)/);
assert.match(serverSource,/function serveSplashVideo/);
assert.match(serverSource,/\/media\/zeus-thunder-original\.mp4/);
assert.match(serverSource,/content-type':'video\/mp4/);
assert.match(serverSource,/accept-ranges':'bytes/);
assert.match(serverSource,/content-range/);
assert.match(serverSource,/body\.length<1000000/);
assert.doesNotMatch(serverSource,/zeus-thunder\.part01/);
assert.doesNotMatch(serverSource,/Buffer\.from\(\[p1,p2,p3,p4,p5\]/);
assert.match(serverSource,/media-src 'self'/);
assert.match(serverSource,/\/api\/proof/);
assert.match(serverSource,/\/proof/);
assert.match(ratedHtml,/Highly Rated/);
assert.match(ratedHtml,/id="ratedGrid"/);
assert.match(ratedHtml,/value="UNDER35">Under 3\.5/);
assert.match(ratedHtml,/glass-orange\.css\?v=7\.0\.0/);
assert.match(ratedJs,/analysis\?\.banker/);
assert.match(ratedJs,/TOP 4 BANKER/);
assert.match(ratedJs,/HIGHLY RATED/);
assert.match(ratedJs,/View exact 5 \+ 5 maths/);
assert.match(ratedJs,/bet==='Under 3\.5'/);
assert.match(ratedJs,/markets\?\.under35/);
assert.match(ratedCss,/\.rated-card\.top-four/);
assert.match(ratedLink,/More Highly Rated Picks/);
assert.match(runtimeConfig,/\/media\/team\/\$\{id\}\.png/);
assert.match(serverSource,/media\.api-sports\.io\/football\/teams/);
assert.match(serverSource,/serveTeamCrest/);
assert.match(serverSource,/image\/jpeg/);
assert.match(serverSource,/max-age=604800, immutable/);

assert.match(bangersHtml,/STRICT OVER 2\.5 FINDER/);
assert.match(bangersHtml,/Odds 1\.20–1\.55/);
assert.match(bangersHtml,/Both leak ≥1\.90/);
assert.match(bangersHtml,/Both PPG &gt;1\.50/);
assert.match(bangersHtml,/Both score ≥1\.88/);
assert.match(bangersHtml,/Reject both Top 5/);
assert.match(bangersHtml,/Top 3 \/ Bottom 2/);
assert.match(bangersJs,/board\?\.bangers/);
assert.match(bangersJs,/BANGER MARKET/);
assert.match(bangersCss,/\.banger-card/);
assert.match(bangersSource,/over25OddMin:1\.20/);
assert.match(bangersSource,/over25OddMax:1\.55/);
assert.match(bangersSource,/minLeakAvgGA:1\.90/);
assert.match(bangersSource,/minPPGExclusive:1\.50/);
assert.match(bangersSource,/minAttackAvgGF:1\.88/);
assert.match(bangersSource,/notBothTopFive/);
assert.match(bangersSource,/extremeRank/);
assert.match(bangersScan,/calculateSplitTables/);
assert.match(bangersScan,/league:leagueId,season,status:'FT'/);
assert.match(bangersScan,/scanBangers/);
assert.match(precompute,/attachBangers/);
assert.match(precompute,/bangersReady:true/);
assert.match(precompute,/bangersFound:bangers\.length/);

console.log('Golden engine + Bangers + trust/proof/Zeus supervisor + settlement + UI + dynamic video-only splash tests passed');
