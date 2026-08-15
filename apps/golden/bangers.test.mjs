import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {evaluateBanger}=require('./goldenBangers.cjs');

const home={matchesPlayed:12,over25Rate:.75,homeOver25Rate:.75,avgGF:1.9,avgGA:1.6,last6Overs:4};
const away={matchesPlayed:12,over25Rate:.70,awayOver25Rate:.70,avgGF:1.8,avgGA:1.6,last6Overs:4};
const league={matchesPlayed:120,over25Rate:.60};

let r=evaluateBanger({home,away,league});
assert.equal(r.qualified,true,'A mature match clearing every statistical gate should qualify');
assert.equal(r.score,10);
assert.equal(r.xg.available,false,'xG is optional when reliable data is unavailable');
assert.equal(r.gates.xgEnvironment,true);

r=evaluateBanger({home:{...home,over25Rate:.82},away:{...away,over25Rate:.66},league});
assert.equal(r.qualified,true,'80% + 65% season route should qualify');

r=evaluateBanger({home:{...home,homeOver25Rate:.71},away,league});
assert.equal(r.qualified,false,'Home venue rate below 72% must fail');
assert.equal(r.gates.homeVenueOver,false);

r=evaluateBanger({home,away:{...away,awayOver25Rate:.67},league});
assert.equal(r.qualified,false,'Away venue rate below 68% must fail');
assert.equal(r.gates.awayVenueOver,false);

r=evaluateBanger({home:{...home,avgGF:1.5,avgGA:1.5},away:{...away,avgGF:1.5,avgGA:1.5},league});
assert.equal(r.qualified,false,'Combined GF+GA environment below 3.40 must fail');
assert.equal(r.gates.combinedAverageGoals,false);

r=evaluateBanger({home,away,league,xgCombined:3.09});
assert.equal(r.qualified,false,'Available xG+xGA below 3.10 must fail');
assert.equal(r.gates.xgEnvironment,false);

r=evaluateBanger({home,away,league,xgCombined:3.10});
assert.equal(r.qualified,true,'Available xG+xGA at 3.10 should pass');

r=evaluateBanger({home:{...home,last6Overs:5},away:{...away,last6Overs:2},league});
assert.equal(r.qualified,true,'Five or more recent high-scoring matches for either team activates the stated recent-form alternative');

r=evaluateBanger({home:{...home,last6Overs:3},away:{...away,last6Overs:3},league});
assert.equal(r.qualified,false,'Recent-form gate fails when neither team reaches four and neither reaches five');
assert.equal(r.gates.recentOvers,false);

r=evaluateBanger({home,away,league:{...league,over25Rate:.55}});
assert.equal(r.qualified,false,'League rate below 56% must fail');
assert.equal(r.gates.leagueOver,false);

r=evaluateBanger({home:{...home,matchesPlayed:9},away,league});
assert.equal(r.qualified,false,'Both teams need at least 10 completed league matches');
assert.equal(r.gates.matureSample,false);

console.log('Bangers high-scoring season profile tests passed');
