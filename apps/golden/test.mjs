import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {calculateSplitStats,analyseMatch,analyseBoard}=require('./goldenBanker.cjs');

const stats=calculateSplitStats([{gf:2,ga:0},{gf:1,ga:0},{gf:3,ga:1},{gf:2,ga:1},{gf:1,ga:0}]);
assert.equal(stats.ppg,3);
assert.equal(stats.avgGA,.4);

const dnb=analyseMatch({league:'T',homeTeam:'H',awayTeam:'A',homeLast5:[{gf:2,ga:0},{gf:1,ga:0},{gf:1,ga:1},{gf:2,ga:1},{gf:0,ga:0}],awayLast5:[{gf:0,ga:2},{gf:0,ga:1},{gf:1,ga:1},{gf:0,ga:3},{gf:0,ga:2}]});
assert.equal(dnb.markets.winDnb.dnbEligible,true);
assert.equal(dnb.markets.winDnb.straightWinEligible,false);

const board=analyseBoard(new Array(6).fill(0).map((_,i)=>({id:`m${i}`,league:'T',homeTeam:`H${i}`,awayTeam:`A${i}`,homeLast5:[{gf:3,ga:0},{gf:2,ga:0},{gf:3,ga:1},{gf:2,ga:1},{gf:3,ga:0}],awayLast5:[{gf:0,ga:3},{gf:0,ga:2},{gf:1,ga:4},{gf:0,ga:3},{gf:1,ga:4}]})));
assert.ok(board.topBankers.length<=4);

const html=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('./public/styles.css',import.meta.url),'utf8');
const compact=readFileSync(new URL('./public/compact-board.css',import.meta.url),'utf8');
const runtimeConfig=readFileSync(new URL('./runtimeConfig.mjs',import.meta.url),'utf8');
const serverSource=readFileSync(new URL('./server.mjs',import.meta.url),'utf8');

assert.match(html,/data-scope="CANDIDATES"/);
assert.match(html,/id="matchCentreToggle"/);
assert.match(html,/id="centreBody" hidden/);
assert.match(html,/id="pagination"/);
assert.match(html,/id="market"/);
assert.match(html,/id="confidence"/);
assert.match(html,/id="league"/);
assert.match(js,/pageSize:\s*20/);
assert.match(js,/CANDIDATE/);
assert.match(js,/finalBankerIds/);
assert.match(js,/WAITING FOR 5\+5/);
assert.match(js,/Why this pick/);
assert.match(js,/exact home results/);
assert.match(js,/exact away results/);
assert.match(compact,/\.status-badge\.candidate/);
assert.match(compact,/@media\(max-width:540px\)/);
assert.match(css,/@media\(max-width:620px\)/);
assert.match(runtimeConfig,/\/media\/team\/\$\{id\}\.png/);
assert.match(serverSource,/media\.api-sports\.io\/football\/teams/);
assert.match(serverSource,/serveTeamCrest/);
assert.match(serverSource,/max-age=604800, immutable/);

console.log('Golden Banker v4.3 engine + compact UI + crest proxy tests passed');
