import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const cacheSource = read('video-thumbnail-cache.js');
const rendererSource = read('video-thumbnail-renderer.js');
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function waitFor(check) {
  for (let attempt = 0; attempt < 40 && !check(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(check(), 'asynchronous IndexedDB/image loading did not complete');
}

async function hashedKey(url, time) {
  const bytes = new TextEncoder().encode(url + '\n' + String(time));
  const digest = await webcrypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function fakeIndexedDB(records) {
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      const tx = {
        objectStore() {
          return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = records.get(key);
                request.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              });
              return request;
            },
            put(entry) {
              records.set(entry.key, entry);
              queueMicrotask(() => tx.oncomplete?.());
            },
            getAll() {
              const request = {};
              queueMicrotask(() => {
                request.result = [...records.values()];
                request.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              });
              return request;
            },
            delete(key) {
              records.delete(key);
              queueMicrotask(() => tx.oncomplete?.());
            },
          };
        },
      };
      return tx;
    },
  };
  return {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
      return request;
    },
  };
}

function loadCache(indexedDB, documentRef) {
  let allowed = true;
  const root = {
    indexedDB,
    crypto: webcrypto,
    TextEncoder,
    document: documentRef || { addEventListener() {} },
    MangaReaderMediaAccess: { canReadProtectedData: () => allowed },
  };
  vm.runInNewContext(cacheSource, { window: root, setTimeout, clearTimeout });
  return {
    root,
    cache: root.MangaReaderVideoThumbnailCache,
    allow(value) { allowed = value; },
  };
}

class Node {
  constructor(tagName, stats) {
    this.tagName = tagName.toUpperCase();
    this.stats = stats;
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.isConnected = true;
    this.videoWidth = 640;
    this.videoHeight = 360;
    this.duration = 30;
    this.naturalWidth = 320;
    this.naturalHeight = 180;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
    this.parentNode = null;
    this.isConnected = false;
  }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  fire(name) {
    for (const callback of this.listeners.get(name) || []) callback();
  }
  set src(value) {
    this._src = value;
    if (this.tagName === 'VIDEO') this.stats.networkVideoRequests++;
    if (this.tagName === 'IMG') queueMicrotask(() => {
      this.onload?.();
      this.fire('load');
    });
  }
  get src() { return this._src; }
  pause() {}
  load() {}
  removeAttribute() {}
}

function loadRenderer(root) {
  const stats = { networkVideoRequests: 0, videos: [] };
  const documentRef = {
    createElement(tag) {
      const node = new Node(tag, stats);
      if (tag === 'video') stats.videos.push(node);
      return node;
    },
  };
  root.document = documentRef;
  root.URL = {
    createObjectURL: () => 'blob:cached-frame',
    revokeObjectURL() {},
  };
  vm.runInNewContext(rendererSource, { window: root, URL });
  const container = new Node('div', stats);
  return { renderer: root.MangaReaderVideoThumbnailRenderer, container, documentRef, stats };
}

test('a persisted frame survives a fresh route/page context, updates LRU on read, and skips video requests', async () => {
  const url = 'https://example.test/clip.mp4';
  const key = await hashedKey(url, 0.1);
  const blob = { size: 1300, id: 'frame' };
  const records = new Map([[key, { key, blob, bytes: blob.size, used: 1 }]]);
  const db = fakeIndexedDB(records);

  const first = loadCache(db);
  const page1 = loadRenderer(first.root);
  page1.renderer.render(page1.container, { url }, { documentRef: page1.documentRef });
  await waitFor(() => page1.container.children.some((node) => node.tagName === 'IMG'));
  assert.equal(page1.stats.networkVideoRequests, 0);
  assert.ok(page1.container.children.some((node) => node.tagName === 'IMG'));
  assert.ok(records.get(key).used > 1, 'cache reads must refresh disk LRU');

  // A new JS context simulates full navigation (the hot memory cache is gone).
  const second = loadCache(db);
  const page2 = loadRenderer(second.root);
  page2.renderer.render(page2.container, { url }, { documentRef: page2.documentRef });
  await waitFor(() => page2.container.children.some((node) => node.tagName === 'IMG'));
  assert.equal(page2.stats.networkVideoRequests, 0);
  assert.ok(page2.container.children.some((node) => node.tagName === 'IMG'));

  second.allow(false);
  assert.equal(await second.cache.read(url, 0.1), null, 'locked vault must not reveal cached frames');
});

test('a missing frame starts one preview and at most one capture despite repeated seek events', async () => {
  let reads = 0;
  let captures = 0;
  const root = {
    MangaReaderVideoThumbnailCache: {
      permitted: () => true,
      read: async () => { reads++; return null; },
      captureAndStore: async () => { captures++; return { size: 2000 }; },
    },
  };
  const page = loadRenderer(root);
  page.renderer.render(page.container, { url: 'https://example.test/missing.mp4' }, { documentRef: page.documentRef });
  await tick();
  assert.equal(page.stats.videos.length, 1);
  assert.equal(page.stats.networkVideoRequests, 1);
  const preview = page.stats.videos[0];
  preview.fire('loadedmetadata');
  preview.fire('seeked');
  preview.fire('seeked');
  await tick();
  assert.equal(reads, 1, 'cache should be checked only once on the miss path');
  assert.equal(captures, 1, 'multiple seeked events should not recapture');
});

test('SPA detachment retains list thumbnails; routine view-count updates do not rebuild them', () => {
  const routing = read('video-routing-fix.js');
  const library = read('video-library.js');
  assert.match(routing, /querySelectorAll\('#videoLibraryResults \.vl-inline-player video, #videoLibraryResults \.vl-inline-player iframe'\)/);
  assert.doesNotMatch(routing, /querySelectorAll\('#videoLibraryResults video, #videoLibraryResults iframe'\)/);
  assert.match(library, /const visualVideo = \(\{ openCount, lastOpenedAt, updatedAt, \.\.\.visual \}\) =>/);
  assert.match(library, /resultsKey === renderedResultsKey/);
});
