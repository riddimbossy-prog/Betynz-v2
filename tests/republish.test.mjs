import test from 'node:test';import assert from 'node:assert/strict';
import {repairBoard} from '../scripts/republish.mjs';import {compileSelection,evaluate} from '../src/engine/markets.mjs';
test('foul totals cannot be evaluated using scoreline goals',()=>{
 const c=compileSelection({desc:'Home Team Fouls Over/Under',specifier:'total=14.5'},{desc:'Under 14.5'});
 assert.equal(c.stat,'fouls');assert.equal(evaluate(c,{home:2,away:1}),null);
 assert.equal(evaluate(c,{stats:{home:{fouls:18},away:{fouls:7}}}),-1);
});
test('republishing removes foul estimates and retains original valid odds timestamps',()=>{
 const old={market:'Fouls Over/Under',probability:1,odds:1.4},valid={market:'Over/Under',selection:'Under 3.5',probability:0.8,odds:1.3,risk:{score:30}};
 const board={generatedAt:'2026-10-02T05:00:00Z',summary:{},matches:[{tip:old,categoryTips:[old,valid],oddsFetchedAt:'2026-10-02T04:55:00Z',reasons:[]}]};
 repairBoard(board);assert.equal(board.matches[0].tip.market,'Over/Under');assert.equal(board.summary.qualified,1);
 assert.equal(board.generatedAt,'2026-10-02T05:00:00Z');assert.equal(board.matches[0].oddsFetchedAt,'2026-10-02T04:55:00Z');assert.deepEqual(board.matches[0].tip.scenarios,[]);
});
