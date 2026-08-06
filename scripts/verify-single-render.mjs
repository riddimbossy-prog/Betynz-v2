import { readdir, readFile, access } from 'node:fs/promises';
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
if (found.length !== 1 || found[0] !== 'render.yaml') throw new Error(`Expected exactly one root render.yaml; found: ${found.join(', ') || 'none'}`);
await access(join(root, 'apps', 'web', 'src', 'server.mjs'));
const render = await readFile(join(root, 'render.yaml'), 'utf8');
const packageText = await readFile(join(root, 'package.json'), 'utf8');
const serviceCount = (render.match(/^\s*-\s+type:\s+web\s*$/gm) || []).length;
if (serviceCount !== 1) throw new Error(`Expected one Render web service, found ${serviceCount}.`);
for (const required of ['API_FOOTBALL_KEY', 'API_FOOTBALL_BASE_URL', 'API_FOOTBALL_KEY_HEADER']) {
  if (!render.includes(required)) throw new Error(`Root Render configuration is missing ${required}.`);
}
const apps = (await readdir(join(root, 'apps'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
if (JSON.stringify(apps) !== JSON.stringify(['web'])) throw new Error(`Expected only apps/web; found: ${apps.join(', ')}`);
console.log('Single-Render verification passed: one service, one render.yaml and one API-Football data layer.');
