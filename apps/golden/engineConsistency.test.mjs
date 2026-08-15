import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {evaluateTrust} from './trustLayer.mjs';

const require=createRequire(import.meta.url);
const {analyseMatch}=require('./goldenBanker.cjs');

const bttsAsym=analyseMatch({
  league:'Regression',homeTeam:'Home',awayTeam:'Away',
  homeLast5:[{gf:2,ga:1},{gf:1,ga:1},{gf:2,ga:1},{gf:2,ga:0},{gf:0,ga:1}],
  awayLast5:[{gf:1,ga:1},{gf:2,ga:1},{gf:1,ga:2},{gf:2,ga:2},{gf:2,ga:0}]
});
assert.equal(bttsAsym.split.home.bttsRate,.6);
assert.equal(bttsAsym.split.away.bttsRate,.8);
assert.equal(bttsAsym.markets.btts.qualified,false,'60% / 80% BTTS must never qualify as Golden Banker BTTS');
assert.ok(bttsAsym.markets.btts.score<=6.9,'directionally weak BTTS must be capped below banker grade');
assert.notEqual(bttsAsym.finalRecommendation.primaryBet,'BTTS Yes');

const overAsym=analyseMatch({
  league:'Regression',homeTeam:'Home',awayTeam:'Away',
  homeLast5:[{gf:3,ga:1},{gf:2,ga:1},{gf:4,ga:0},{gf:2,ga:2},{gf:1,ga:0}],
  awayLast5:[{gf:1,ga:0},{gf:1,ga:1},{gf:0,ga:1},{gf:2,ga:1},{gf:1,ga:2}]
});
assert.equal(overAsym.split.home.over25Rate,.8);
assert.equal(overAsym.split.away.over25Rate,.4);
assert.equal(overAsym.markets.over25.qualified,false,'O2.5 needs directional support from both exact splits');
assert.ok(overAsym.markets.over25.score<=6.9);

const highScoringWeakTeams=analyseMatch({
  league:'Regression',homeTeam:'Low Home',awayTeam:'Low Away',
  homeLast5:[{gf:3,ga:3},{gf:4,ga:5},{gf:2,ga:2},{gf:3,ga:4},{gf:5,ga:6}],
  awayLast5:[{gf:2,ga:2},{gf:3,ga:4},{gf:4,ga:4},{gf:2,ga:5},{gf:3,ga:6}]
});
assert.equal(highScoringWeakTeams.markets.under35.qualified,false,'low win/PPG cannot override obviously high-scoring evidence');
assert.equal(highScoringWeakTeams.markets.under35.forced,false);
assert.notEqual(highScoringWeakTeams.finalRecommendation.primaryBet,'Under 3.5');

const genuineUnder=analyseMatch({
  league:'Regression',homeTeam:'Quiet Home',awayTeam:'Quiet Away',
  homeLast5:[{gf:0,ga:0},{gf:0,ga:1},{gf:1,ga:1},{gf:0,ga:0},{gf:1,ga:1}],
  awayLast5:[{gf:0,ga:0},{gf:0,ga:1},{gf:1,ga:1},{gf:0,ga:0},{gf:1,ga:1}]
});
assert.equal(genuineUnder.markets.under35.qualified,true,'low form needs independent low-goal confirmation');
assert.equal(genuineUnder.markets.under35.forced,false);
assert.equal(genuineUnder.finalRecommendation.primaryBet,'Under 3.5');
assert.equal(genuineUnder.finalRecommendation.hardOverride,false);

const dominantHome=[{gf:1,ga:0},{gf:1,ga:0},{gf:2,ga:0},{gf:1,ga:0},{gf:1,ga:0}];
const weakAway=[{gf:0,ga:1},{gf:0,ga:1},{gf:0,ga:2},{gf:0,ga:1},{gf:0,ga:1}];
const top2Win=analyseMatch({
  league:'Regression',homeTeam:'Elite Home',awayTeam:'Weak Away',homeLast5:dominantHome,awayLast5:weakAway,
  homeFormPosition:1,awayFormPosition:12,formTableSize:12,homeFormTableSize:12,awayFormTableSize:12
});
assert.equal(top2Win.markets.winDnb.straightWinMathEligible,true);
assert.equal(top2Win.markets.winDnb.straightWinTop2Confirmed,true);
assert.equal(top2Win.markets.winDnb.bet,'Elite Home Win','Top-2 favourite may keep straight win when all maths pass');
assert.equal(top2Win.finalRecommendation.primaryBet,'Elite Home Win');

const rank3Downgrade=analyseMatch({
  league:'Regression',homeTeam:'Rank Three',awayTeam:'Weak Away',homeLast5:dominantHome,awayLast5:weakAway,
  homeFormPosition:3,awayFormPosition:12,formTableSize:12,homeFormTableSize:12,awayFormTableSize:12
});
assert.equal(rank3Downgrade.markets.winDnb.straightWinMathEligible,true);
assert.equal(rank3Downgrade.markets.winDnb.straightWinTop2Confirmed,false);
assert.equal(rank3Downgrade.markets.winDnb.bet,'Rank Three DNB','Outside Top 2 must downgrade to DNB');
assert.equal(rank3Downgrade.finalRecommendation.primaryBet,'Rank Three DNB');

const unknownRankDowngrade=analyseMatch({
  league:'Regression',homeTeam:'No Rank',awayTeam:'Weak Away',homeLast5:dominantHome,awayLast5:weakAway
});
assert.equal(unknownRankDowngrade.markets.winDnb.straightWinMathEligible,true);
assert.equal(unknownRankDowngrade.markets.winDnb.straightWinTop2Confirmed,false);
assert.equal(unknownRankDowngrade.markets.winDnb.bet,'No Rank DNB','Unverified rank must never produce a straight win');

const bottomThreeTrust=evaluateTrust({round:12},{
  finalRecommendation:{primaryBet:'Home Win',score:8.5},
  split:{home:{ppg:2.4},away:{ppg:.4},positions:{home:10,away:2,tableSize:12}},
  markets:{winDnb:{favouriteSide:'Home',score:8.5},under35:{score:0},over25:{score:0},btts:{score:0}}
});
assert.equal(bottomThreeTrust.blocked,true,'numeric Bottom 3 favourite must be blocked by Zeus');
assert.ok(bottomThreeTrust.warnings.some(x=>/Bottom 3/i.test(x)));

const runtimeBoard=readFileSync(new URL('./runtimeBoard.mjs',import.meta.url),'utf8');
const runtimeConfig=readFileSync(new URL('./runtimeConfig.mjs',import.meta.url),'utf8');
assert.match(runtimeBoard,/function recomputeFromEvidence/);
assert.match(runtimeBoard,/analyseMatch\(\{/);
assert.match(runtimeBoard,/golden-top2-win-v3/);
assert.match(runtimeBoard,/engineVersion:'4\.3\.2'/);
assert.match(runtimeConfig,/API_FOOTBALL_EXACT_SPLIT_TABLES/);
assert.match(runtimeConfig,/VERSION='6\.2\.0'/);

console.log('Golden consistency v3 regression tests passed');
