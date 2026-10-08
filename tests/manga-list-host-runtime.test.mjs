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
    canReadProtectedData() { return true; },
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

test('protected persistence and sync do nothing when protected-data access is blocked', async () => {
  const calls = [];
  const access = deps(calls);
  access.canReadProtectedData = () => false;
  const host = loadFactory().create(access);
  host.persistAll();
  host.scheduleCloudSync();
  await host.runCloudSync();
  assert.deepEqual(calls, []);
});

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
    getLocalCoverObjectUrl(key) { calls.push(['get-cover', key]); return ''; },
    rememberLocalCoverObjectUrl(key, url) { calls.push(['remember-cover', key, url]); },
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
  for (const name of ['buildReaderUrl', 'navigate']) {
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
    'buildSyncPayload', 'runCloudSync', 'flushCloudSync', 'scheduleCloudSync', 'setupFeedImage', 'loadLocalCover',
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
    'supabase-config',
    ['get-cover', 'https://storage.example||folder/cover.jpg'],
    'cached-image',
    ['remember-cover', 'https://storage.example||folder/cover.jpg', 'blob:cover'],

  ]);
});

test('host reuses a cached local cover object URL without reading the image cache again', async () => {
  const calls = [];
  const complete = deps(calls);
  complete.images.getLocalCoverObjectUrl = (key) => { calls.push(['get-cover', key]); return 'blob:cached-cover'; };
  const host = loadFactory().create(complete);
  const img = { src: '', isConnected: true };
  await host.loadLocalCover({ storagePaths: ['folder/cover.jpg'] }, img);
  assert.equal(img.src, 'blob:cached-cover');
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === 'get-cover'));
  assert.ok(!calls.includes('cached-image'));
});

test('host checkpoints the shelf then performs standalone Reader document navigation', () => {
  const calls = [];
  const host = loadFactory().create(deps(calls));

  host.navigateToReader({ id: 'item-1' });
  assert.deepEqual(calls, [
    'state',
    ['write', 'items-key', ['items']],
    ['build-reader-url', 'item-1', 'reader.html'],
    ['navigate', 'reader.html?item=item-1'],
  ]);

  calls.length = 0;
  assert.throws(() => host.navigateToReader({}), /saved manga item id is required/);
  assert.deepEqual(calls, []);
});

test('host rejects Reader navigation while protected-data access is blocked', async () => {
  const calls = [];
  const access = deps(calls);
  access.canReadProtectedData = () => false;
  const host = loadFactory().create(access);
  assert.equal(await host.navigateToReader({ id: 'secret-id' }), false);
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
  assert.match(route, /manga-list-cover-cache\.js\?v=/);
  assert.match(route, /getLocalCoverObjectUrl: coverCache\.getLocalCover/);
  assert.match(route, /getCoverSourceCache: coverCache\.getSourceCache/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'manga-list-runtime.js'), 'utf8'), /context\.clearLocalCoverObjectUrls\(\)/);
  assert.match(route, /MangaListHostRuntimeFactory\.create\(/);
  assert.match(route, /persistAll: host\.persistAll/);
  assert.doesNotMatch(reader, /manga-list-host-runtime|MangaListHostRuntimeFactory|persistFolders|persistAuthorCards/);
  assert.match(reader, /reader-item-repository\.js/);
  assert.match(reader, /ReaderItemRepositoryFactory\.create\(/);
  assert.match(reader, /ReaderSyncSchedulerFactory\.create/);
  assert.match(reader, /flushSync:\s*\(\) => syncScheduler\.flush\(\)/);
  assert.match(fs.readFileSync(path.join(root, 'reader-sync-scheduler.js'), 'utf8'), /return save\(\)/);
  assert.match(fs.readFileSync(path.join(root, 'reader-item-repository.js'), 'utf8'), /dependencies\.scheduleSync\(\)/);
});


test('strict cloud flush waits for server save and propagates failure', async () => {
  const calls = [];
  const input = deps(calls);
  let release;
  input.sync.savePayload = () => new Promise(resolve => { release = resolve; });
  const host = loadFactory().create(input);
  let complete = false;
  const pending = host.flushCloudSync().then(() => { complete = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(complete, false);
  release();
  await pending;
  assert.equal(complete, true);
  input.sync.savePayload = async () => { throw new Error('offline'); };
  await assert.rejects(host.flushCloudSync(), /offline/);
});

test('encrypted covers take the dedicated loader path', async () => {
  const input = deps([]);
  let invoked = false;
  input.images.loadEncryptedCover = async (item,img) => {
    invoked = item.encryptedAssets.pages.length === 1;
    img.src = 'blob:encrypted';
  };
  const host = loadFactory().create(input);
  const img = { src: '', isConnected:true };
  await host.loadLocalCover({ encryptedAssets:{ pages:[{}] } },img);
  assert.equal(invoked, true);
  assert.equal(img.src, 'blob:encrypted');
});


test('detached bookshelf cards receive cached local thumbnails before attachment', async () => {
  const input = deps([]);
  input.images.getLocalCoverObjectUrl = () => 'blob:already-cached';
  input.images.loadCachedLocalImage = () => { throw new Error('should use cached cover'); };
  const host = loadFactory().create(input);
  const img = { src: '', isConnected: false, dataset: {} };
  await host.loadLocalCover({ storagePaths: ['folder/001.jpg'] }, img);
  assert.equal(img.src, 'blob:already-cached');
  assert.equal(img.dataset.coverState, 'loading');
});

test('explicit cover URL failure shows retry and does not permanently blacklist the work', () => {
  const cache = new Map();
  const failed = new Set();
  const input = deps([]);
  input.images.getCoverSourceCache = () => cache;
  input.images.getCoverFailedCache = () => failed;
  const host = loadFactory().create(input);
  const handlers = new Map();
  const img = {
    src: '', dataset: {},
    addEventListener(type, callback) { handlers.set(type, callback); },
    removeEventListener(type, callback) { if (handlers.get(type) === callback) handlers.delete(type); },
  };
  const exact = 'https://example.test/gallery/1.webp?sig=1';
  host.setupFeedImage(img, exact, 1, null, 'one', exact);
  assert.equal(img.src, exact);
  assert.equal(img.dataset.coverState, 'loading');
  handlers.get('error')();
  assert.equal(img.dataset.coverState, 'failed');
  assert.ok(failed.has(exact));
  host.setupFeedImage(img, exact, 1, null, 'one', exact);
  assert.equal(img.src, exact, 'a retry must run even when previously marked failed');
  img.currentSrc = exact;
  handlers.get('load')();
  assert.equal(img.dataset.coverState, 'loaded');
  assert.equal(cache.get(exact), exact);
  assert.equal(failed.has(exact), false);
});

test('each cover fallback candidate has its own timeout; slow URLs remain retryable', () => {
  const input = deps([]);
  const timers = [];
  input.images.extCandidates = ['jpg', 'png'];
  input.images.parseInputUrl = (value) => ({ baseUrl: value, pattern: null });
  input.images.pageUrlFor = (base, page, index, width) =>
    base + String(page).padStart(width, '0') + '.' + input.images.extCandidates[index];
  input.images.setTimer = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  const host = loadFactory().create(input);
  const handlers = {};
  const img = {
    src: '', dataset: {},
    addEventListener(name, cb) { handlers[name] = cb; },
    removeEventListener(name) { delete handlers[name]; },
  };
  host.setupFeedImage(img, 'https://example.test/series/', 2, null, 'slow');
  assert.ok(img.src.endsWith('01.jpg'));
  assert.equal(timers[0].delay, 60000);
  timers[0].callback();
  assert.ok(img.src.endsWith('01.png'));
  assert.equal(img.dataset.coverState, 'loading');
  assert.equal(timers[1].delay, 60000);
  timers[1].callback();
  assert.equal(img.dataset.coverState, 'failed');
  host.setupFeedImage(img, 'https://example.test/series/', 2, null, 'slow');
  assert.ok(img.src.endsWith('01.jpg'));
});

test('image discovery prefers an explicit filename and cached extension', () => {
  const input = deps([]);
  input.images.extCandidates = ['jpg', 'png', 'webp'];
  input.images.getCachedMangaInfo = () => ({ ext: 2, numberWidth: 3 });
  input.images.parseInputUrl = () => ({ baseUrl: 'https://example.test/book/', pattern: { prefix: 'chapter-', suffix: 'a' } });
  input.images.pageUrlFor = (base, page, ext, width, pattern) =>
    base + pattern.prefix + String(page).padStart(width, '0') + pattern.suffix + '.' + input.images.extCandidates[ext];
  const host = loadFactory().create(input);
  const img = { src: '', dataset: {}, addEventListener() {} };
  host.setupFeedImage(img, 'https://example.test/book/', undefined, undefined, 'pattern');
  assert.equal(img.src, 'https://example.test/book/chapter-001a.webp');
});

test('bookshelf DOM exposes loading, failed, and retry states without deleting work data', () => {
  const runtime = fs.readFileSync(path.join(root, 'manga-list-runtime.js'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'manga-list-route.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'manga-list.css'), 'utf8');
  assert.match(runtime, /className = 'book-cover-loading'/);
  assert.match(runtime, /className = 'book-cover-retry'/);
  assert.match(runtime, /event\.stopPropagation\(\);\s*loadCover\(\);/);
  assert.match(css, /img\[data-cover-state="loading"\] ~ \.book-cover-loading/);
  assert.match(css, /img\[data-cover-state="failed"\] ~ \.book-cover-retry/);
  assert.match(route, /pattern\?\.prefix/);
  assert.match(route, /manga-list\.css\?v=20261009-slide-transition/);
  assert.doesNotMatch(runtime.slice(runtime.indexOf('const loadCover = () =>'), runtime.indexOf('if (reorderMode) {', runtime.indexOf('const loadCover = () =>'))), /removeItem\(/);
});
