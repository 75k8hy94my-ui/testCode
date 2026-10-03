import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');

test('reader keeps page controls reachable on narrow screens without a bookshelf navigation bar', () => {
  assert.match(reader, /@media\(max-width:700px\)/);
  for (const id of ['prevBtn', 'nextBtn', 'pageSlider', 'closeBtn']) assert.match(reader, new RegExp(`id="${id}"`));
  assert.doesNotMatch(reader, /mobileBottomNav|mobileUtilityMenu|mobileNavManga/);
});

test('reader is a dedicated independent document with no multi-screen app navigation', () => {
  assert.match(reader, /id="readerApp"/);
  assert.doesNotMatch(reader, /data-reader-route|ReaderShell|switchListTab/);
});
