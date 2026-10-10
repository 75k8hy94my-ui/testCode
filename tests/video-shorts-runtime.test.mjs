import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../video-shorts-page.js', import.meta.url), 'utf8');

class Element {
  constructor(tagName = 'div', play) {
    this.tagName = tagName.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {};
    this.style = { setProperty() {} }; this.classList = { add() {}, remove() {}, toggle() {} };
    this.events = new Map(); this.currentTime = 0; this.duration = 60; this.videoWidth = 720; this.videoHeight = 1280;
    this.paused = true; this.readyState = 1; this.src = ''; this.volume = 1; this._play = play;
  }
  append(...children) { children.forEach((child) => { child.parentNode = this; this.children.push(child); }); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  addEventListener(type, listener) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(listener); }
  emit(type, event = {}) { for (const listener of this.events.get(type) || []) listener({ type, target: this, preventDefault() {}, ...event }); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
  remove() { this.removed = true; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); }
  load() { this.loaded = true; }
  pause() { this.paused = true; }
  play() { return this._play ? this._play(this) : (this.paused = false, Promise.resolve()); }
  closest(selector) {
    const matches = (node) => selector === 'button' ? node.tagName === 'BUTTON'
      : selector === 'a' ? node.tagName === 'A'
        : selector === '.shortsMedia' ? node.className === 'shortsMedia'
          : selector === '.shortsActions' ? node.className === 'shortsActions'
            : selector === '.shortsScrubArea' ? node.className === 'shortsScrubArea'
              : selector === '.shortsVideo' ? node.className === 'shortsVideo'
                : selector === '.shortsBack' ? node.className === 'shortsBack' : false;
    for (let node = this; node; node = node.parentNode) if (matches(node)) return node;
    return null;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector === '.shortsMedia' && child.className === 'shortsMedia') return child;
      if (selector === '.shortsVideo' && child.className === 'shortsVideo') return child;
      const nested = child.querySelector?.(selector); if (nested) return nested;
    }
    return null;
  }
  getBoundingClientRect() { return { left: 0, width: 100 }; }
}

function makeHarness({ queue, records = null, now = () => 1000, timers = null, play, probeMetadata, rotation } = {}) {
  const page = new Element(); const documentEvents = new Map(); const windowEvents = new Map();
  const videos = records || [{ id: 'v1', url: 'https://media.example/v1.mp4', tags: [] }, { id: 'v2', url: 'https://media.example/v2.mp4', tags: [] }];
  const data = { mangaReaderVideos: videos, mangaReaderVideoMeta: {}, mangaReaderVideoMarkers: {} };
  const state = { value: { schemaVersion: 1, queue: [], currentIndex: 0, currentTime: 0, knownVideoIds: videos.map((v) => v.id), generation: 1, updatedAt: 0, revision: 0 }, saves: [], observeVideos() { return false; }, load() { return this.value; }, save(value) { this.value = value; this.saves.push(structuredClone(value)); return value; } };
  const access = { canReadProtectedData: () => true, getStatus: () => 'allowed' };
  const windowRef = { MangaReaderMediaAccess: access, TestCodeGuest: { isActive: () => true }, localStorage: null,
    location: {}, matchMedia: () => ({ matches: false }), history: { back() {} }, setTimeout, clearTimeout,
    addEventListener(type, listener) { windowEvents.set(type, listener); }, removeEventListener(type) { windowEvents.delete(type); } };
  const storage = { getItem(key) { return JSON.stringify(data[key] ?? null); }, setItem(key, value) { data[key] = JSON.parse(value); } };
  windowRef.localStorage = storage;
  const documentRef = { activeElement: null, getElementById: () => page, createElement: (tag) => new Element(tag, play),
    addEventListener(type, listener) { documentEvents.set(type, listener); }, removeEventListener(type) { documentEvents.delete(type); } };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, window: windowRef, URLSearchParams, Date, Number, Math, setTimeout, clearTimeout, console });
  const videoData = { isDirectVideoUrl: () => true, stableUrlToken: (url) => url,
    getRotationDirection: (value) => value.rotate90Direction === 'left' || value.rotate90Direction === 'right' ? value.rotate90Direction : (value.rotate90 ? 'left' : 'none'),
    getDisplayDimensions: (value) => videoData.getRotationDirection(value) === 'none'
      ? { width: value.videoWidth || 720, height: value.videoHeight || 1280 }
      : { width: value.videoHeight || 1280, height: value.videoWidth || 720 },
    normalizeVideo: (value) => ({ ...value, tags: value.tags || [], shorts: { liked: false, playCount: 0, earlySwipeCount: 0, updatedAt: 0, ...(value.shorts || {}) } }),
    mergeVideoMetaPreservingThumbnailTime: (_old, next) => next };
  const controller = module.exports.create({ documentRef, page, windowRef, storage, mediaAccess: access, state, videoData,
    rotation, queue: { generate: () => queue }, probeMetadata: probeMetadata || (async () => ({ videoWidth: 720, videoHeight: 1280, durationSeconds: 60 })), now,
    setTimeout: timers?.setTimeout || setTimeout, clearTimeout: timers?.clearTimeout || clearTimeout });
  return { controller, page, state, data, documentEvents, windowEvents };
}

const entry = (videoId, startSeconds = 0, endSeconds = 30) => ({ videoId, startSeconds, endSeconds, entryType: 'marker', tier: 1, generation: 1 });

test('configured video rotation is installed on active playback and disposed with the video', async () => {
  const calls = [];
  const h = makeHarness({ queue: [entry('v1')], records: [{ id: 'v1', url: 'https://media.example/v1.mp4', rotate90Direction: 'right' }],
    rotation: { install: (frame, video, direction) => { calls.push({ frame, video, direction }); return () => calls.push({ cleanup: true }); } } });
  await h.controller.start();
  assert.equal(calls[0].direction, 'right');
  assert.ok(calls[0].frame);
  h.controller.destroy();
  assert.ok(calls.some((call) => call.cleanup), 'rotation observer and styles are removed when playback is destroyed');
});

test('autoplay denial exposes a manual play button; successful manual playback hides it and counts once', async () => {
  let attempts = 0;
  const h = makeHarness({ queue: [entry('v1')], play: (video) => {
    attempts += 1;
    if (attempts === 1) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    video.paused = false; return Promise.resolve();
  } });
  await h.controller.start(); await Promise.resolve();
  const stage = h.page.children[0];
  const playButton = stage.children.find((node) => node.className === 'shortsPlayButton');
  const retry = stage.children.find((node) => node.className === 'shortsErrorActions').children[0];
  assert.equal(playButton.hidden, false);
  assert.equal(retry.hidden, true, 'autoplay policy rejection is not presented as a network failure');
  assert.equal(h.data.mangaReaderVideoMeta.v1?.shorts?.playCount || 0, 0);
  playButton.emit('click'); await Promise.resolve();
  assert.equal(playButton.hidden, true);
  assert.equal(h.data.mangaReaderVideoMeta.v1.shorts.playCount, 1);
});

test('late metadata from an old clip cannot seek the new active clip; final boundary stops', async () => {
  const h = makeHarness({ queue: [entry('v1', 10, 30), entry('v2', 20, 50)] });
  await h.controller.start();
  const media = h.page.querySelector('.shortsMedia'); const oldVideo = media.children.find((node) => node.className === 'shortsVideo');
  oldVideo.readyState = 0;
  const stage = h.page.children[0];
  stage.emit('pointerdown', { button: 0, clientX: 40, clientY: 300, target: oldVideo });
  stage.emit('pointermove', { clientX: 40, clientY: 180, target: oldVideo });
  stage.emit('pointerup', { clientX: 40, clientY: 180, target: oldVideo });
  const newVideo = media.children.find((node) => node.className === 'shortsVideo');
  newVideo.currentTime = 25; oldVideo.emit('loadedmetadata');
  assert.equal(newVideo.currentTime, 25);
  newVideo.currentTime = 50; newVideo.emit('timeupdate');
  assert.equal(newVideo.currentTime, 50);
  assert.equal(newVideo.paused, true);
});

test('continuous timeupdates share a fixed throttle deadline and save the latest absolute position', async () => {
  const pending = new Map(); let timerId = 0; let clock = 0;
  const timers = { setTimeout(callback, delay) { const id = ++timerId; pending.set(id, { callback, delay }); return id; }, clearTimeout(id) { pending.delete(id); } };
  const h = makeHarness({ queue: [entry('v1', 10, 40)], now: () => clock, timers });
  await h.controller.start(); const video = h.page.querySelector('.shortsVideo');
  video.currentTime = 12; video.emit('timeupdate');
  const savesAfterLeading = h.state.saves.length;
  clock = 200; video.currentTime = 15; video.emit('timeupdate');
  const queued = [...pending.entries()].find(([, timer]) => timer.delay === 4800);
  assert.ok(queued);
  clock = 400; video.currentTime = 18; video.emit('timeupdate');
  assert.equal(pending.get(queued[0]).delay, 4800, 'later timeupdates do not push the deadline out');
  pending.get(queued[0]).callback(); pending.delete(queued[0]);
  assert.ok(h.state.saves.length > savesAfterLeading);
  assert.equal(h.state.value.currentTime, 18, 'the trailing save reads the latest committed clip time');
});

test('wheel bursts advance once, keyboard shortcuts ignore focused controls, and volume persists across clips', async () => {
  const queue = [entry('v1'), entry('v2'), entry('v1'), entry('v2')];
  const h = makeHarness({ queue }); await h.controller.start();
  const stage = h.page.children[0]; const media = h.page.querySelector('.shortsMedia');
  media.emit('wheel', { deltaY: 120 }); media.emit('wheel', { deltaY: 120 }); media.emit('wheel', { deltaY: 120 });
  assert.equal(h.controller.getState().currentIndex, 1, 'one inertial wheel burst cannot skip multiple queue entries');

  const volume = stage.children.find((node) => node.className === 'shortsActions').children.find((node) => node.className === 'shortsVolume');
  volume.value = '0.4'; volume.emit('input');
  const current = media.children.find((node) => node.className === 'shortsVideo');
  assert.equal(current.volume, 0.4);
  const mute = stage.children.find((node) => node.className === 'shortsActions').children.find((node) => node.className === 'shortsMute');
  let captures = 0; stage.setPointerCapture = () => { captures += 1; };
  stage.emit('pointerdown', { button: 0, pointerId: 1, clientX: 90, clientY: 100, target: mute });
  assert.equal(captures, 0, 'button interaction does not capture the pointer for swipe handling');
  mute.emit('click');
  assert.equal(current.muted, true);

  const button = new Element('button');
  media.emit('keydown', { key: 'ArrowDown', target: button });
  assert.equal(h.controller.getState().currentIndex, 1, 'a focused button keeps its own keyboard action');
  media.emit('keydown', { key: 'ArrowDown', target: media, preventDefault() {} });
  assert.equal(h.controller.getState().currentIndex, 2);
  const next = media.children.find((node) => node.className === 'shortsVideo');
  assert.equal(next.volume, 0.4);
  assert.equal(next.muted, true);
  media.emit('keydown', { code: 'Space', key: ' ', target: media, preventDefault() {} });
  assert.equal(next.paused, true);
});

test('early-swipe timing excludes waiting and stalled media intervals', async () => {
  let clock = 1000;
  const queue = [entry('v1'), entry('v2')]; const h = makeHarness({ queue, now: () => clock });
  await h.controller.start();
  const media = h.page.querySelector('.shortsMedia'); const video = media.children.find((node) => node.className === 'shortsVideo');
  video.emit('playing'); clock += 1000; video.emit('waiting'); clock += 10000; video.emit('playing'); clock += 3000;
  const stage = h.page.children[0];
  stage.emit('pointerdown', { button: 0, clientX: 40, clientY: 300, target: video });
  stage.emit('pointermove', { clientX: 40, clientY: 180, target: video });
  stage.emit('pointerup', { clientX: 40, clientY: 180, target: video });
  assert.equal(h.data.mangaReaderVideoMeta.v1.shorts.earlySwipeCount, 1, 'only four seconds of actual playing time count toward the five-second threshold');
});

test('media read errors show a finite manual retry action with a distinct network message', async () => {
  const h = makeHarness({ queue: [entry('v1')] }); await h.controller.start();
  const stage = h.page.children[0]; const media = h.page.querySelector('.shortsMedia'); const video = media.children.find((node) => node.className === 'shortsVideo');
  const status = stage.children.find((node) => node.className === 'shortsMediaStatus');
  const actions = stage.children.find((node) => node.className === 'shortsErrorActions'); const retry = actions.children[0];
  video.error = { code: 2 }; video.emit('error');
  assert.match(status.textContent, /通信に失敗/);
  assert.equal(retry.hidden, false);
  retry.emit('click'); await Promise.resolve();
  assert.equal(video.loaded, true, 'retry requests one explicit reload');
  assert.equal(retry.hidden, true, 'successful playback dismisses the retry action');
});

test('metadata failures remain known videos and retry on a later activation without resetting the generation', async () => {
  const video = { id: 'v1', url: 'https://media.example/v1.mp4', tags: [] };
  let probes = 0;
  const h = makeHarness({ queue: [], records: [video], probeMetadata: async () => { probes += 1; return null; } });
  await h.controller.start();
  const generation = h.state.value.generation;
  h.windowEvents.get('storage')({ key: 'mangaReaderVideoMeta' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(probes, 2, 'failed metadata is eligible for a later retry');
  assert.equal(h.state.value.generation, generation, 'the existing ID is not misclassified as a newly added video');
});

test('failed metadata preparation gives a retry control and can recover into the queue', async () => {
  const video = { id: 'v1', url: 'https://media.example/v1.mp4', tags: [] };
  let probes = 0;
  const h = makeHarness({ queue: [entry('v1')], records: [video], probeMetadata: async () => {
    probes += 1;
    return probes === 1 ? null : { videoWidth: 720, videoHeight: 1280, durationSeconds: 60 };
  } });
  await h.controller.start();
  const media = h.page.querySelector('.shortsMedia');
  const emptyState = media.children.find((node) => node.className === 'shortsEmptyState');
  assert.equal(h.page.children[0].children.find((node) => node.className === 'shortsActions').hidden, true);
  assert.equal(h.page.children[0].children.find((node) => node.className === 'shortsScrubArea').hidden, true);
  assert.match(emptyState.children[0].textContent, /動画情報を読み込めませんでした/);
  const retry = emptyState.children[1];
  assert.equal(retry.hidden, false);
  retry.emit('click'); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(probes, 2);
  assert.ok(h.page.querySelector('.shortsVideo'));
});
