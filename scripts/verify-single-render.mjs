import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const found = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name === 'render.yaml') found.push(relative(root, full));
  }
}
await walk(root);
if (found.length !== 1 || found[0] !== 'render.yaml') {
  throw new Error(`Expected exactly one root render.yaml; found: ${found.join(', ') || 'none'}`);
}
const render = await readFile(join(root, 'render.yaml'), 'utf8');
const serviceCount = (render.match(/^\s*-\s+type:\s+web\s*$/gm) || []).length;
if (serviceCount !== 1) throw new Error(`Expected one Render web service, found ${serviceCount}.`);
const starter = await readFile(join(root, 'scripts', 'start-combined.mjs'), 'utf8');
for (const required of ['apps/sportybet-api', 'apps/web', 'BETYNZ_DATA_API_BASE_URL', 'SPORTYBET_API_KEY']) {
  if (!starter.includes(required.split('/').pop()) && !starter.includes(required)) throw new Error(`Combined launcher is missing ${required}.`);
}
for (const required of ['API_FOOTBALL_KEY', 'API_FOOTBALL_BASE_URL', 'API_FOOTBALL_KEY_HEADER']) {
  if (!render.includes(required)) throw new Error(`Root Render configuration is missing ${required}.`);
}
console.log('Single-Render verification passed: one service, one render.yaml, SportyBet core + API-Football intelligence + Betynz engines.');
