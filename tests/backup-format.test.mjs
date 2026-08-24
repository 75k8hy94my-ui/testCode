import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import backup from '../backup-format.js';
const { createBackup, migrateBackup } = backup;

test('versioned backup round-trips author cards', () => {
  const data = { folders: [{ id: 'f' }], items: [], authorCards: [{ id: 'a', name: '作者' }], theme: 'light' };
  const backup = createBackup(data, '2026-08-22T00:00:00.000Z');
  assert.deepEqual(migrateBackup(backup), { folders: data.folders, items: [], videos: [], authorCards: data.authorCards, mangaInfo: {}, toc: {}, lastPages: {}, theme: 'light', dashboardVisibility: { mobile: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false }, desktop: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false } } });
});

test('legacy raw payload migrates and future versions are rejected', () => {
  assert.deepEqual(migrateBackup({ folders: [], items: [] }).authorCards, []);
  assert.throws(() => migrateBackup({ format: 'manga-reader-backup', version: 99, data: {} }));
});

test('backup and vault payload browser scripts can load together', () => {
  const context = vm.createContext({ window: {}, console });
  vm.runInContext(fs.readFileSync(new URL('../vault-payload.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../backup-format.js', import.meta.url), 'utf8'), context);
  assert.equal(typeof context.window.MangaVaultPayload.normalize, 'function');
  assert.equal(typeof context.window.MangaReaderBackup.createBackup, 'function');
});
