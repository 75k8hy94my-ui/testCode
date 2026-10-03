import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const reader = read('reader.html');

test("the bookshelf launches a reader using the saved item's stable id", () => {
  assert.match(read('manga-list-host-runtime.js'), /buildReaderUrl\(itemId, deps\.navigation\.readerUrl\)/);
  assert.match(read('manga-list-host-runtime.js'), /prepareLaunch\(item\)/);
  assert.match(read('reader-target.js'), /function buildReaderUrl\(itemId/);
  assert.match(read('reader-target.js'), /itemIdFromLocation/);
});

test('reader requires an explicit item route and has no legacy URL or shelf screen fallback', () => {
  assert.match(reader, /itemIdFromLocation\(location\)/);
  assert.match(reader, /if \(!itemId\) \{ runtime\.close\(\); return; \}/);
  assert.doesNotMatch(reader, /readLegacyTarget|mangaReaderLastUrl|renderSavedList|saved-list|video-list|author-cards/);
});

test('closing the reader returns to the sole manga bookshelf entry', () => {
  assert.match(read('reader-runtime.js'), /function close\(\) \{\s*location\.replace\('manga\.html'\);/);
  assert.match(reader, /aria-label="本棚に戻る"/);
});

test('reader markup has no bookshelf, folder, list editing, video, settings, or backup UI', () => {
  for (const id of ['savedListOverlay', 'mangaListSection', 'folderList', 'bulkEditOverlay', 'videoListSection', 'settingsOverlay', 'backupOverlay']) {
    assert.doesNotMatch(reader, new RegExp(`id=["']${id}["']`), id);
  }
});
