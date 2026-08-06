import { readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appsRoot = join(root, 'apps');
const removed = [];

// A full repository copy does not delete old folders in Git/GitHub. Remove every
// retired app before tests so API-Football-only deployments cannot accidentally
// retain a former provider service.
for (const entry of await readdir(appsRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name === 'web') continue;
  await rm(join(appsRoot, entry.name), { recursive: true, force: true });
  removed.push(`apps/${entry.name}`);
}

// Remove known root launchers/artifacts from earlier unified-provider releases.
for (const relativePath of [
  'start-unified.mjs',
  'start-combined.mjs',
  'test/unified-flow.test.mjs',
  'test/retired-provider-single-service-smoke.mjs'
]) {
  await rm(join(root, relativePath), { recursive: true, force: true });
}

console.log(`Provider reset complete. Removed ${removed.length ? removed.join(', ') : 'no retired app directories'}.`);
