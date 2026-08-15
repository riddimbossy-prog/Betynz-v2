import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {evaluateGG,LIMITS}=require('./goldenGG.cjs');

const home={matchesPlayed:12,bttsRate:.70,homeBttsRate:.75,scoreRate:.80,homeScoreRate:.80,concedeRate:.75,cleanSheetRate:.20,last6Btts:4};
const away={matchesPlayed:12,bttsRate:.68,awayBttsRate:.70,scoreRate:.75,awayScoreRate:.75,concedeRate:.70,cleanSheetRate:.25,last6Btts:4};
const league={matchesPlayed:120,bttsRate:.55};

let r=evaluateGG({home,away,league});
assert.equal(r.qualified,true,'All nine GG profile gates should qualify');
assert.equal(r.score,10);
assert.equal(r.market,'GG / BTTS Statistical Profile');
assert.equal(LIMITS.seasonBttsBoth,.68);
assert.equal(LIMITS.homeVenueBtts,.72);
assert.equal(LIMITS.awayVenueBtts,.68);
assert.equal(LIMITS.scoreRate,.72);
assert.equal(LIMITS.concedeRate,.68);
assert.equal(LIMITS.maxCleanSheetRate,.28);
assert.equal(LIMITS.leagueBtts,.54);
assert.equal(LIMITS.minSeasonMatches,10);

r=evaluateGG({home:{...home,bttsRate:.80},away:{...away,bttsRate:.62},league});
assert.equal(r.gates.seasonBtts,true,'80% + 62% season route must pass');

r=evaluateGG({home:{...home,cleanSheetRate:.29},away,league});
assert.equal(r.qualified,false,'Clean-sheet rate above 28% must fail');
assert.equal(r.gates.lowCleanSheets,false);

r=evaluateGG({home:{...home,matchesPlayed:9},away,league});
assert.equal(r.qualified,false,'Both teams need at least 10 completed league matches');
assert.equal(r.gates.matureSample,false);

r=evaluateGG({home:{...home,homeBttsRate:.71},away,league});
assert.equal(r.qualified,false,'Home venue BTTS below 72% must fail');

r=evaluateGG({home:{...home,last6Btts:5},away:{...away,last6Btts:2},league});
assert.equal(r.gates.recentBtts,true,'Either team reaching 5+ in the last six activates the stated recent-form exception');

r=evaluateGG({home:{...home,homeScoreRate:.71},away,league});
assert.equal(r.qualified,false,'Venue-preferred scoring rate below 72% must fail');

r=evaluateGG({home,away:{...away,concedeRate:.67},league});
assert.equal(r.qualified,false,'Both teams must concede in at least 68% of season matches');

r=evaluateGG({home,away,league:{...league,bttsRate:.53}});
assert.equal(r.qualified,false,'League BTTS below 54% must fail');

console.log('GG / BTTS statistical profile tests passed');
