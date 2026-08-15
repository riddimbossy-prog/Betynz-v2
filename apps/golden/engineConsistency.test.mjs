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

const bottomThreeTrust=evaluateTrust({round:12},{
  finalRecommendation:{primaryBet:'Home Win',score:8.5},
  split:{home:{ppg:2.4},away:{ppg:.4},positions:{home:10,away:2,tableSize:12}},
  markets:{winDnb:{favouriteSide:'Home',score:8.5},under35:{score:0},over25:{score:0},btts:{score:0}}
});
assert.equal(bottomThreeTrust.blocked,true,'numeric Bottom 3 favourite must be blocked by Zeus');
assert.ok(bottomThreeTrust.warnings.some(x=>/Bottom 3/i.test(x)));

const runtimeBoard=readFileSync(new URL('./runtimeBoard.mjs',import.meta.url),'utf8');
assert.match(runtimeBoard,/function recomputeFromEvidence/);
assert.match(runtimeBoard,/analyseMatch\(\{/);
assert.match(runtimeBoard,/rulesRevision:'golden-consistency-v2'/);
assert.match(runtimeBoard,/engineVersion:'4\.3\.1'/);

console.log('Golden consistency v2 regression tests passed');
