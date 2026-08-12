import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('./runtimeJobs.mjs',import.meta.url),'utf8');

assert.match(source,/async function seedFixtureDate\(date\)/);
assert.match(source,/async function preloadFixtureLists\(\)/);
assert.match(source,/await preloadFixtureLists\(\);[\s\S]*for\(let n=0;n<=PRELOAD_DAYS_AHEAD;n\+\+\)/,'Fixture lists must be seeded before deep week analysis starts');
assert.match(source,/fixtureSeededDates=new Set\(\)/);
assert.match(source,/seededFixtureDates:\[\.\.\.fixtureSeededDates\]/);
assert.match(source,/source:'PRELOADED_BOARD'/);
assert.match(source,/if\(date>utcDate\(\)\)/);
assert.match(source,/const cached=snapshots\.get\(date\)\|\|await hydrate\(date\)\.catch\(\(\)=>null\)/);
assert.match(source,/const seeded=await seedFixtureDate\(date\)/);
assert.match(source,/checkpointBoard\(\{boardKey:ENGINE,date,complete:false,processed:0,total,payload:seed/);
assert.match(source,/queueMicrotask\(\(\)=>preloadUpcomingWeek\(\)\.catch\(\(\)=>null\)\)/);

console.log('Future fixture seed-first preload regression tests passed');
