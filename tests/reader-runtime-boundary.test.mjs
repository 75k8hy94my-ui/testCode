import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Lifecycle = require('../reader-lifecycle.js');
const Transition = require('../reader-page-transition.js');
const ProgressRepository = require('../reader-progress-repository.js');
const PageSource = require('../reader-page-source.js');

const runtimeUrl = new URL('../reader-runtime.js', import.meta.url);
const context = { self: {}, console, URL };
if (fs.existsSync(runtimeUrl)) vm.runInNewContext(fs.readFileSync(runtimeUrl, 'utf8'), context);
const factory = context.self.ReaderRuntimeFactory;
const imageLoaderContext = { self: {}, setTimeout, clearTimeout, Promise, Map, Set, Date, Error, URL };
vm.runInNewContext(fs.readFileSync(new URL('../reader-image-loader.js', import.meta.url), 'utf8'), imageLoaderContext);
const imageLoaderFactory = imageLoaderContext.self.ReaderImageLoaderFactory;

function memoryStorage() {
  const values = new Map();
  return { getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, String(value)); }, removeItem(key) { values.delete(key); } };
}

test('reader runtime resolves the exact requested item id from saved items only', async () => {
  assert.ok(factory, 'ReaderRuntimeFactory must exist');
  const items = [{ id: 'first', url: 'https://same.test/book' }, { id: 'second', url: 'https://same.test/book' }];
  const runtime = factory.create({
    repository: {
      loadItem(id) { return items.find((item) => item.id === id) || null; },
      saveItem(item) { items.push(item); },
      updateItem(id, patch) { const current = items.find((item) => item.id === id); if (!current) return null; Object.assign(current, patch); return current; },
    },
    target: {},
    location: { replace() {} },
  });
  const opened = await runtime.resolve('second');
  assert.equal(opened.item, items[1]);
  assert.equal(opened.source, 'saved-items');
});

test('reader runtime rejects missing item ids without URL fallback and closes to the bookshelf', async () => {
  assert.ok(factory, 'ReaderRuntimeFactory must exist');
  const redirects = [];
  const runtime = factory.create({
    repository: { loadItem() { return null; }, saveItem() {}, updateItem() { return null; } },
    target: {},
    sessionStorage: memoryStorage(),
    location: { replace(value) { redirects.push(value); } },
  });
  assert.equal(await runtime.resolve('missing'), null);
  assert.deepEqual(redirects, ['manga.html']);
  runtime.close();
  assert.deepEqual(redirects, ['manga.html', 'manga.html']);
});

test('standalone Reader close destroys and returns to the bookshelf document', () => {
  const redirects = [];
  const runtime = factory.create({
    repository: { loadItem() { return null; }, saveItem() {}, updateItem() { return null; } },
    target: {},
    location: { replace(value) { redirects.push(value); } },
  });
  runtime.close(); runtime.destroy();
  assert.deepEqual(redirects, ['manga.html']);
});

test('reader html no longer loads or initializes bookshelf runtime', () => {
  const html = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=["'][^"']*manga-list-/i);
  assert.doesNotMatch(html, /MangaList(?:HostRuntime|Runtime|RuntimeContext|Controller)Factory/);
  assert.match(html, /ReaderRuntimeFactory\.create/);
  assert.match(html, /reader-item-repository\.js/);
});

test('PageSource owns legacy numbered URL parsing and zero padding', () => {
  const source = PageSource.parseSequentialSource('https://images.test/series/chapter-001a.jpg');
  assert.deepEqual(JSON.parse(JSON.stringify(source)), {
    base: 'https://images.test/series/',
    pattern: { prefix: 'chapter-', suffix: 'a', width: 3 },
    width: 3,
  });
  assert.equal(PageSource.numberedPageUrl(source, 2, 'jpg'), 'https://images.test/series/chapter-002a.jpg');
});

test('reader opens a saved page at its restored position, updates favorite, and persists the active item progress', async () => {
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.style = {}; this.listeners = new Map(); this.attributes = {}; this.hidden = false; this.classList = { values: new Set(), add: (name) => this.classList.values.add(name), remove: (name) => this.classList.values.delete(name), contains: (name) => this.classList.values.has(name), toggle: (name, force) => { const add = force === undefined ? !this.classList.values.has(name) : force; add ? this.classList.values.add(name) : this.classList.values.delete(name); return add; } }; }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    dispatch(type, event = {}) { this.listeners.get(type)?.({ currentTarget: this, ...event }); }
    setAttribute(name, value) { this.attributes[name] = value; }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
    querySelectorAll(selector) { return this.children.filter((child) => selector === '.readerPageImage' ? child.className === 'readerPageImage' : false); }
  }
  const ids = ['readerStatus', 'retryPageBtn', 'pageSlider', 'pageLabel', 'currentTitle', 'pageStage', 'viewer', 'topbar', 'controls', 'tocBtn', 'favToggleBtn', 'closeBtn', 'firstBtn', 'prevBtn', 'nextBtn', 'lastBtn', 'tocAddBtn', 'safeModeBtn', 'enhanceBtn', 'verticalBtn', 'nextVolumeBanner', 'nextVolumeText', 'nextVolumeBtn', 'nextVolumeDismissBtn'];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  const body = new Element();
  const store = new Map([['mangaReaderLastPage', JSON.stringify({ 'item:book-2': { page: 2, wasLast: false, updatedAt: 1 }})]]);
  const localStorage = { getItem(key) { return store.get(key) ?? null; }, setItem(key, value) { store.set(key, String(value)); } };
  const document = { body, getElementById(id) { return elements[id] || null; }, createElement() { return new Element(); }, createDocumentFragment() { return new Element(); } };
  const item = { id: 'book-2', title: 'Same URL, second item', url: 'https://same.test/book', pages: ['https://same.test/1.jpg', 'https://same.test/2.jpg'], favorite: false };
  const written = [];
  const repo = {
    loadItem(id) { return id === item.id ? item : null; },
    saveItem(value) { written.push(value); },
    updateItem(id, patch) { if (id !== item.id) return null; Object.assign(item, patch); written.push(item); return item; },
    findNextVolume() { return null; }, scheduleSync() {},
  };
  const redirects = [];
  class Image {
    constructor() { this.listeners = new Map(); this.dataset = {}; this.naturalWidth = 600; this.naturalHeight = 900; }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    removeEventListener(type) { this.listeners.delete(type); }
    set src(value) { this._src = value; queueMicrotask(() => this.listeners.get('load')?.()); }
    get src() { return this._src || ''; }
    decode() { return Promise.resolve(); }
  }
  const window = { localStorage, location: { href: 'https://reader.test/reader.html?item=book-2' }, innerWidth: 300, Image, ReaderImageLoaderFactory: imageLoaderFactory, ReaderLifecycleFactory: Lifecycle, ReaderPageTransitionFactory: Transition, addEventListener() {}, prompt() {}, URL };
  window.ReaderLifecycleFactory = Lifecycle; window.ReaderPageTransitionFactory = Transition;
  const progressRepository = ProgressRepository.create({ storage: localStorage });
  const runtime = factory.create({ repository: repo, target: { itemResumeKey: (id) => `item:${id}`, buildReaderUrl: (id) => `reader.html?item=${id}` }, progressRepository, pageSource: { resolve: async (value) => ({ item: value, urls: value.pages }) }, location: { replace(url) { redirects.push(url); } }, document, window });
  await runtime.start('book-2');

  assert.equal(elements.pageSlider.value, '2');
  assert.equal(elements.pageStage.children[0].children[0].src, 'https://same.test/2.jpg');
  assert.equal(item.readingProgress, undefined);
  assert.equal(JSON.parse(localStorage.getItem('mangaReaderLastPage'))['item:book-2'].page, 2);
  let contextMenuPrevented = false;
  elements.viewer.dispatch('contextmenu', { target: { closest() { return {}; } }, preventDefault() { contextMenuPrevented = true; } });
  assert.equal(contextMenuPrevented, true, 'image context menus must not expose a save-image action');
  elements.viewer.dispatch('click', { clientX: 150 });
  assert.equal(body.classList.contains('reader-chrome-hidden'), true, 'a center tap hides the reader header and footer');
  elements.viewer.dispatch('click', { clientX: 150 });
  assert.equal(body.classList.contains('reader-chrome-hidden'), false, 'a second center tap restores the reader header and footer');
  elements.favToggleBtn.dispatch('click');
  assert.equal(item.favorite, true);
  elements.closeBtn.dispatch('click');
  assert.deepEqual(redirects, ['manga.html']);
  assert.ok(written.length >= 2);
});
