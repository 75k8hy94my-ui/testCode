import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const imageLoaderFactory = require('../reader-image-loader.js');
const lifecycleFactory = require('../reader-lifecycle.js');
const transitionFactory = require('../reader-page-transition.js');
const pageSourceFactory = require('../reader-page-source.js');
const progressRepositoryFactory = require('../reader-progress-repository.js');
const runtimeContext = { self: {}, console, URL };
vm.runInNewContext(fs.readFileSync(new URL('../reader-runtime.js', import.meta.url), 'utf8'), runtimeContext);
const runtimeFactory = runtimeContext.self.ReaderRuntimeFactory;

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) { const add = force === undefined ? !this.contains(name) : force; add ? this.add(name) : this.remove(name); return add; }
}

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.parentNode = null; this.dataset = {}; this.style = {}; this.attributes = {}; this.listeners = new Map(); this.classList = new FakeClassList(); this.hidden = false; this.value = ''; this.textContent = ''; }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) {
    if (child.fragment) { [...child.children].forEach((node) => this.appendChild(node)); child.children = []; return child; }
    child.parentNode?.removeChild?.(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) { const index = this.children.indexOf(child); if (index >= 0) this.children.splice(index, 1); child.parentNode = null; return child; }
  replaceChildren(...children) { this.children.forEach((child) => { child.parentNode = null; }); this.children = []; children.forEach((child) => this.appendChild(child)); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  dispatch(type, event = {}) { this.listeners.get(type)?.({ currentTarget: this, target: this, ...event }); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (selector === '.readerPageImage' && child.className === 'readerPageImage') matches.push(child);
        if (selector === '[data-page]' && child.dataset?.page) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  scrollIntoView() {}
}

class FakeFragment extends FakeElement { constructor() { super(); this.fragment = true; } }
class ControlledImage {
  static instances = [];
  constructor() { this.listeners = new Map(); this.dataset = {}; this.style = {}; this.naturalWidth = 600; this.naturalHeight = 900; this.complete = false; ControlledImage.instances.push(this); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  set src(value) { this._src = value; }
  get src() { return this._src || ''; }
  dispatch(type) { this.complete = type === 'load'; this.listeners.get(type)?.(); }
  static reset() { ControlledImage.instances = []; }
}

function fixture({ item = null, vertical = false } = {}) {
  ControlledImage.reset();
  const ids = ['readerStatus', 'retryPageBtn', 'pageSlider', 'pageLabel', 'currentTitle', 'pageStage', 'viewer', 'topbar', 'controls', 'tocBtn', 'favToggleBtn', 'closeBtn', 'firstBtn', 'prevBtn', 'nextBtn', 'lastBtn', 'tocAddBtn', 'safeModeBtn', 'enhanceBtn', 'verticalBtn', 'nextVolumeBanner', 'nextVolumeText', 'nextVolumeBtn', 'nextVolumeDismissBtn'];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  const body = new FakeElement('body');
  const document = { body, getElementById(id) { return elements[id] || null; }, createElement(tag) { return new FakeElement(tag); }, createDocumentFragment() { return new FakeFragment(); } };
  const values = new Map(vertical ? [['mangaReaderVerticalScroll', '1']] : []);
  const localStorage = { getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, String(value)); } };
  const encryptedReadiness = [];
  const window = { Image: ControlledImage, ReaderImageLoaderFactory: imageLoaderFactory, ReaderLifecycleFactory: lifecycleFactory, ReaderPageTransitionFactory: transitionFactory, ReaderPageSourceFactory: pageSourceFactory, ReaderProgressRepositoryFactory: progressRepositoryFactory, localStorage, location: { href: 'https://reader.test/reader.html?item=book' }, innerWidth: 1200, addEventListener() {}, prompt() {}, URL,
    MangaVault: { loadActive: () => ({ rawKey: 'vault-key' }) }, MANGA_READER_SUPABASE: {},
    EncryptedAssetItem: { encryptedAssetPagesForItem: (value) => value.encryptedAssets.pages },
    EncryptedAssetStorage: { createStorageTransport: () => ({}) }, EncryptedAssetCache: { createCache: () => Promise.resolve({}) },
    EncryptedAssetReader: {
      createPreviewLoader() { const values = new Map(); return { keyFor: (options) => `${options.assetId}:${options.revision}`, retain() {}, load: async (options) => { const key = `${options.assetId}:${options.revision}`; if (!values.has(key)) values.set(key, { url: `blob:${key}` }); return values.get(key); }, retry: async (options) => { const key = `${options.assetId}:${options.revision}`; values.set(key, { url: `blob:${key}` }); return values.get(key); }, destroy() { values.clear(); }, snapshot() { return []; } }; },
      createEncryptedAssetReader(options) { let resolve, reject; const readyPromise = new Promise((a, b) => { resolve = a; reject = b; }); const state = { assetId: options.assetId, host: options.container, readyPromise, resolve, reject, destroyed: 0, mount() { return this; }, destroy() { this.destroyed++; } }; encryptedReadiness.push(state); return state; },
    },
    EncryptedAssetSync: {}, ImageTransferSettings: {}, ImageRemoteAccess: {}, EncryptedAssetCrypto: {}, MangaReaderMediaAccess: {},
  };
  const storedItem = item || { id: 'book', title: 'Test book', pages: Array.from({ length: 6 }, (_, index) => `https://img.test/${index + 1}.jpg`) };
  const repository = {
    loadItem(id) { return id === storedItem.id ? storedItem : null; },
    saveItem() {},
    updateItem(id, patch) { if (id !== storedItem.id) return null; Object.assign(storedItem, patch); return storedItem; },
    findNextVolume() { return null; }, scheduleSync() {},
  };
  const runtime = runtimeFactory.create({ repository, target: { consumeLaunch() { return null; }, itemResumeKey: (id) => `item:${id}`, buildReaderUrl: (id) => `reader.html?item=${id}` }, sessionStorage: { getItem() { return null; }, setItem() {} }, location: { replace() {} }, document, window });
  return { runtime, elements, storedItem, window, values, encryptedReadiness };
}

async function findImage(suffix) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const image = ControlledImage.instances.find((candidate) => candidate.src.endsWith(suffix));
    if (image) return image;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`No image request was started for ${suffix}`);
}

async function settleLoad(image, success = true) {
  image.dispatch(success ? 'load' : 'error');
  await new Promise((resolve) => setTimeout(resolve, 5));
}

async function findNewImage(suffix, previous) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const image = ControlledImage.instances.find((candidate) => candidate.src.endsWith(suffix) && candidate !== previous);
    if (image) return image;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`No retry image request was started for ${suffix}`);
}

test('displayed page and controls stay put while loading, then commit the exact loader image', async () => {
  const { runtime, elements } = fixture();
  // Install the loader directly on the window before runtime resolves it.
  const initial = runtime.start('book');
  const first = await findImage('/1.jpg');
  await settleLoad(first);
  await initial;
  const firstImage = elements.pageStage.children[0].children[0];
  assert.equal(firstImage, first);

  elements.nextBtn.dispatch('click');
  assert.deepEqual({ ...runtime.getPageState() }, { displayedPage: 1, requestedPage: 2, status: 'loading', failedPage: null });
  assert.equal(elements.pageLabel.textContent, '1 / 6');
  assert.equal(elements.pageStage.children[0].children[0], firstImage);

  const second = await findImage('/2.jpg');
  await settleLoad(second);
  assert.equal(runtime.getPageState().displayedPage, 2);
  assert.equal(elements.pageLabel.textContent, '2 / 6');
  assert.equal(elements.pageStage.children[0].children[0], second);
  runtime.close();
});

test('late older navigation results may fill cache but cannot replace the latest requested page', async () => {
  const { runtime, elements } = fixture();
  const initial = runtime.start('book');
  await settleLoad(await findImage('/1.jpg'));
  await initial;

  elements.nextBtn.dispatch('click');
  elements.nextBtn.dispatch('click');
  const second = await findImage('/2.jpg');
  const third = await findImage('/3.jpg');
  await settleLoad(third);
  await settleLoad(second);
  assert.equal(runtime.getPageState().displayedPage, 3);
  assert.equal(runtime.getPageState().requestedPage, 3);
  assert.equal(elements.pageStage.children[0].children[0], third);
  assert.equal(elements.pageLabel.textContent, '3 / 6');
  runtime.close();
});

test('failed page keeps the old frame and retry makes the failed request usable', async () => {
  const { runtime, elements } = fixture();
  const initial = runtime.start('book');
  const first = await findImage('/1.jpg');
  await settleLoad(first);
  await initial;
  elements.nextBtn.dispatch('click');
  const second = await findImage('/2.jpg');
  await settleLoad(second, false);
  assert.equal(runtime.getPageState().status, 'failed');
  assert.equal(runtime.getPageState().displayedPage, 1);
  assert.equal(elements.pageStage.children[0].children[0], first);
  assert.equal(elements.retryPageBtn.hidden, false);

  elements.retryPageBtn.dispatch('click');
  await new Promise((resolve) => setTimeout(resolve, 3));
  const retry = await findNewImage('/2.jpg', second);
  await settleLoad(retry);
  assert.equal(runtime.getPageState().displayedPage, 2);
  assert.equal(elements.pageStage.children[0].children[0], retry);
  runtime.close();
});

test('split halves commit as a complete single-source frame without requesting another image', async () => {
  const { runtime, elements } = fixture({ item: { id: 'book', title: 'Spread', pages: ['https://img.test/spread.jpg'], splitSpreads: true } });
  const initial = runtime.start('book');
  const image = await findImage('/spread.jpg');
  await settleLoad(image);
  await initial;
  elements.nextBtn.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.getPageState().displayedPage, 2);
  assert.equal(elements.pageLabel.textContent, '2 / 2');
  assert.equal(elements.pageStage.children[0].children[0].className, 'spreadCrop spreadLeft');
  assert.equal(elements.pageStage.querySelectorAll('.readerPageImage').length, 1);
  assert.equal(ControlledImage.instances.length, 1);
  runtime.close();
});

test('vertical mode shares decoded resources while keeping a scroll-list page model', async () => {
  const { runtime, elements } = fixture({ vertical: true });
  const initial = runtime.start('book');
  const first = await findImage('/1.jpg');
  await settleLoad(first);
  await initial;
  assert.equal(runtime.getPageState().displayedPage, 1);
  assert.equal(elements.pageStage.classList.contains('vertical-scroll'), true);
  assert.equal(elements.pageStage.children.length, 6);
  assert.equal(elements.pageStage.children[0].firstChild, first);

  elements.nextBtn.dispatch('click');
  const second = await findImage('/2.jpg');
  await settleLoad(second);
  assert.equal(runtime.getPageState().displayedPage, 2);
  assert.equal(elements.pageLabel.textContent, '2 / 6');
  assert.equal(elements.pageStage.children[1].firstChild, second);
  runtime.close();
});

test('encrypted pages preserve the old frame, page and progress until preview ready; stale previews cannot commit', async () => {
  const pages = Array.from({ length: 5 }, (_, index) => ({ assetId: `encrypted-${index + 1}`, revision: 1, manifest: { schemaVersion: 1 } }));
  const { runtime, elements, values, encryptedReadiness } = fixture({ item: { id: 'encrypted-book', title: 'Encrypted', encryptedAssets: { pages } } });
  const opening = runtime.start('encrypted-book');
  while (encryptedReadiness.length < 1) await new Promise((resolve) => setImmediate(resolve));
  const first = encryptedReadiness[0];
  assert.equal(elements.pageStage.children.length, 0);
  first.resolve();
  await opening;
  const firstFrame = elements.pageStage.children[0];
  assert.equal(runtime.getPageState().displayedPage, 1);

  const secondRequest = runtime.goTo(2);
  while (encryptedReadiness.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.pageStage.children[0], firstFrame);
  assert.equal(elements.pageLabel.textContent, '1 / 5');
  assert.equal(JSON.parse(values.get('mangaReaderLastPage'))['item:encrypted-book'].page, 1);
  encryptedReadiness[1].resolve();
  assert.equal(await secondRequest, true);
  assert.equal(elements.pageLabel.textContent, '2 / 5');
  assert.equal(JSON.parse(values.get('mangaReaderLastPage'))['item:encrypted-book'].page, 2);

  const olderRequest = runtime.goTo(3);
  while (encryptedReadiness.length < 3) await new Promise((resolve) => setImmediate(resolve));
  const latestRequest = runtime.goTo(5);
  while (encryptedReadiness.length < 4) await new Promise((resolve) => setImmediate(resolve));
  encryptedReadiness[3].resolve();
  assert.equal(await latestRequest, true);
  encryptedReadiness[2].resolve();
  assert.equal(await olderRequest, false);
  assert.equal(runtime.getPageState().displayedPage, 5);
  assert.equal(elements.pageLabel.textContent, '5 / 5');
  assert.equal(JSON.parse(values.get('mangaReaderLastPage'))['item:encrypted-book'].page, 5);
});

test('encrypted failure keeps progress and frame, and the retry control can commit after readiness', async () => {
  const pages = Array.from({ length: 3 }, (_, index) => ({ assetId: `failed-${index + 1}`, revision: 1, manifest: { schemaVersion: 1 } }));
  const { runtime, elements, values, encryptedReadiness } = fixture({ item: { id: 'retry-encrypted', encryptedAssets: { pages } } });
  const opening = runtime.start('retry-encrypted');
  while (encryptedReadiness.length < 1) await new Promise((resolve) => setImmediate(resolve));
  encryptedReadiness[0].resolve(); await opening;
  const visible = elements.pageStage.children[0];
  const request = runtime.goTo(2);
  while (encryptedReadiness.length < 2) await new Promise((resolve) => setImmediate(resolve));
  encryptedReadiness[1].reject(new Error('preview failed'));
  assert.equal(await request, false);
  assert.equal(elements.pageStage.children[0], visible);
  assert.equal(elements.pageLabel.textContent, '1 / 3');
  assert.equal(JSON.parse(values.get('mangaReaderLastPage'))['item:retry-encrypted'].page, 1);
  elements.retryPageBtn.dispatch('click');
  while (encryptedReadiness.length < 3) await new Promise((resolve) => setImmediate(resolve));
  encryptedReadiness[2].resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.pageLabel.textContent, '2 / 3');
  assert.equal(JSON.parse(values.get('mangaReaderLastPage'))['item:retry-encrypted'].page, 2);
});
