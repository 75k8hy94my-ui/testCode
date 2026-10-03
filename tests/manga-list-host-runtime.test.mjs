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
    images: imageDeps(calls),
    navigation: {
      lastUrlKey: 'last-url-key',
      readerUrl: 'reader.html',
      writeStorage(key, value) { calls.push(['navigation-write', key, value]); },
      navigate(url) { calls.push(['navigate', url]); },
      buildReaderUrl(itemId, base) {
        calls.push(['build-reader-url', itemId, base]);
        return `${base}?item=${encodeURIComponent(itemId)}`;
      },
      prepareLaunch(item) { calls.push(['prepare-launch', item.id]); return true; },
    },
  };
}

function imageDeps(calls) {
  return {
    parseInputUrl(value) { calls.push(['parse', value]); return { baseUrl: value + '/base', pattern: null }; },
    getCachedMangaInfo(...args) { calls.push(['cached-info', ...args]); return null; },
    getCoverSourceCache() { calls.push('source-cache'); return new Map(); },
    getCoverFailedCache() { calls.push('failed-cache'); return new Set(); },
    pageUrlFor(baseUrl, page, extIndex, width) { return baseUrl + '/' + page + '-' + extIndex + '-' + width; },
    extCandidates: ['jpg'],
    loadTimeoutMs: 60000,
    sessionKey: 'mangaReaderSupabaseSession',
    readStorageItem(key) {
      calls.push(['image-read', key]);
      return key === 'mangaReaderSupabaseSession' ? '{"access_token":"token"}' : null;
    },
    getSupabaseConfig() { calls.push('supabase-config'); return { url: 'https://storage.example' }; },
    getLocalStoragePathFromUrl() { calls.push('path'); return 'folder/cover.jpg'; },
    loadCachedLocalImage() { calls.push('cached-image'); return Promise.resolve('blob:cover'); },
    rememberLocalCoverObjectUrl(url) { calls.push(['remember-cover', url]); },
    setTimer(callback, delay) { calls.push(['image-timer', delay]); return 'image-timer'; },
    clearTimer(timer) { calls.push(['image-clear', timer]); },
  };
}

test('host factory exposes the shared persistence callbacks and rejects missing dependencies', () => {
  const factory = loadFactory();
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.ok(Object.isFrozen(factory));
  assert.throws(() => factory.create(), (error) => error.name === 'TypeError');
  const complete = deps([]);
  for (const key of ['safeWriteJson', 'getState', 'persistVideos', 'keys', 'sync', 'navigation']) {
    const missing = { ...complete };
    delete missing[key];
    assert.throws(() => factory.create(missing), (error) => error.name === 'TypeError' && error.message.includes(key === 'keys' ? 'keys' : key));
  }
  for (const name of ['buildReaderUrl', 'prepareLaunch']) {
    const missingNavigationDependency = deps([]);
    delete missingNavigationDependency.navigation[name];
    assert.throws(() => factory.create(missingNavigationDependency), (error) => error.name === 'TypeError' && error.message.includes(name));
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
    'buildSyncPayload', 'runCloudSync', 'scheduleCloudSync', 'setupFeedImage', 'loadLocalCover',
    'navigateToReader',
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

test('host rejects missing image dependencies and exposes image callbacks', async () => {
  const factory = loadFactory();
  const complete = deps([]);
  for (const name of ['parseInputUrl', 'loadCachedLocalImage', 'setTimer']) {
    const missing = { ...complete, images: { ...complete.images } };
    delete missing.images[name];
    assert.throws(() => factory.create(missing), (error) => error.name === 'TypeError' && error.message.includes(name));
  }
  const calls = [];
  const host = factory.create(deps(calls));
  assert.equal(typeof host.setupFeedImage, 'function');
  assert.equal(typeof host.loadLocalCover, 'function');
  assert.equal(typeof host.navigateToReader, 'function');
  assert.ok(Object.isFrozen(host));

  const img = {
    currentSrc: '',
    src: '',
    isConnected: true,
    addEventListener(type, callback) { if (type === 'load') this.onLoad = callback; },
  };
  const item = { storagePaths: ['folder/cover.jpg'], storageBytes: [4] };
  const load = host.loadLocalCover(item, img);
  await load;
  assert.equal(img.src, 'blob:cover');
  assert.deepEqual(calls.slice(-4), [
    ['image-read', 'mangaReaderSupabaseSession'],
    'supabase-config',
    'cached-image',
    ['remember-cover', 'blob:cover'],
  ]);
});

test('host preserves manga item payload and reader navigation order', () => {
  const calls = [];
  const host = loadFactory().create(deps(calls));

  host.navigateToReader({ id: 'item-1' });
  assert.deepEqual(calls, [
    'state',
    ['write', 'items-key', ['items']],
    ['prepare-launch', 'item-1'],
    ['navigation-write', 'last-url-key', JSON.stringify({ kind: 'item', itemId: 'item-1' })],
    ['build-reader-url', 'item-1', 'reader.html'],
    ['navigate', 'reader.html?item=item-1'],
  ]);

  calls.length = 0;
  assert.throws(() => host.navigateToReader({}), /saved manga item id is required/);
  assert.deepEqual(calls, []);
});

test('host setupFeedImage preserves extension fallback and shared cover cache updates', () => {
  const calls = [];
  const sourceCache = new Map();
  const failedCache = new Set();
  const complete = deps(calls);
  complete.images = {
    ...complete.images,
    extCandidates: ['jpg', 'png'],
    getCoverSourceCache() { return sourceCache; },
    getCoverFailedCache() { return failedCache; },
  };
  const host = loadFactory().create(complete);
  const handlers = {};
  const img = {
    currentSrc: '',
    src: '',
    addEventListener(type, callback) { handlers[type] = callback; },
  };
  host.setupFeedImage(img, 'https://example.test/manga', 3, null, 'item-1');
  assert.equal(img.src, 'https://example.test/manga/base/1-0-3');
  assert.deepEqual(calls.find((call) => Array.isArray(call) && call[0] === 'cached-info'), [
    'cached-info', 'item:item-1', 'https://example.test/manga/base',
  ]);
  handlers.error();
  assert.equal(img.src, 'https://example.test/manga/base/1-1-3');
  img.currentSrc = img.src;
  handlers.load();
  assert.equal(sourceCache.size, 1);
  host.setupFeedImage(img, 'https://example.test/manga', 3, null, 'item-1');
  assert.equal(img.src, 'https://example.test/manga/base/1-1-3');
});

test('manga route owns shelf persistence and Reader uses its narrow item repository', () => {
  const reader = fs.readFileSync(path.join(root, 'reader.html'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'manga-list-route.js'), 'utf8');
  assert.match(route, /manga-list-host-runtime\.js\?v=/);
  assert.match(route, /MangaListHostRuntimeFactory\.create\(/);
  assert.match(route, /persistAll: host\.persistAll/);
  assert.doesNotMatch(reader, /manga-list-host-runtime|MangaListHostRuntimeFactory|persistFolders|persistAuthorCards/);
  assert.match(reader, /reader-item-repository\.js/);
  assert.match(reader, /ReaderItemRepositoryFactory\.create\(/);
  assert.match(reader, /MangaVault\.savePayload\(payload\)/);
  assert.match(fs.readFileSync(path.join(root, 'reader-item-repository.js'), 'utf8'), /dependencies\.scheduleSync\(\)/);
});
