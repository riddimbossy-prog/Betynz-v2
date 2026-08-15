import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {calculateSplitStats,analyseMatch,analyseBoard}=require('./goldenBanker.cjs');
const {applyLowWinUnder35ToAnalysis}=require('./goldenUnder35.cjs');
const {evaluateBanger}=require('./goldenBangers.cjs');

// Core Golden maths remains protected.
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

const legacyForced={...forcedUnder,markets:{over25:forcedUnder.markets.over25,btts:forcedUnder.markets.btts,winDnb:forcedUnder.markets.winDnb},finalRecommendation:{primaryBet:'Over 2.5',score:9.4,confidence:'High',bankerStatus:'Banker',summary:'legacy pick'},banker:true};
const migratedForced=applyLowWinUnder35ToAnalysis(legacyForced);
assert.equal(migratedForced.finalRecommendation.primaryBet,'Under 3.5');

const board=analyseBoard(new Array(6).fill(0).map((_,i)=>({id:`m${i}`,league:'T',homeTeam:`H${i}`,awayTeam:`A${i}`,homeLast5:[{gf:3,ga:0},{gf:2,ga:0},{gf:3,ga:1},{gf:2,ga:1},{gf:3,ga:0}],awayLast5:[{gf:0,ga:3},{gf:0,ga:2},{gf:1,ga:4},{gf:0,ga:3},{gf:1,ga:4}]})));
assert.ok(board.topBankers.length<=4);

// Bangers is now a season-level high-scoring statistical profile.
const profileHome={matchesPlayed:12,over25Rate:.75,homeOver25Rate:.75,avgGF:1.9,avgGA:1.6,last6Overs:4};
const profileAway={matchesPlayed:12,over25Rate:.70,awayOver25Rate:.70,avgGF:1.8,avgGA:1.6,last6Overs:4};
const profileLeague={matchesPlayed:120,over25Rate:.60};
let banger=evaluateBanger({home:profileHome,away:profileAway,league:profileLeague});
assert.equal(banger.qualified,true);
assert.equal(banger.score,10);
assert.equal(banger.market,'High-Scoring Match Profile');
banger=evaluateBanger({home:{...profileHome,matchesPlayed:9},away:profileAway,league:profileLeague});
assert.equal(banger.qualified,false,'10-match sample gate must be enforced');
banger=evaluateBanger({home:profileHome,away:profileAway,league:profileLeague,xgCombined:3.09});
assert.equal(banger.qualified,false,'Available xG environment below 3.10 must fail');

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
for(const pattern of[/id="market"/,/id="confidence"/,/id="league"/,/id="season"/,/id="matchCentreToggle"/,/href="\/bangers\.html"/,/href="\/proof"/])assert.match(html,pattern);
assert.match(appJs,/pageSize:\s*20/);
assert.match(appJs,/WAITING FOR 5\+5/);
assert.match(appJs,/Why this pick/);
assert.match(appJs,/Exact home results/);
assert.match(appJs,/Exact away results/);

// Android-safe, video-only splash contract.
assert.match(html,/id="boardSplash"/);
assert.match(html,/id="boardSplashMedia"/);
assert.doesNotMatch(html,/id="boardSplashVideo"/);
assert.doesNotMatch(html,/zeus-board-loading\.jpg/);
assert.match(splashCss,/\.board-splash__video/);
assert.match(splashJs,/document\.createElement\('video'\)/);
assert.match(splashJs,/v\.src='\/media\/zeus-thunder-original\.mp4'/);
assert.equal(existsSync(splashAsset),false,'Legacy Zeus loading poster must remain removed');

// New Bangers checklist and public presentation.
for(const pattern of[/HIGH-SCORING MATCH PROFILE/,/70% \+ 70% or 80% \+ 65%/,/Home venue ≥72%/,/Away venue ≥68%/,/Combined GF\+GA ≥3\.40/,/xG\+xGA ≥3\.10 when available/,/League rate ≥56%/,/Both teams 10\+ matches/,/id="bangerSeason"/])assert.match(bangersHtml,pattern);
assert.doesNotMatch(bangersHtml,/Odds 1\.20–1\.55/);
assert.doesNotMatch(bangersHtml,/Reject both Top 5/);
assert.match(bangersJs,/High-Scoring Match/);
assert.match(bangersJs,/SEASON RATE/);
assert.match(bangersJs,/HOME RATE/);
assert.match(bangersJs,/AWAY RATE/);
assert.match(bangersCss,/\.banger-card/);
for(const pattern of[/seasonOverBoth:0\.70/,/seasonOverElite:0\.80/,/seasonOverPartner:0\.65/,/homeVenueOver:0\.72/,/awayVenueOver:0\.68/,/combinedAverageGoals:3\.40/,/combinedXgEnvironment:3\.10/,/recentOversEach:4/,/recentOversElite:5/,/leagueOver25:0\.56/,/minSeasonMatches:10/])assert.match(bangersSource,pattern);
assert.doesNotMatch(bangersSource,/over25OddMin|notBothTopFive|minPPGExclusive/);
assert.match(bangersScan,/calculateSeasonGoalProfile/);
assert.match(bangersScan,/league:leagueId,season,status:'FT'/);
assert.match(bangersScan,/scanBangers/);
assert.doesNotMatch(bangersScan,/passesStatAndOddsGates|calculateSplitTables/);
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

console.log('Golden engine + high-scoring Bangers profile + current UI + splash tests passed');
