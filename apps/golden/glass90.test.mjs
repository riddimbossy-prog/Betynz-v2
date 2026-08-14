import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('./public/glass-90.css',import.meta.url),'utf8');
const html=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
const rated=readFileSync(new URL('./public/highly-rated.html',import.meta.url),'utf8');

assert.match(html,/glass-90\.css\?v=7\.4\.0/);
assert.match(rated,/glass-90\.css\?v=7\.4\.0/);
assert.match(css,/--glass90-blur:36px/);
assert.match(css,/backdrop-filter:blur\(var\(--glass90-blur\)\) saturate\(165%\)/);
assert.match(css,/rgba\(8,10,13,\.16\)/);
assert.match(css,/\.banker-card,\.match,\.rated-card/);
assert.match(css,/dialog::backdrop/);
assert.match(css,/@media\(max-width:760px\)/);
assert.match(css,/@media\(prefers-reduced-transparency:reduce\)/);

console.log('90 percent glassmorphism theme tests passed');
