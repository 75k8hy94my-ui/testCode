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

test('video routing bridge opens enhanced cards through the legacy History API player path', () => {
  const source = read('video-routing-fix.js');
  assert.match(source, /\.vl-open/);
  assert.match(source, /videoItem/);
  assert.match(source, /node\.click\(\)/);
  assert.match(source, /addEventListener\(['"]click['"],[\s\S]*true\)/);
  assert.match(source, /mangaReaderVideoMeta/);
  assert.match(source, /MangaVaultPayload\.buildFromLocalStorage/);
  assert.match(source, /MangaVault\.savePayload/);
});

test('browser bootstrap restores encrypted sidecars when legacy reader imports a backup', () => {
  const source = read('recommendations.js');
  assert.match(source, /MangaReaderBackup\.migrateBackup/);
  assert.match(source, /mangaReaderVideoFolders/);
  assert.match(source, /mangaReaderVideoMeta/);
  assert.match(source, /installVideoBackupRestoreHook/);
});
