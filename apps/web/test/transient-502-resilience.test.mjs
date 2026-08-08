import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');
test('engine pages treat gateway 502/503/504 as transient and retry',async()=>{for(const file of ['market-route.js','ppg-route.js','apex-intelligence.js','convergence.js','momentum-streak.js','streak-value.js','htft-momentum.js']){const js=await read(`public/${file}`);assert.match(js,/502|transient|gateway|recover/i,`${file} lacks transient recovery`);}});
test('server returns snapshots before background provider work and retries failed shared jobs',async()=>{const server=await read('src/server.mjs');assert.match(server,/queueMicrotask\(\(\) => ensureStatsRouteView/);assert.match(server,/stage:\s*'RETRYING'/);assert.match(server,/queueMicrotask\(\(\) => getStreakValueBoard/);});
