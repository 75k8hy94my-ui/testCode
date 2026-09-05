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

test('enhanced editor presents URL as the only playback locator while legacy fields stay internal', () => {
  const library = read('video-library.js');
  const bridge = read('video-routing-fix.js');
  assert.match(library, /id=["']videoLibraryUrl["']/);
  assert.match(bridge, /videoLibraryLegacyService/);
  assert.match(bridge, /videoLibraryLegacyId/);
  assert.match(bridge, /classifyVideoUrl/);
  assert.match(bridge, /\.remove\(\)/);
  assert.match(bridge, /addEventListener\(['"]submit['"],[\s\S]*true\)/);
});

test('video editor locks URL until the explicit edit button and exposes one-click existing tags', () => {
  const library = read('video-library.js');
  assert.match(library, /videoLibraryUrlEdit/);
  assert.match(library, /readOnly/);
  assert.match(library, /videoLibrarySuggestedTags/);
  assert.match(library, /suggestedTag\.addEventListener\(['"]click['"]/);
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
