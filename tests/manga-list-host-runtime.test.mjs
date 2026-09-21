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
    scheduleCloudSync() { calls.push('sync'); },
    persistVideos() { calls.push('videos'); },
    keys: { savedItems: 'items-key', savedFolders: 'folders-key', authorCards: 'authors-key' },
  };
}

test('host factory exposes the shared persistence callbacks and rejects missing dependencies', () => {
  const factory = loadFactory();
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.ok(Object.isFrozen(factory));
  assert.throws(() => factory.create(), (error) => error.name === 'TypeError');
  const complete = deps([]);
  for (const key of ['safeWriteJson', 'getState', 'scheduleCloudSync', 'persistVideos', 'keys']) {
    const missing = { ...complete };
    delete missing[key];
    assert.throws(() => factory.create(missing), (error) => error.name === 'TypeError' && error.message.includes(key === 'keys' ? 'keys' : key));
  }
});

test('host persistence preserves write and sync order', () => {
  const calls = [];
  const host = loadFactory().create(deps(calls));
  assert.deepEqual(Object.keys(host), ['persistItems', 'persistFolders', 'persistAuthorCards', 'persistAll']);
  assert.ok(Object.isFrozen(host));
  host.persistAll();
  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] + ':' + call[1] : call), [
    'state', 'write:folders-key', 'sync',
    'state', 'write:items-key', 'sync',
    'state', 'write:authors-key', 'sync',
    'videos',
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
  assert.match(reader, /const persistItems = \(\) => mangaListHostRuntime\.persistItems\(\);/);
});
