import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../video-shorts-page.js', import.meta.url), 'utf8');

test('creating the Shorts route while VPN access is pending does not read protected storage', () => {
  let reads = 0;
  class Element { constructor(){this.children=[];this.dataset={};this.classList={add(){},remove(){},toggle(){}};} append(...items){this.children.push(...items)} replaceChildren(...items){this.children=[...items]} addEventListener(){} setAttribute(){} }
  const documentRef = { getElementById: () => new Element(), addEventListener() {}, removeEventListener() {}, createElement() { return new Element(); } };
  const rootRef = { document: documentRef, MangaReaderMediaAccess: { canReadProtectedData: () => false }, localStorage: { getItem() { reads += 1; return null; } }, setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} };
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
    constructor(tagName = 'DIV') { this.tagName = tagName; this.children = []; this.dataset = {}; this.style = { setProperty() {} }; this.attributes = {}; this.events = new Map(); this.classList = { add(){}, remove(){}, toggle(){} }; this.currentTime = 0; this.duration = 60; this.videoWidth = 720; this.videoHeight = 1280; this.paused = true; this.readyState = 1; this.src = ''; this.rect = { left: 0, width: 100 }; }
    append(...children) { children.forEach((child) => { child.parentNode = this; this.children.push(child); }); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    addEventListener(type, listener) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(listener); }
    emit(type, event = {}) { for (const listener of this.events.get(type) || []) listener({ type, target: this, ...event }); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
    remove() { this.removed = true; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); }
    load() { this.loaded = true; }
    getBoundingClientRect() { return this.rect; }
    closest(selector) { for (let node = this; node; node = node.parentNode) if (selector === '.shortsActions' ? node.className === 'shortsActions' : selector === '.shortsScrubArea' ? node.className === 'shortsScrubArea' : selector === '.shortsVideo' ? node.className === 'shortsVideo' : false) return node; return null; }
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
  let backCount = 0;
  const windowRef = {
    MangaReaderMediaAccess: { canReadProtectedData: () => allowed },
    MangaReaderVideoShortsQueue: { generate(videos) { generated.push(videos.map((video) => video.id)); return [{ videoId: 'direct', startSeconds: 0, endSeconds: 30, entryType: 'random-short', tier: 1, generation: 1 }, { videoId: 'direct', startSeconds: 10, endSeconds: 40, entryType: 'random-short', tier: 1, generation: 1 }]; } },
    MangaVaultPayload: { normalizeVideoMarkers: (value) => value },
    TestCodeGuest: { isActive: () => true },
    location: { set href(value) { href.value = value; } },
    matchMedia: () => ({ matches: true }), history: { back() { backCount += 1; } },
    setTimeout, clearTimeout,
    addEventListener(type, fn) { windowEvents.set(type, fn); }, removeEventListener(type) { windowEvents.delete(type); },
  };
  const storage = { getItem(key) { reads.push(key); return JSON.stringify(records[key]); }, setItem(key, value) { records[key] = JSON.parse(value); writes.push({ key, value }); } };
  const module = { exports: {} }; let clock = 1000; let nextTimer = 1; const timers = new Map();
  const scheduleTest = (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id; };
  const cancelTest = (id) => timers.delete(id);
  vm.runInNewContext(source, { module, window: windowRef, URLSearchParams, Date, Number, Math, setTimeout, clearTimeout, console });
  const controller = module.exports.create({ documentRef, page, windowRef, storage, mediaAccess: windowRef.MangaReaderMediaAccess,
    now: () => clock, setTimeout: scheduleTest, clearTimeout: cancelTest,
    videoData: { isDirectVideoUrl: (url) => /\.(mp4|webm)$/.test(url), normalizeVideo: (value) => ({ ...value, url: value.url, tags: value.tags || [], shorts: { liked: false, playCount: 0, earlySwipeCount: 0, updatedAt: 0, ...(value.shorts || {}) } }), mergeVideoMetaPreservingThumbnailTime: (existing, incoming) => incoming },
    queue: windowRef.MangaReaderVideoShortsQueue, state,
    probeMetadata: async (video) => { probed.push(video.id); return video.id === 'broken' ? null : { videoWidth: 720, videoHeight: 1280, durationSeconds: 60 }; },
  });
  await controller.start();
  assert.deepEqual(reads.slice(0, 3), ['mangaReaderVideos', 'mangaReaderVideoMeta', 'mangaReaderVideoMarkers']);
  assert.deepEqual(probed, ['direct', 'broken']);
  assert.deepEqual(JSON.parse(JSON.stringify(generated)), [['direct']]);
  assert.equal(state.value.knownVideoIds.includes('broken'), false, 'failed direct probe is retried on a later route activation');
  assert.equal(page.querySelector('.shortsMedia').children.length, 2, 'active and next media window is bounded');
  assert.equal(records.mangaReaderVideoMeta.direct.shorts.playCount, 1, 'Shorts play count increments independently when an entry begins');
  const active = page.querySelector('.shortsMedia').children[0];
  const media = page.querySelector('.shortsMedia');
  const stage = page.children[0];
  const scrubArea = stage.children.find((child) => child.className === 'shortsScrubArea');
  scrubArea.rect = { left: 0, width: 0, top: 0, height: 0 };
  const actions = page.children[0].children.find((child) => child.className === 'shortsActions');
  actions.children[0].emit('click');
  assert.equal(records.mangaReaderVideoMeta.direct.shorts.liked, true, 'heart action persists liked state');
  assert.equal(active.paused, false);
  clock += 1000;
  stage.emit('pointerdown', { button: 0, clientX: 50, clientY: 300, target: active });
  stage.emit('pointermove', { clientX: 50, clientY: 180, target: active });
  stage.emit('pointerup', { clientX: 50, clientY: 180, target: active });
  assert.equal(controller.getState().currentIndex, 1, 'upward swipe advances to the next queue entry');
  assert.equal(records.mangaReaderVideoMeta.direct.shorts.earlySwipeCount, 1, 'vertical swipe within five seconds increments a separate skip count');
  assert.equal(records.mangaReaderVideoMeta.direct.shorts.playCount, 2, 'each Shorts entry start increments play count');
  let current = media.children.find((node) => node.className === 'shortsVideo');
  stage.emit('pointerdown', { button: 0, clientX: 50, clientY: 250, target: current });
  const pauseTimer = [...timers.entries()].find(([, timer]) => timer.delay === 350);
  assert.ok(pauseTimer, 'video long press schedules temporary pause');
  pauseTimer[1].callback(); timers.delete(pauseTimer[0]);
  assert.equal(current.paused, true, 'video pauses while held');
  stage.emit('pointerup', { clientX: 50, clientY: 250, target: current });
  assert.equal(current.paused, false, 'video resumes on release');
  const scrubTrackArea = stage.children.find((child) => child.className === 'shortsScrubArea');
  scrubTrackArea.rect = { left: 0, width: 100 };
  stage.emit('pointerdown', { button: 0, clientX: 25, clientY: 0, target: scrubTrackArea });
  const scrubTimer = [...timers.entries()].find(([, timer]) => timer.delay === 450);
  assert.ok(scrubTimer, 'scrub track requires a separate long press');
  scrubTimer[1].callback(); timers.delete(scrubTimer[0]);
  assert.equal(current.paused, true, 'scrubbing pauses playback');
  stage.emit('pointermove', { clientX: 75, clientY: 0, target: scrubTrackArea });
  assert.equal(stage.children.find((child) => child.className === 'shortsScrubArea').children[2].children[1].textContent, '0:32 / 1:00');
  stage.emit('pointerup', { clientX: 75, clientY: 0, target: scrubTrackArea });
  assert.equal(current.currentTime, 32.5, 'release commits the scrub position within the clip');
  assert.equal(current.paused, false, 'playback resumes after scrub release');
  stage.emit('pointerdown', { button: 0, clientX: 10, clientY: 300, target: current });
  stage.emit('pointermove', { clientX: 100, clientY: 300, target: current });
  stage.emit('pointerup', { clientX: 100, clientY: 300, target: current });
  assert.equal(backCount, 1, 'left-edge rightward swipe returns on mobile');
  assert.equal(current.currentTime, 32.5, 'horizontal swipe does not change playback time');
  stage.emit('pointerdown', { button: 0, clientX: 100, clientY: 300, target: current });
  stage.emit('pointermove', { clientX: 180, clientY: 300, target: current });
  stage.emit('pointerup', { clientX: 180, clientY: 300, target: current });
  assert.equal(backCount, 1, 'horizontal movement away from the left edge is ignored');
  assert.equal(current.currentTime, 32.5, 'ignored horizontal movement does not seek');
  controller.saveProgress(true);
  assert.equal(writes.at(-1).options.sync, false, 'guest-local route never syncs');
  current = page.querySelector('.shortsMedia').children.find((node) => node.className === 'shortsVideo');
  current.currentTime = 22.75;
  controller.openOrdinaryPlayer();
  assert.match(href.value, /video-player\.html\?id=direct&start=22\.75/);
  allowed = false;
  await documentEvents.get('manga-reader-vpn-status')();
  assert.equal(active.paused, true);
  assert.equal(active.src, '');
  assert.equal(controller.getState(), null);
});
