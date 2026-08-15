import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {evaluateBanger}=require('./goldenBangers.cjs');

const strong={ppg:1.6,avgGF:2.0,avgGA:2.0};
const ranks=(home,away,size=18)=>({home,away,homeTableSize:size,awayTableSize:size});

let r=evaluateBanger({home:strong,away:strong,over25Odd:1.40,positions:ranks(2,8)});
assert.equal(r.qualified,true,'Top 3 vs non-Top-5 should qualify when all remaining gates pass');
assert.equal(r.score,10);
assert.equal(r.ranks.homeBand,'Top 3');

r=evaluateBanger({home:strong,away:strong,over25Odd:1.40,positions:ranks(2,4)});
assert.equal(r.qualified,false,'Both teams being Top 5 must reject the Banger');
assert.equal(r.gates.notBothTopFive,false);

r=evaluateBanger({home:strong,away:strong,over25Odd:1.40,positions:ranks(6,8)});
assert.equal(r.qualified,true,'No Top 3 or Bottom 2 position is required anymore');
assert.equal('extremeRank' in r.gates,false,'Removed extreme-rank gate must not return');

r=evaluateBanger({home:strong,away:strong,over25Odd:1.55,positions:ranks(9,17)});
assert.equal(r.qualified,true,'1.55 is inside the inclusive odds window when all remaining gates pass');
assert.equal(r.ranks.awayBand,'Bottom 2');

r=evaluateBanger({home:strong,away:strong,over25Odd:1.56,positions:ranks(2,8)});
assert.equal(r.qualified,false,'Odds above 1.55 must reject');

r=evaluateBanger({
  home:{...strong,avgGA:1.4,avgGF:2.1},
  away:{...strong,avgGA:2.0,avgGF:1.4},
  over25Odd:1.40,
  positions:ranks(6,8)
});
assert.equal(r.qualified,true,'The leak and scoring thresholds may be supplied by different teams');
assert.equal(r.gates.oneLeak,true);
assert.equal(r.gates.oneAttack,true);

r=evaluateBanger({home:{...strong,avgGA:1.8},away:{...strong,avgGA:1.8},over25Odd:1.40,positions:ranks(6,8)});
assert.equal(r.qualified,false,'At least one team must leak 1.90 or more');
assert.equal(r.gates.oneLeak,false);

r=evaluateBanger({home:{...strong,avgGF:1.8},away:{...strong,avgGF:1.8},over25Odd:1.40,positions:ranks(6,8)});
assert.equal(r.qualified,false,'At least one team must score 1.90 or more');
assert.equal(r.gates.oneAttack,false);

r=evaluateBanger({home:{...strong,ppg:1.5},away:strong,over25Odd:1.40,positions:ranks(6,8)});
assert.equal(r.qualified,false,'PPG must be strictly above 1.50 for both teams');

r=evaluateBanger({home:strong,away:strong,over25Odd:1.40,positions:{}});
assert.equal(r.qualified,false,'Missing split ranks must hard-reject because the both-Top-5 guard cannot be verified');

console.log('Bangers strict Over 2.5 gate tests passed');
