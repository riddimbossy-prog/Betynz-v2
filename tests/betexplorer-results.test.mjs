import test from 'node:test';import assert from 'node:assert/strict';
import {parseResults,BetexplorerHtft} from '../src/providers/betexplorer-htft.mjs';
const row=(home,away,score,date,id)=>`<tr><td><a href="/football/test/league/${id}/" class="in-match"><span>${home}</span> - <span>${away}</span></a></td><td><a>${score}</a></td><td>${date}</td></tr>`;
test('BetExplorer result rows preserve actual scores and reject non-regulation results',()=>{
  const html=row('Alpha','Beta','2:1','20.09.','one')+row('Beta','Alpha','1:0 AET','19.09.','two')+row('Alpha','Beta','-:-','18.09.','three');
  const records=parseResults(html,new Date('2026-10-02'));
  assert.equal(records.length,1);assert.equal(records[0].home,2);assert.equal(records[0].away,1);assert.equal(records[0].htHome,null);
  assert.equal(records[0].date,'2026-09-20T00:00:00.000Z');
  assert.equal(parseResults(row('Alpha','Beta','2:1','30.12.','old'),new Date('2026-01-02'))[0].date,'2025-12-30T00:00:00.000Z');
});
test('BetExplorer fallback verifies identities and builds separate home/away form',async()=>{
  const html=row('Alpha','Other','2:0','20.09.','one')+row('Other','Beta','1:3','19.09.','two')+row('Beta','Alpha','0:0','18.09.','three');let calls=0;
  const provider=new BetexplorerHtft({interval:0,fetchImpl:async()=>{calls++;return new Response(html);}});
  const fixture={kickoff:'2099-10-02T20:00:00Z',home:{name:'Alpha FC'},away:{name:'Beta FC'},league:{name:'League',country:'Test'}};
  const enriched=await provider.enrich(fixture);assert.equal(enriched.statsSource,'BetExplorer');assert.equal(enriched.homeHistory.length,1);assert.equal(enriched.awayHistory.length,1);assert.equal(enriched.h2h.length,1);
  assert.equal(enriched.homeHistory[0].home,2);assert.equal(enriched.awayHistory[0].away,3);
  await provider.enrich(fixture);assert.equal(calls,1);
  await assert.rejects(()=>provider.enrich({...fixture,home:{name:'Unknown team'}}),/identity not verified/);
});
