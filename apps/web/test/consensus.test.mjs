import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConsensusForFixture, buildConsensusWindow, consensusSummary, marketDirection } from '../src/engines/consensus.mjs';

const fixture = {
  fixtureId: 'fx-1', date: '2099-08-04', kickoff: '2099-08-04T18:00:00.000Z',
  country: 'Test', leagueName: 'League', home: { name: 'Home' }, away: { name: 'Away' }
};
const pick = (engine, market, decision = 'FIRE', score = 82, odds = 1.5) => ({ engine, engineName: engine, market, label: market, decision, score, odds });

test('five matching result engines create an Elite Banker', () => {
  const result = buildConsensusForFixture({ fixture, picks: [pick('MARKET_ROUTE','HOME_WIN'), pick('PPG_ROUTE','HOME_WIN'), pick('APEX_INTELLIGENCE','HOME_WIN'), pick('CONVERGENCE_ROUTE','HOME_WIN'), pick('MOMENTUM_STREAK','HOME_WIN')], odds: { homeWin: 1.52 } });
  assert.equal(result.classification, 'ELITE_BANKER');
  assert.equal(result.agreementCount, 5);
  assert.equal(result.final.market, 'HOME_WIN');
  assert.equal(result.final.odds, 1.52);
});

test('four compatible result engines create a Consensus Banker on the safer 1X market', () => {
  const result = buildConsensusForFixture({ fixture, picks: [pick('MARKET_ROUTE','HOME_WIN'), pick('PPG_ROUTE','HOME_WIN'), pick('APEX_INTELLIGENCE','DOUBLE_CHANCE_1X'), pick('MOMENTUM_STREAK','HOME_WIN')], odds: { doubleChance1X: 1.18 } });
  assert.equal(result.classification, 'CONSENSUS_BANKER');
  assert.equal(result.final.market, 'DOUBLE_CHANCE_1X');
  assert.equal(result.final.odds, 1.18);
});

test('two compatible goal engines agree on Over 1.5 as a shared qualified pick', () => {
  const result = buildConsensusForFixture({ fixture, picks: [pick('MARKET_ROUTE','BTTS_YES'), pick('CONVERGENCE_ROUTE','OVER_2_5')], odds: { over15: 1.25 } });
  assert.equal(result.classification, 'QUALIFIED_PICK');
  assert.equal(result.final.market, 'OVER_1_5');
});

test('opposite Over and Under directions are rejected as conflict', () => {
  const result = buildConsensusForFixture({ fixture, picks: [pick('MARKET_ROUTE','OVER_2_5'), pick('APEX_INTELLIGENCE','UNDER_2_5')] });
  assert.equal(result.classification, 'CONFLICT');
  assert.equal(result.conflict, true);
  assert.match(result.conflictReasons.join(' '), /Over and Under/);
});

test('agreement without the shared safer price is held, not published as banker', () => {
  const result = buildConsensusForFixture({ fixture, picks: [pick('MARKET_ROUTE','HOME_WIN','FIRE',82,null), pick('APEX_INTELLIGENCE','DOUBLE_CHANCE_1X','FIRE',82,null)] });
  assert.equal(result.classification, 'HOLD_MISSING_SHARED_PRICE');
});

test('a single safer engine remains a Safer Pick', () => {
  const result = buildConsensusForFixture({ fixture, picks: [pick('MARKET_ROUTE','UNDER_3_5','SAFER',74,1.24)], odds: { under35: 1.24 } });
  assert.equal(result.classification, 'SAFER_PICK');
  assert.equal(result.agreementCount, 1);
});

test('window groups one decision per engine and summary classifies rows', () => {
  const rows = buildConsensusWindow([
    { ...pick('MARKET_ROUTE','HOME_WIN'), ...fixture, league:'League', _odds:{homeWin:1.5} },
    { ...pick('PPG_ROUTE','HOME_WIN'), ...fixture, league:'League', _odds:{homeWin:1.5} },
    { ...pick('APEX_INTELLIGENCE','HOME_WIN'), ...fixture, league:'League', _odds:{homeWin:1.5} },
    { ...pick('CONVERGENCE_ROUTE','HOME_WIN'), ...fixture, league:'League', _odds:{homeWin:1.5} },
    { ...pick('MOMENTUM_STREAK','HOME_WIN'), ...fixture, league:'League', _odds:{homeWin:1.5} }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(consensusSummary(rows).elite, 1);
  assert.equal(marketDirection('DOUBLE_CHANCE_X2'), 'AWAY_RESULT');
});
