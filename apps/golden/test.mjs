import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {calculateSplitStats,analyseMatch,analyseBoard}=require('./goldenBanker.cjs');
const {applyLowWinUnder35ToAnalysis}=require('./goldenUnder35.cjs');
const {evaluateBanger}=require('./goldenBangers.cjs');

// Core Golden Banker maths remains protected.
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
assert.equal(forcedUnder.markets.under35.forced,true);
assert.equal(forcedUnder.finalRecommendation.primaryBet,'Under 3.5');
assert.equal(forcedUnder.finalRecommendation.score,10);
assert.equal(forcedUnder.finalRecommendation.hardOverride,true);
assert.equal(forcedUnder.banker,true);

const legacyForced={...forcedUnder,markets:{over25:forcedUnder.markets.over25,btts:forcedUnder.markets.btts,winDnb:forcedUnder.markets.winDnb},finalRecommendation:{primaryBet:'Over 2.5',score:9.4,confidence:'High',bankerStatus:'Banker',summary:'legacy pick'},banker:true};
const migratedForced=applyLowWinUnder35ToAnalysis(legacyForced);
assert.equal(migratedForced.finalRecommendation.primaryBet,'Under 3.5');
assert.equal(migratedForced.finalRecommendation.hardOverride,true);

const exactTwenty=analyseMatch({
  league:'T',homeTeam:'20 Home',awayTeam:'0 Away',
  homeLast5:[{gf:1,ga:0},{gf:0,ga:1},{gf:0,ga:2},{gf:1,ga:2},{gf:0,ga:3}],
  awayLast5:[{gf:0,ga:1},{gf:0,ga:2},{gf:1,ga:2},{gf:0,ga:3},{gf:0,ga:4}]
});
assert.equal(exactTwenty.split.home.wins,1);
assert.equal(exactTwenty.markets.under35.forced,false);

const board=analyseBoard(new Array(6).fill(0).map((_,i)=>({id:`m${i}`,league:'T',homeTeam:`H${i}`,awayTeam:`A${i}`,homeLast5:[{gf:3,ga:0},{gf:2,ga:0},{gf:3,ga:1},{gf:2,ga:1},{gf:3,ga:0}],awayLast5:[{gf:0,ga:3},{gf:0,ga:2},{gf:1,ga:4},{gf:0,ga:3},{gf:1,ga:4}]})));
assert.ok(board.topBankers.length<=4);

// Bangers is a strict all-or-nothing engine, separate from Golden soft scoring.
const strong={ppg:1.6,avgGF:2,avgGA:2};
let banger=evaluateBanger({home:strong,away:strong,over25Odd:1.40,positions:{home:2,away:8,homeTableSize:18,awayTableSize:18}});
assert.equal(banger.qualified,true);
assert.equal(banger.score,10);
banger=evaluateBanger({home:strong,away:strong,over25Odd:1.40,positions:{home:2,away:4,homeTableSize:18,awayTableSize:18}});
assert.equal(banger.qualified,false,'Both Top 5 must be rejected');
banger=evaluateBanger({home:strong,away:strong,over25Odd:1.56,positions:{home:2,away:8,homeTableSize:18,awayTableSize:18}});
assert.equal(banger.qualified,false,'Odds above 1.55 must be rejected');

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('./public/index.html');
const appJs=read('./public/app.js');
const splashCss=read('./public/splash.css');
const splashJs=read('./public/splash.js');
const bangersHtml=read('./public/bangers.html');
const bangersJs=read('./public/bangers.js');
const bangersCss=read('./public/bangers.css');
const bangersSource=read('./goldenBangers.cjs');
const bangersScan=read('./bangersScan.mjs');
const precompute=read('./precompute.mjs');
const runtimeConfig=read('./runtimeConfig.mjs');
const serverSource=read('./server.mjs');
const splashAsset=new URL('../web/public/assets/zeus-board-loading.jpg',import.meta.url);

// Current board/UI contract.
for(const pattern of[/id="market"/,/id="confidence"/,/id="league"/,/id="matchCentreToggle"/,/href="\/bangers\.html"/,/href="\/proof"/])assert.match(html,pattern);
assert.match(appJs,/pageSize:\s*20/);
assert.match(appJs,/WAITING FOR 5\+5/);
assert.match(appJs,/Why this pick/);
assert.match(appJs,/Exact home results/);
assert.match(appJs,/Exact away results/);
assert.match(appJs,/marketCard\('Under 3\.5',a\.markets\?\.under35\)/);

// Android-safe, video-only splash contract: no static Zeus poster and video is created dynamically.
assert.match(html,/id="boardSplash"/);
assert.match(html,/id="boardSplashMedia"/);
assert.doesNotMatch(html,/id="boardSplashVideo"/);
assert.doesNotMatch(html,/zeus-board-loading\.jpg/);
assert.doesNotMatch(html,/preload" as="video"/);
assert.match(splashCss,/\.board-splash__video/);
assert.match(splashCss,/object-fit:contain/);
assert.doesNotMatch(splashCss,/zeus-board-loading\.jpg/);
assert.match(splashJs,/document\.createElement\('video'\)/);
assert.match(splashJs,/v\.loop=false/);
assert.match(splashJs,/v\.play\(\)/);
assert.match(splashJs,/boardReady&&mediaDone/);
assert.match(splashJs,/MAX_SPLASH_MS=3600/);
assert.match(splashJs,/v\.src='\/media\/zeus-thunder-original\.mp4'/);
assert.equal(existsSync(splashAsset),false,'Legacy Zeus loading poster must remain removed');

// Bangers product page and exact rule contract.
for(const pattern of[/STRICT OVER 2\.5 FINDER/,/Odds 1\.20–1\.55/,/Both leak ≥1\.90/,/Both PPG &gt;1\.50/,/Both score ≥1\.88/,/Reject both Top 5/,/Top 3 \/ Bottom 2/])assert.match(bangersHtml,pattern);
assert.match(bangersJs,/board\?\.bangers/);
assert.match(bangersJs,/BANGER MARKET/);
assert.match(bangersJs,/Split rank/);
assert.match(bangersCss,/\.banger-card/);
for(const pattern of[/over25OddMin:1\.20/,/over25OddMax:1\.55/,/minLeakAvgGA:1\.90/,/minPPGExclusive:1\.50/,/minAttackAvgGF:1\.88/,/notBothTopFive/,/extremeRank/])assert.match(bangersSource,pattern);
assert.match(bangersScan,/calculateSplitTables/);
assert.match(bangersScan,/league:leagueId,season,status:'FT'/);
assert.match(bangersScan,/scanBangers/);
assert.match(precompute,/attachBangers/);
assert.match(precompute,/bangersReady:true/);
assert.match(precompute,/bangersFound:bangers\.length/);
assert.match(runtimeConfig,/apiFootballRequest/);

// Existing server media/proxy contracts needed by web + APK.
assert.match(serverSource,/zeus-thunder-original\.mp4/);
assert.match(serverSource,/function serveSplashVideo/);
assert.match(serverSource,/accept-ranges':'bytes/);
assert.match(serverSource,/serveTeamCrest/);
assert.match(serverSource,/media\.api-sports\.io\/football\/teams/);

console.log('Golden engine + strict Bangers + current UI + dynamic video-only splash tests passed');
