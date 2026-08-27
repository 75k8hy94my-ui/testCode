import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('desktop video destination deep-links directly to the video list', () => {
  const rail = read('app-desktop-rail.js');
  assert.match(rail, /desktopNavVideo/);
  assert.match(rail, /reader\.html#screen=video-list/);
});

test('reader startup honors an explicit screen route before resume and default-list logic', () => {
  const reader = read('reader.html');
  assert.match(reader, /const requestedScreenOnLoad = getReaderScreenFromLocation\(\);/);
  assert.match(reader, /if \(!requestedScreenOnLoad\) \{[\s\S]*localStorage\.getItem\(LAST_URL_KEY\)/);
  assert.match(reader, /if \(!requestedScreenOnLoad && !resumedOnLoad\) openSavedList\(true\);/);
});

test('reader location parser recognizes the video-list route', () => {
  const reader = read('reader.html');
  assert.match(reader, /'video-list': els\.savedListOverlay/);
  assert.match(reader, /if \(currentReaderScreen === 'video-list'\) switchListTab\('video'\)/);
});
