import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('all public pages declare a device viewport and load the lightweight motion layer', async () => {
  const files = (await readdir(new URL('../public/', import.meta.url))).filter(name => name.endsWith('.html'));
  for (const name of files) {
    const html = await read(`public/${name}`);
    assert.match(html, /name="viewport"/i, `${name} is missing viewport metadata`);
    assert.match(html, /motion\.js\?v=5\.0\.11/, `${name} is missing the lightweight motion layer`);
    assert.match(html, /favicon\.ico/, `${name} is missing favicon metadata`);
    assert.match(html, /apple-touch-icon/, `${name} is missing Apple PWA metadata`);
  }
});

test('responsive CSS includes phone, Z Fold cover, Z Fold inner, tablet, desktop and reduced-motion rules', async () => {
  const css = await read('public/styles.css');
  assert.match(css, /@media\(max-width:380px\)/);
  assert.match(css, /@media\(min-width:600px\) and \(max-width:760px\)/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:1024px\)/);
  assert.match(css, /@media\(min-width:1600px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /max-width:calc\(100dvw - 24px\)/);
  assert.match(css, /overflow-x:clip/);
});

test('fixture board motion is minimal while PWA splash and win ticker remain accessible', async () => {
  const motion = await read('public/motion.js');
  const css = await read('public/styles.css');
  assert.match(motion, /prefers-reduced-motion/);
  assert.match(motion, /display-mode: standalone/);
  assert.match(motion, /minimal-board-motion/);
  assert.doesNotMatch(motion, /IntersectionObserver/);
  assert.doesNotMatch(motion, /pointermove/);
  assert.doesNotMatch(motion, /scheduleLightning/);
  assert.match(css, /winTicker/);
  assert.match(css, /pwa-launch-splash/);
  assert.match(css, /content-visibility:auto/);
  assert.match(css, /\.minimal-board-motion \.match-row/);
});

test('new audit and calibration pages are mobile navigable', async () => {
  for (const name of ['admin-engine-audit.html','admin-calibration.html']) {
    const html = await read(`public/${name}`);
    assert.match(html, /mobile-bottom-nav/);
    assert.match(html, /admin-grid-page/);
  }
});
