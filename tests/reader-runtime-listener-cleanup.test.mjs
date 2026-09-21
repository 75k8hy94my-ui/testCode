import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('reader runtime owns and releases its global listeners during SPA cleanup', () => {
  const reader = read('reader.html');
  const spa = read('home-profile-spa.js');
  assert.match(reader, /const readerGlobalListeners = \[\];/);
  assert.match(reader, /function bindReaderGlobal\(/);
  assert.match(reader, /window\.MangaReaderRuntimeCleanup = cleanupReaderGlobalListeners/);
  assert.match(reader, /bindReaderGlobal\(window,\s*'visibilitychange'/);
  assert.match(reader, /bindReaderGlobal\(window,\s*'pagehide'/);
  assert.match(reader, /bindReaderGlobal\(window,\s*'popstate'/);
  assert.match(reader, /bindReaderGlobal\(window,\s*'hashchange'/);
  assert.match(reader, /bindReaderGlobal\(document,\s*'click'/);
  assert.match(reader, /bindReaderGlobal\(document,\s*'keydown'/);
  assert.match(spa, /if\(typeof window\.MangaReaderRuntimeCleanup==='function'\)window\.MangaReaderRuntimeCleanup\(\);/);
});
