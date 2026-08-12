import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {calculateSplitStats,analyseMatch,analyseBoard}=require('./goldenBanker.cjs');

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
assert.match(html,/glass-orange\.css\?v=7\.0\.0/);
assert.match(html,/id="boardSplash"/);
assert.match(html,/class="splash-active"/);
assert.doesNotMatch(html,/splashSharpen/);
assert.doesNotMatch(html,/feConvolveMatrix/);
assert.match(html,/id="boardSplashVideo"/);
assert.match(html,/src="\/media\/zeus-thunder-original\.mp4"/);
assert.match(html,/preload" as="video" href="\/media\/zeus-thunder-original\.mp4"/);
assert.match(html,/autoplay muted playsinline/);
assert.doesNotMatch(html,/autoplay muted loop playsinline/);
assert.match(html,/poster="\/assets\/zeus-board-loading\.jpg"/);
assert.match(html,/Loading Board…/);
assert.match(html,/LET THE GODS DECIDE/);
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
assert.match(splashCss,/filter:none/);
assert.doesNotMatch(splashCss,/splashSharpen/);
assert.match(splashCss,/\.board-splash__video\.is-portrait/);
assert.match(splashCss,/\.board-splash__video\.is-landscape/);
assert.match(splashCss,/width:min\(96vw,1280px\)/);
assert.match(splashCss,/height:min\(74dvh,720px\)/);
assert.doesNotMatch(splashCss,/zeus-breathe/);
assert.match(splashCss,/board-load/);
assert.match(splashCss,/prefers-reduced-motion/);
assert.doesNotMatch(splashJs,/atob\(/);
assert.doesNotMatch(splashJs,/createObjectURL/);
assert.match(splashJs,/video\.play\(\)/);
assert.match(splashJs,/video\.loop=false/);
assert.match(splashJs,/addEventListener\('loadedmetadata',syncVideoShape/);
assert.match(splashJs,/addEventListener\('ended',markVideoDone/);
assert.match(splashJs,/FALLBACK_DURATION_MS=5200/);
assert.match(splashJs,/boardReady&&videoDone/);
assert.match(splashJs,/15000/);
assert.ok(existsSync(splashAsset),'Zeus loading poster must exist');
assert.match(under35Source,/homeWinRate<0\.20/);
assert.match(under35Source,/awayWinRate<0\.20/);
assert.match(under35Source,/homeLowPPG=Number\(home\?\.ppg\)<1\.0/);
assert.match(under35Source,/awayLowPPG=Number\(away\?\.ppg\)<1\.0/);
assert.match(runtimeBoard,/UNDER_3_5/);
assert.match(runtimeBoard,/markets\?\.under35/);
assert.match(runtimeBoard,/lowWinUnder35/);
assert.match(runtimeJobs,/m==='UNDER_3_5'/);
assert.match(runtimeJobs,/h\+a<=3\?'WON':'LOST'/);
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

console.log('Golden engine + strict low-win Under 3.5 override + glass orange UI + crest proxy + highly rated page + original-quality Zeus splash tests passed');
