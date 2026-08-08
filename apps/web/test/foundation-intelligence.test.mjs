import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { effectiveEvidence, correlationAdjustedConfidence } from '../src/engines/evidenceIndependence.mjs';
import { buildCalibrationReport, buildEngineErrorCorrelation } from '../src/lib/calibration.mjs';
import { buildPredictionLineage } from '../src/engines/predictionLineage.mjs';
import { publicAnalysisDateState, utcDateString } from '../src/lib/requestGuard.mjs';
import { matchResultToPrediction } from '../src/lib/results.mjs';
import { statsApiFixtureMatchScore } from '../src/lib/statsApi.mjs';

const seven = ['MARKET_ROUTE','PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK','STREAK_VALUE','HTFT_MOMENTUM'];

test('correlation-aware Consensus discounts overlapping specialist evidence', () => {
  const picks = seven.map((engine, index) => ({ engine, market:'OVER_1_5', score:86-index }));
  const result = effectiveEvidence(picks);
  assert.equal(result.rawCount, 7);
  assert.ok(result.effectiveCount < 7);
  assert.ok(result.effectiveCount >= 5);
  const confidence = correlationAdjustedConfidence(picks, 84);
  assert.ok(confidence.confidence < 100);
  assert.equal(confidence.families.length, 7);
});

test('venue-heavy engines do not count as four fully independent confirmations', () => {
  const picks = ['PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK'].map(engine => ({engine,market:'HOME_WIN',score:82}));
  assert.ok(effectiveEvidence(picks).effectiveCount < 4);
});

test('calibration reports probability quality and market baseline instead of hit rate alone', () => {
  const rows = Array.from({length:40},(_,i)=>({
    fixture_id:`f${i}`,fixture_date:'2026-08-01',engine:'MARKET_ROUTE',market:'OVER_1_5',decision:'FIRE',engine_score:i<30?78:66,
    odds:i<30?1.55:1.80,settlement_status:i%4===0?'LOST':'WON',profit_units:i%4===0?-1:(i<30?.55:.8),payload:{engine:{selection:{routeName:'Goals'}}}
  }));
  const report=buildCalibrationReport(rows,[]);
  const route=report.byRoute[0];
  assert.ok(Number.isFinite(route.brierScore));
  assert.ok(Number.isFinite(route.logLoss));
  assert.ok(Number.isFinite(route.marketBrierScore));
  assert.ok(route.observedWinRate95CI);
  assert.equal(report.probabilityPolicy.scoreDerivedProbability,true);
});

test('engine error correlation is measured only on shared settled fixtures', () => {
  const rows=[];
  for(let i=0;i<30;i++){
    rows.push({fixture_id:`x${i}`,fixture_date:'2026-08-01',engine:'PPG_ROUTE',settlement_status:i%3?'WON':'LOST'});
    rows.push({fixture_id:`x${i}`,fixture_date:'2026-08-01',engine:'APEX_INTELLIGENCE',settlement_status:i%3?'WON':'LOST'});
  }
  const pairs=buildEngineErrorCorrelation(rows);
  assert.equal(pairs[0].sample,30);
  assert.ok(pairs[0].errorCorrelation>0.9);
  assert.equal(pairs[0].stage,'PROVISIONAL');
});

test('prediction lineage preserves every final decision stage and recovery audit', () => {
  const row=buildPredictionLineage({
    rawEngine:{selection:{market:'OVER_2_5',odds:2.2}},
    oddsGated:{selection:{market:'OVER_1_5',odds:1.5},oddsGate:{action:'DOWNGRADE',accepted:true}},
    dataChecked:{proposedSelection:{market:'OVER_1_5',odds:1.5},dataValidation:{status:'REJECTED_BY_DATA',score:42,evidenceCount:5}},
    recovered:{selection:{market:'HOME_WIN',odds:1.7},dataValidation:{status:'BACKED_BY_DATA',score:78,evidenceCount:7},adaptiveRecovery:{attempted:true,recovered:true,selectedMarket:'HOME_WIN',searchPenalty:3.6,evaluatedCandidates:[{market:'DRAW',status:'LOGIC_NOT_RELEVANT'}]}}
  });
  assert.equal(row.original.market,'OVER_2_5');
  assert.equal(row.oddsGate.action,'DOWNGRADE');
  assert.equal(row.adaptiveRecovery.selectedMarket,'HOME_WIN');
  assert.equal(row.adaptiveRecovery.evaluatedCandidates.length,1);
  assert.equal(row.published,true);
});

test('public deep analysis window blocks historical and far-future recomputation in production mode', () => {
  const oldA=process.env.NODE_TEST_CONTEXT,oldB=process.env.BETYNZ_TEST_MODE;
  delete process.env.NODE_TEST_CONTEXT;delete process.env.BETYNZ_TEST_MODE;
  try{
    assert.equal(publicAnalysisDateState(utcDateString(-1)).reason,'HISTORICAL_ANALYSIS_LOCKED');
    assert.equal(publicAnalysisDateState(utcDateString(8)).reason,'ANALYSIS_WINDOW_EXCEEDED');
    assert.equal(publicAnalysisDateState(utcDateString(0)).allowed,true);
  } finally { if(oldA===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=oldA;if(oldB===undefined)delete process.env.BETYNZ_TEST_MODE;else process.env.BETYNZ_TEST_MODE=oldB; }
});

test('settlement prefers no automatic match over a weak fuzzy identity', () => {
  const prediction={fixture_id:'unknown',home_team:'United',away_team:'City',league_name:'Premier League',kickoff:'2026-08-01T15:00:00Z'};
  const rows=[{sourceId:'other',home:'United Stars',away:'City Rangers',league:'Premier League',kickoff:'2026-08-01T15:00:00Z'}];
  assert.equal(matchResultToPrediction(prediction,rows),null);
  const exact=matchResultToPrediction({...prediction,fixture_id:'123'},[{...rows[0],sourceId:'123'}]);
  assert.equal(exact.identityMatch,'EXACT_PROVIDER_FIXTURE_ID');
});

test('Stats API mapping rewards team, league, country and kickoff agreement', () => {
  const fixture={home:{name:'Paris FC Women'},away:{name:'Lyon Women'},league:{name:'Division 1 Feminine',country:'France'},kickoff:'2026-08-01T18:00:00Z'};
  const good={home_team:{name:'Paris FC Women'},away_team:{name:'Lyon Women'},league:{name:'Division 1 Feminine',country:'France'},date:'2026-08-01T18:02:00Z'};
  const bad={home_team:{name:'Paris FC'},away_team:{name:'Lyon'},league:{name:'Club Friendly',country:'International'},date:'2026-08-01T11:00:00Z'};
  assert.ok(statsApiFixtureMatchScore(fixture,good)>statsApiFixtureMatchScore(fixture,bad));
  assert.ok(statsApiFixtureMatchScore(fixture,good)>=0.9);
});

test('fresh schema and migration include lineage, identity registry and feature store', async () => {
  const fresh=await readFile(new URL('../sql/001_market_route_fresh.sql',import.meta.url),'utf8');
  const migration=await readFile(new URL('../sql/017_foundation_intelligence.sql',import.meta.url),'utf8');
  for(const token of ['prediction_lineage','provider_identity_map','feature_snapshots']){
    assert.match(fresh,new RegExp(token));assert.match(migration,new RegExp(token));
  }
});

test('public dashboard is simplified and administrative tools are removed from public navigation', async () => {
  const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const lab=await readFile(new URL('../public/engine-lab.html',import.meta.url),'utf8');
  assert.match(index,/Engine Lab/);assert.match(index,/Zeus Intelligence/);
  assert.doesNotMatch(index,/href="\/admin-engine-audit\.html"/);
  assert.doesNotMatch(index,/href="\/admin-calibration\.html"/);
  for(const name of ['Market Route','PPG Route','Apex Intelligence','Convergence','Momentum & Streak','Atlas Streak Value','Chronos HT\/FT','Zeus Intelligence']) assert.match(lab,new RegExp(name));
});
