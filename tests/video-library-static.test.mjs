import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL('../'+name, import.meta.url), 'utf8');

test('recommendations bootstrap loads the video enhancement after existing reader code', () => {
  const source = read('recommendations.js');
  assert.match(source, /video-data\.js/);
  assert.match(source, /video-library\.js/);
  assert.match(source, /video-routing-fix\.js/);
  assert.match(source, /DOMContentLoaded/);
});

test('video library provides search filters sorting view modes folders and editor hooks', () => {
  const source = read('video-library.js');
  for (const marker of ['videoLibrarySearch','videoLibraryQuick','videoLibraryFolder','videoLibraryTag','videoLibraryService','videoLibrarySort','videoLibraryView','videoLibrarySheet','videoLibraryFolders']) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /mangaReaderVideoMeta/);
  assert.match(source, /mangaReaderVideoFolders/);
  assert.match(source, /MangaVaultPayload\.buildFromLocalStorage/);
  assert.match(source, /MangaVault\.savePayload/);
  assert.match(source, /confirmVideoAddBtn/);
  assert.match(source, /videoDeleteBtn/);
  assert.match(source, /history\.pushState/);
});

test('video editor accepts one URL and does not expose legacy service or video ID fields', () => {
  const source = read('video-library.js');
  assert.match(source, /id=["']videoLibraryUrl["']/);
  assert.match(source, /classifyVideoUrl/);
  assert.doesNotMatch(source, /videoLibraryLegacyService/);
  assert.doesNotMatch(source, /videoLibraryLegacyId/);
  assert.doesNotMatch(source, /parseThroughLegacy/);
});

test('video routing bridge plays direct video URLs with a video element and keeps legacy iframe playback', () => {
  const source = read('video-routing-fix.js');
  assert.match(source, /\.vl-open/);
  assert.match(source, /vl-inline-player/);
  assert.match(source, /classifyVideoUrl/);
  assert.match(source, /createElement\(['"]video['"]\)/);
  assert.match(source, /\.controls\s*=\s*true/);
  assert.match(source, /\.playsInline\s*=\s*true/);
  assert.match(source, /createElement\(['"]iframe['"]\)/);
  assert.match(source, /stopImmediatePropagation/);
  assert.match(source, /recordOpen/);
  assert.match(source, /addEventListener\(['"]click['"],[\s\S]*true\)/);
  assert.doesNotMatch(source, /node\.click\(\)/);
  assert.doesNotMatch(source, /screen=video-player/);
  assert.match(source, /MangaVaultPayload\.buildFromLocalStorage/);
  assert.match(source, /MangaVault\.savePayload/);
});

test('browser backup hook commits encrypted video sidecars only after import confirmation', () => {
  const source = read('recommendations.js');
  assert.match(source, /MangaReaderBackup\.migrateBackup/);
  assert.match(source, /installVideoBackupRestoreHook/);
  assert.match(source, /root\.confirm/);
  assert.match(source, /accepted[\s\S]*mangaReaderVideoFolders/);
  assert.match(source, /accepted[\s\S]*mangaReaderVideoMeta/);
  assert.match(source, /setTimeout[\s\S]*root\.confirm/);
});
