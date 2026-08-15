import assert from 'node:assert/strict';
import {seasonRound,seasonPhase,earlySeasonFlag,seasonChip} from './public/season-phase.js';

assert.equal(seasonRound({league:{round:'Regular Season - 3'}}),3);
assert.deepEqual(seasonPhase({league:{round:'Round 8'}}),{key:'EARLY',round:8,label:'Early Season'});
assert.deepEqual(seasonPhase({league:{round:'Matchday 9'}}),{key:'SOLID',round:9,label:'Solid Season'});
assert.deepEqual(seasonPhase({}),{key:'UNKNOWN',round:null,label:'Season stage unknown'});
assert.match(earlySeasonFlag({round:'Week 5'}),/🚩/);
assert.equal(earlySeasonFlag({round:'Week 10'}),'');
assert.match(seasonChip({round:'Week 7'}),/Early Season/);
assert.match(seasonChip({round:'Week 12'}),/Solid Season/);

console.log('Season maturity classifier tests passed');
