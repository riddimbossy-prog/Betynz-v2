import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readRoot = path => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('production server exposes seven engines with API-Football core and Stats API enrichment', async () => {
 const server=await read('src/server.mjs');
 for(const code of ['MARKET_ROUTE','PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK','STREAK_VALUE','HTFT_MOMENTUM']) assert.match(server,new RegExp(code));
 for(const token of ['getApiFootballFixtureBoard','getApiFootballLiveBoard','getApiFootballResults','buildStatsApiFixtureEvidence','analyzeHtftMomentum']) assert.match(server,new RegExp(token));
});

test('public dashboard contains all seven active engines', async()=>{const html=await read('public/index.html');for(const label of ['Market Route','PPG Route','Apex Intelligence','Convergence','Momentum','Atlas Streak','Chronos HT/FT'])assert.match(html,new RegExp(label));assert.match(html,/SEVEN ENGINES/);});

test('one Render service configures API-Football plus optional Stats API',async()=>{const env=await read('.env.example'),render=await readRoot('render.yaml'),rootPackage=JSON.parse(await readRoot('package.json'));for(const key of ['API_FOOTBALL_KEY','STATS_API_KEY']){assert.match(env,new RegExp(key));assert.match(render,new RegExp(key));}assert.equal((render.match(/type:\s*web/g)||[]).length,1);assert.equal(rootPackage.scripts.start,'node apps/web/src/server.mjs');});

test('only web app remains and all seven engine modules exist',async()=>{for(const path of ['src/engines/marketRoute.mjs','src/engines/ppgRoute.mjs','src/engines/apexIntelligence.mjs','src/engines/convergence.mjs','src/engines/momentumStreak.mjs','src/engines/streakValue.mjs','src/engines/htftMomentum.mjs','src/engines/consensus.mjs','src/lib/apiFootball.mjs','src/lib/statsApi.mjs'])await access(new URL(`../${path}`,import.meta.url));const apps=(await readdir(new URL('../../../apps/',import.meta.url),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name);assert.deepEqual(apps,['web']);});

test('fresh database schema accepts seven engine codes',async()=>{const sql=await read('sql/001_market_route_fresh.sql');for(const code of ['MARKET_ROUTE','PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK','STREAK_VALUE','HTFT_MOMENTUM'])assert.match(sql,new RegExp(code));assert.match(sql,/agreement_count between 1 and 7/i);});
