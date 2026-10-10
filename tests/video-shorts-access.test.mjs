import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../video-shorts-page.js', import.meta.url), 'utf8');

test('creating the Shorts route while VPN access is pending does not read protected storage', () => {
  let reads = 0;
  class Element { constructor(){this.children=[];this.dataset={};this.classList={add(){},remove(){},toggle(){}};} append(...items){this.children.push(...items)} replaceChildren(...items){this.children=[...items]} addEventListener(){} setAttribute(){} }
  const documentRef = { getElementById: () => new Element(), addEventListener() {}, removeEventListener() {}, createElement() { return new Element(); } };
  const rootRef = { document: documentRef, MangaReaderMediaAccess: { canReadProtectedData: () => false }, localStorage: { getItem() { reads += 1; return null; } }, addEventListener() {}, removeEventListener() {} };
  vm.runInNewContext(source, { window: rootRef, document: documentRef, URLSearchParams, setTimeout, clearTimeout, console });
  assert.equal(reads, 0);
});

test('Shorts route stops the active video and drops protected state when access is lost', () => {
  assert.match(source, /disposeProtectedState\(\)/);
  assert.match(source, /video\.pause\(\)/);
  assert.match(source, /video\.load\(\)/);
  assert.match(source, /protectedState\s*=\s*null/);
});

test('guest-local route persists on device without scheduling a Vault upload', () => {
  assert.match(source, /TestCodeGuest/);
  assert.match(source, /function isGuest\(\)/);
  assert.match(source, /sync:\s*!isGuest\(\)/);
});

test('allowed route probes and queues direct videos only, then unloads them when VPN access is lost', async () => {
  class Element {
    constructor(tagName = 'DIV') { this.tagName = tagName; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.events = new Map(); this.classList = { add(){}, remove(){}, toggle(){} }; this.currentTime = 0; this.paused = true; }
    append(...children) { children.forEach((child) => { child.parentNode = this; this.children.push(child); }); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    addEventListener(type, listener) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(listener); }
    emit(type, event = {}) { for (const listener of this.events.get(type) || []) listener({ type, target: this, ...event }); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
    remove() { this.removed = true; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); }
    load() { this.loaded = true; }
    pause() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    querySelector(selector) { const all = [this, ...this.children.flatMap((child) => [child, ...child.children])]; return all.find((node) => selector === '.shortsMedia' ? node.className === 'shortsMedia' : false) || null; }
  }
  const page = new Element(); const documentEvents = new Map(); const windowEvents = new Map();
  const documentRef = { getElementById: () => page, createElement: (tag) => new Element(tag.toUpperCase()), addEventListener(type, fn) { documentEvents.set(type, fn); }, removeEventListener(type) { documentEvents.delete(type); } };
  let allowed = true; const reads = []; const probed = []; const generated = []; const writes = []; const href = { value: '' };
  const records = {
    mangaReaderVideos: [{ id: 'direct', url: 'https://media.example/a.mp4', title: 'A', tags: ['tag'] }, { id: 'site', url: 'https://site.example/watch/1', title: 'B', tags: ['tag'] }, { id: 'broken', url: 'https://media.example/broken.webm', title: 'C', tags: ['tag'] }],
    mangaReaderVideoMeta: {}, mangaReaderVideoMarkers: {},
  };
  const state = {
    value: { schemaVersion: 1, queue: [], currentIndex: 0, currentTime: 0, knownVideoIds: [], generation: 0, updatedAt: 0, revision: 0 },
    observeVideos(ids) { this.value.knownVideoIds = ids; return true; },
    load() { return this.value; },
    save(value, options) { writes.push({ value, options }); this.value = value; return value; },
  };
  const windowRef = {
    MangaReaderMediaAccess: { canReadProtectedData: () => allowed },
    MangaReaderVideoShortsQueue: { generate(videos) { generated.push(videos.map((video) => video.id)); return [{ videoId: 'direct', startSeconds: 0, endSeconds: 30, entryType: 'random-short', tier: 1, generation: 1 }, { videoId: 'direct', startSeconds: 10, endSeconds: 40, entryType: 'random-short', tier: 1, generation: 1 }]; } },
    MangaVaultPayload: { normalizeVideoMarkers: (value) => value },
    TestCodeGuest: { isActive: () => true },
    location: { set href(value) { href.value = value; } },
    addEventListener(type, fn) { windowEvents.set(type, fn); }, removeEventListener(type) { windowEvents.delete(type); },
  };
  const storage = { getItem(key) { reads.push(key); return JSON.stringify(records[key]); } };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, window: windowRef, URLSearchParams, Date, Number, Math, setTimeout, clearTimeout });
  const controller = module.exports.create({ documentRef, page, windowRef, storage, mediaAccess: windowRef.MangaReaderMediaAccess,
    videoData: { isDirectVideoUrl: (url) => /\.(mp4|webm)$/.test(url), normalizeVideo: (value) => ({ ...value, url: value.url, shorts: {} }) },
    queue: windowRef.MangaReaderVideoShortsQueue, state,
    probeMetadata: async (video) => { probed.push(video.id); return video.id === 'broken' ? null : { videoWidth: 720, videoHeight: 1280, durationSeconds: 60 }; },
  });
  await controller.start();
  assert.deepEqual(reads, ['mangaReaderVideos', 'mangaReaderVideoMeta', 'mangaReaderVideoMarkers']);
  assert.deepEqual(probed, ['direct', 'broken']);
  assert.deepEqual(JSON.parse(JSON.stringify(generated)), [['direct']]);
  assert.equal(state.value.knownVideoIds.includes('broken'), false, 'failed direct probe is retried on a later route activation');
  assert.equal(page.querySelector('.shortsMedia').children.length, 2, 'active and next media window is bounded');
  controller.saveProgress(true);
  assert.equal(writes.at(-1).options.sync, false, 'guest-local route never syncs');
  const active = page.querySelector('.shortsMedia').children[0];
  active.currentTime = 22.75;
  controller.openOrdinaryPlayer();
  assert.match(href.value, /video-player\.html\?id=direct&start=22\.75/);
  allowed = false;
  await documentEvents.get('manga-reader-vpn-status')();
  assert.equal(active.paused, true);
  assert.equal(active.src, '');
  assert.equal(controller.getState(), null);
});
