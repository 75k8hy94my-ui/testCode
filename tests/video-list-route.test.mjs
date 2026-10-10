import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const route = read('video-list-route.js');
const template = read('video-list-template.js');
const spa = read('home-profile-spa.js');
const page = read('video.html');

test('video route has a dedicated template and route runtime without reader HTML', () => {
  assert.match(template, /id="videoListSection"/);
  assert.match(route, /VideoListRouteFactory/);
  assert.doesNotMatch(route, /reader\.html|ReaderRouteRuntimeFactory|savedListOverlay|mangaListSection/);
  assert.doesNotMatch(template, /savedListOverlay|mangaListSection|tocOverlay|videoPlayerOverlay/);
});

test('video route loads its existing video modules without fetching reader.html', () => {
  assert.match(spa, /renderVideo\(generation\)/);
  assert.match(spa, /video-list-route\.js\?v=20261010-local-first-save/);
  assert.match(spa, /video-list-template\.js\?v=20261010-vpn-navigation/);
  assert.match(spa, /VideoListRouteFactory\.create\(/);
  assert.match(route, /video-data\.js\?v=20260918-video-data-no-window/);
  assert.match(route, /video-thumbnail-renderer\.js\?v=20261008-shared-thumbnails/);
  assert.match(route, /video-library\.js\?v=20261010-shorts-entry/);
  assert.match(route, /video-routing-fix\.js\?v=20261009-vault-sync-queue/);
  assert.match(route, /video-thumbnail-time\.js\?v=20261009-vault-sync-queue/);
  assert.match(spa, /else if\(route==='video'\)renderVideo\(generation\)/);
  assert.doesNotMatch(spa, /route==='reader'|renderReader|reader\.html|iframe/);
  assert.match(spa, /if\(!SPA_PAGES\.includes\(name\)\)\{location\.href=target\.href;return;\}/);
  const renderVideo = spa.slice(spa.indexOf('async function renderVideo'), spa.indexOf('async function renderManga'));
  assert.doesNotMatch(renderVideo, /fetch\('reader\.html/);
  assert.doesNotMatch(page, /reader-route-runtime|reader\.html/);
});

test('video route mounts while gated and passes the gate into its protected-data library', () => {
  const route = read('video-list-route.js');
  const gate = route.indexOf("deps.loadMediaGate()");
  const data = route.indexOf("deps.loadScript('video-data.js?v=20260918-video-data-no-window'");
  const renderer = route.indexOf("deps.loadScript('video-thumbnail-renderer.js?v=20261008-shared-thumbnails'");
  const library = route.indexOf("deps.loadScript('video-library.js?v=20261010-shorts-entry'");
  assert.ok(gate >= 0 && gate < data);
  assert.ok(data < renderer && renderer < library);
  assert.match(route, /MangaReaderVideoLibrary\.init\(deps\.mediaAccess\)/);
  assert.doesNotMatch(spa.slice(spa.indexOf('async function renderVideo'), spa.indexOf('async function renderManga')), /gate\.getStatus\(\)|gate\.canLoadExternalMedia/);
});

test('video list helper boot does not read protected storage while VPN access is blocked', () => {
  class Storage {
    getItem(key) { reads.push(key); return null; }
    setItem() {}
  }
  const reads = [];
  const listeners = {};
  const storage = new Storage();
  const results = { querySelectorAll() { return []; } };
  const documentRef = {
    head: { append() {} },
    visibilityState: 'visible',
    addEventListener(type, listener) { listeners[type] = listener; },
    getElementById(id) { return id === 'videoLibraryResults' ? results : null; },
    createElement() { return { id: '', textContent: '', append() {} }; },
  };
  const windowRef = {
    MangaReaderVideoData: {},
    MangaReaderMediaAccess: { canReadProtectedData: () => false },
    Storage,
    localStorage: storage,
    addEventListener() {},
  };
  const context = {
    window: windowRef,
    document: documentRef,
    localStorage: storage,
    location: { href: 'https://example.test/video.html' },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
  };

  vm.runInNewContext(read('video-routing-fix.js'), context);

  assert.deepEqual(reads, []);
});

test('video thumbnail helper does not inspect protected metadata during storage writes while blocked', () => {
  class Storage {
    getItem(key) { reads.push(key); return null; }
    setItem(key, value) { values.set(key, value); }
  }
  const reads = [];
  const values = new Map();
  const listeners = {};
  const storage = new Storage();
  const documentRef = {
    readyState: 'complete',
    addEventListener(type, listener) { listeners[type] = listener; },
    getElementById() { return null; },
    querySelectorAll() { return []; },
  };
  const windowRef = {
    MangaReaderVideoData: {
      mergeVideoMetaPreservingThumbnailTime: (oldValue, newValue) => ({ ...oldValue, ...newValue }),
      classifyVideoUrl: () => ({ kind: 'invalid' }),
      parseMediaTime: () => null,
      formatMediaTime: (value) => String(value),
    },
    MangaReaderMediaAccess: { canReadProtectedData: () => false },
    Storage,
    localStorage: storage,
  };
  const context = {
    window: windowRef,
    document: documentRef,
    localStorage: storage,
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };

  vm.runInNewContext(read('video-thumbnail-time.js'), context);
  storage.setItem('mangaReaderVideoMeta', '{}');

  assert.deepEqual(reads, []);
  assert.equal(values.get('mangaReaderVideoMeta'), '{}');
});

test('video feature helpers are deferred until the route has protected-data access', () => {
  const baseScripts = route.slice(route.indexOf('async function loadFeatureScripts'), route.indexOf('async function start'));
  assert.match(baseScripts, /await deps\.loadScript\('video-thumbnail-renderer\.js\?v=20261008-shared-thumbnails'/);
  assert.match(baseScripts, /await deps\.loadScript\('video-library\.js\?v=20261010-shorts-entry'/);
  assert.match(baseScripts, /canReadProtectedData\(\)[\s\S]*video-routing-fix\.js/);
});

test('video route loads its shell while blocked and loads media helpers after access is restored', async () => {
  const scripts = [];
  const state = { allowed: false };
  const section = { parentNode: null };
  const mountElement = {
    child: null,
    insertAdjacentHTML() { this.child = section; section.parentNode = this; },
    querySelectorAll() { return [section]; },
    append(node) { this.child = node; node.parentNode = this; },
  };
  let initCount = 0;
  const windowRef = {
    MangaReaderVideoTemplate: { createMarkup: () => '<section id="videoListSection"></section>' },
    MangaReaderVideoLibrary: { init() { initCount += 1; } },
  };
  const context = { window: windowRef };
  vm.runInNewContext(read('video-list-route.js'), context);
  const runtime = windowRef.VideoListRouteFactory.create({
    documentRef: { createElement() {}, getElementById() { return {}; } },
    loadScript: async (src) => scripts.push(src),
    loadMediaGate: async () => {},
    mediaAccess: { canReadProtectedData: () => state.allowed },
  });

  await runtime.start({ mountElement });
  assert.ok(scripts.some((src) => src.includes('video-library.js')));
  assert.equal(scripts.some((src) => src.includes('video-routing-fix.js')), false);
  assert.equal(scripts.some((src) => src.includes('video-thumbnail-time.js')), false);

  state.allowed = true;
  await runtime.start({ mountElement });
  assert.equal(scripts.some((src) => src.includes('video-routing-fix.js')), true);
  assert.equal(scripts.some((src) => src.includes('video-thumbnail-time.js')), true);
  assert.equal(initCount, 2);
});

test('video route detaches its retained DOM when leaving the route', () => {
  assert.match(spa, /function cleanupVideoRoute\(\)\{if\(videoRouteRuntime\)videoRouteRuntime\.detach\(\);\}/);
  assert.match(route, /function detach\(\)/);
});

test('stale video startup completion never detaches the current route root', () => {
  const renderVideo = spa.slice(spa.indexOf('async function renderVideo'), spa.indexOf('async function renderManga'));
  assert.doesNotMatch(renderVideo, /generation!==renderGeneration\)\{videoRouteRuntime\.detach\(\)/);
});

test('a stale render completion preserves a video route mounted by the newer generation', async () => {
  const source = spa.slice(spa.indexOf('async function renderVideo'), spa.indexOf('async function renderManga')).replaceAll('renderGeneration', 'state.value');
  const target = { children: [], replaceChildren() { this.children = []; } };
  const root = {};
  const pending = [];
  const state = { value: 1 };
  let detachCount = 0;
  const gate = { syncUi() {} };
  const videoRouteRuntime = {
    start({ mountElement }) {
      mountElement.children = [root];
      return new Promise((resolve) => pending.push(resolve));
    },
    detach() { detachCount += 1; target.children = []; },
  };
  const windowRef = { VideoListRouteFactory: {}, MangaReaderVideoTemplate: {} };
  const renderVideo = new Function(
    'state', 'getMount', 'cleanupMangaShell', 'ensureVpnGate', 'loadScript', 'window', 'document',
    'videoRouteRuntime', 'setTitle', 'syncHeaderRoute',
    `return (${source});`
  )(state, () => target, () => {}, async () => gate, async () => {}, windowRef, {}, videoRouteRuntime, () => {}, () => {});

  const first = renderVideo(1);
  while (pending.length < 1) await new Promise((resolve) => setImmediate(resolve));
  state.value = 2;
  const second = renderVideo(2);
  while (pending.length < 2) await new Promise((resolve) => setImmediate(resolve));
  pending.forEach((resolve) => resolve());
  await Promise.all([first, second]);

  assert.deepEqual(target.children, [root]);
  assert.equal(detachCount, 0);
});

test('video library can be reinitialized after a route interruption without rebinding events', () => {
  const library = read('video-library.js');
  assert.match(library, /window\.MangaReaderVideoLibrary\s*=\s*Object\.freeze\(\{ init, syncAccessUi \}\)/);
  assert.match(library, /let eventsBound = false/);
  assert.match(library, /if \(eventsBound\) return;/);
  assert.match(library, /if \(section\.dataset\.videoLibraryEnhanced === '1'\) return true/);
  assert.match(library, /if \(dom\.search\) dom\.search\.value = state\.query/);
  assert.match(route, /MangaReaderVideoLibrary\.init\(deps\.mediaAccess\)/);
  assert.match(route, /bootPromise = null/);
});

