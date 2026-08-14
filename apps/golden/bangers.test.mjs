import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {evaluateBanger}=require('./goldenBangers.cjs');

const strong={ppg:1.6,avgGF:2.0,avgGA:2.0};
const ranks=(home,away,size=18)=>({home,away,homeTableSize:size,awayTableSize:size});

let r=evaluateBanger({home:strong,away:strong,over25Odd:1.40,positions:ranks(2,8)});
assert.equal(r.qualified,true,'Top 3 vs non-Top-5 should qualify when all stat/odds gates pass');
assert.equal(r.score,10);
assert.equal(r.ranks.homeBand,'Top 3');

r=evaluateBanger({home:strong,away:strong,over25Odd:1.40,positions:ranks(2,4)});
assert.equal(r.qualified,false,'Both teams being Top 5 must reject the Banger');
assert.equal(r.gates.notBothTopFive,false);

r=evaluateBanger({home:strong,away:strong,over25Odd:1.40,positions:ranks(6,8)});
assert.equal(r.qualified,false,'At least one side must be Top 3 or Bottom 2');
assert.equal(r.gates.extremeRank,false);

r=evaluateBanger({home:strong,away:strong,over25Odd:1.55,positions:ranks(9,17)});
assert.equal(r.qualified,true,'Bottom 2 route should qualify and 1.55 is inside the inclusive odds window');
assert.equal(r.ranks.awayBand,'Bottom 2');

r=evaluateBanger({home:strong,away:strong,over25Odd:1.56,positions:ranks(2,8)});
assert.equal(r.qualified,false,'Odds above 1.55 must reject');

r=evaluateBanger({home:{...strong,avgGA:1.8},away:strong,over25Odd:1.40,positions:ranks(2,8)});
assert.equal(r.qualified,false,'Both teams must leak at least 1.90');

r=evaluateBanger({home:{...strong,ppg:1.5},away:strong,over25Odd:1.40,positions:ranks(2,8)});
assert.equal(r.qualified,false,'PPG must be strictly above 1.50');

r=evaluateBanger({home:{...strong,avgGF:1.8},away:strong,over25Odd:1.40,positions:ranks(2,8)});
assert.equal(r.qualified,false,'Both attacks must average at least 1.88');

r=evaluateBanger({home:strong,away:strong,over25Odd:1.40,positions:{}});
assert.equal(r.qualified,false,'Missing split ranks must hard-reject');

console.log('Bangers strict Over 2.5 gate tests passed');
