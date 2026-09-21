import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

function loadFactory() {
  const context = { self: {}, console };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'manga-list-host-runtime.js'), 'utf8'), context);
  return context.self.MangaListHostRuntimeFactory;
}

function deps(calls) {
  let state = { savedItems: ['items'], savedFolders: ['folders'], authorCards: ['authors'] };
  return {
    safeWriteJson(key, value) { calls.push(['write', key, value]); },
    getState() { calls.push('state'); return state; },
    persistVideos() { calls.push('videos'); },
    keys: { savedItems: 'items-key', savedFolders: 'folders-key', authorCards: 'authors-key', savedVideos: 'videos-key' },
    sync: {
      hasActiveVault() { calls.push('vault'); return true; },
      clearTimer(timer) { calls.push(['clear', timer]); },
      setTimer(callback, delay) { calls.push(['timer', delay]); return 'timer-id'; },
      savePayload(payload) { calls.push(['save', payload]); },
      buildBasePayload() { calls.push('base'); return {}; },
      getSavedVideos() { calls.push('saved-videos'); return ['memory-videos']; },
      readStorageItem(key) { calls.push(['read', key]); return '["stored-videos"]'; },
      getMangaInfo() { calls.push('manga-info'); return { info: true }; },
      getToc() { calls.push('toc'); return { toc: true }; },
      getTheme() { calls.push('theme'); return 'dark'; },
      getDashboardVisibility() { calls.push('dashboard'); return { desktop: {} }; },
      onSyncError(message, kind) { calls.push(['error', message, kind]); },
    },
  };
}

test('host factory exposes the shared persistence callbacks and rejects missing dependencies', () => {
  const factory = loadFactory();
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.ok(Object.isFrozen(factory));
  assert.throws(() => factory.create(), (error) => error.name === 'TypeError');
  const complete = deps([]);
  for (const key of ['safeWriteJson', 'getState', 'persistVideos', 'keys', 'sync']) {
    const missing = { ...complete };
    delete missing[key];
    assert.throws(() => factory.create(missing), (error) => error.name === 'TypeError' && error.message.includes(key === 'keys' ? 'keys' : key));
  }
  for (const name of [
    'hasActiveVault', 'clearTimer', 'setTimer', 'savePayload', 'buildBasePayload',
    'getSavedVideos', 'readStorageItem', 'getMangaInfo', 'getToc', 'getTheme',
    'getDashboardVisibility', 'onSyncError',
  ]) {
    const missing = deps([]);
    delete missing.sync[name];
    assert.throws(() => factory.create(missing), (error) => error.name === 'TypeError' && error.message.includes(name));
  }
});

test('host persistence preserves write and sync order', () => {
  const calls = [];
  const host = loadFactory().create(deps(calls));
  assert.deepEqual(Object.keys(host), [
    'persistItems', 'persistFolders', 'persistAuthorCards', 'persistAll',
    'buildSyncPayload', 'runCloudSync', 'scheduleCloudSync',
  ]);
  assert.ok(Object.isFrozen(host));
  host.persistAll();
  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] + ':' + call[1] : call), [
    'state', 'write:folders-key', 'vault', 'clear:null', 'timer:5000',
    'state', 'write:items-key', 'vault', 'clear:timer-id', 'timer:5000',
    'state', 'write:authors-key', 'vault', 'clear:timer-id', 'timer:5000',
    'videos',
  ]);
});

test('host builds the sync payload through explicit injected dependencies', () => {
  const calls = [];
  const host = loadFactory().create(deps(calls));
  assert.equal(JSON.stringify(host.buildSyncPayload()), JSON.stringify({
    folders: ['folders'],
    items: ['items'],
    videos: ['stored-videos'],
    authorCards: ['authors'],
    mangaInfo: { info: true },
    toc: { toc: true },
    theme: 'dark',
    dashboardVisibility: { desktop: {} },
  }));
  assert.deepEqual(calls, [
    'base', 'saved-videos', ['read', 'videos-key'], 'state',
    'manga-info', 'toc', 'theme', 'dashboard',
  ]);
});

test('reader delegates persistence to the host boundary without duplicating implementations', () => {
  const reader = fs.readFileSync(path.join(root, 'reader.html'), 'utf8');
  assert.match(reader, /manga-list-host-runtime\.js\?v=/);
  assert.match(reader, /MangaListHostRuntimeFactory\.create\(/);
  assert.match(reader, /persistItems:\s*mangaListHostRuntime\.persistItems/);
  assert.match(reader, /persistFolders:\s*mangaListHostRuntime\.persistFolders/);
  assert.match(reader, /persistAuthorCards:\s*mangaListHostRuntime\.persistAuthorCards/);
  assert.match(reader, /persistAll:\s*mangaListHostRuntime\.persistAll/);
  assert.equal((reader.match(/function persistItems\s*\(/g) || []).length, 0);
  assert.equal((reader.match(/function persistFolders\s*\(/g) || []).length, 0);
  assert.equal((reader.match(/function persistAuthorCards\s*\(/g) || []).length, 0);
  assert.equal((reader.match(/function persistAll\s*\(/g) || []).length, 0);
  assert.equal((reader.match(/function scheduleCloudSync\s*\(/g) || []).length, 0);
  assert.equal((reader.match(/function runCloudSync\s*\(/g) || []).length, 0);
  assert.equal((reader.match(/function buildSyncPayload\s*\(/g) || []).length, 0);
  assert.match(reader, /const persistItems = \(\) => mangaListHostRuntime\.persistItems\(\);/);
  assert.match(reader, /const scheduleCloudSync = \(\) => mangaListHostRuntime\.scheduleCloudSync\(\);/);
  assert.match(reader, /const runCloudSync = \(\) => mangaListHostRuntime\.runCloudSync\(\);/);
  assert.match(reader, /const buildSyncPayload = \(\) => mangaListHostRuntime\.buildSyncPayload\(\);/);
});
