import test from 'node:test';
import assert from 'node:assert/strict';
import Edit from '../video-virtual-edit.js';
import Player from '../video-virtual-playback.js';

const clip = (sourceVideoId, startSeconds, endSeconds) =>
  ({ sourceVideoId, startSeconds, endSeconds });
const sources = [
  { id: 'a', url: 'https://cdn.test/one.mp4?t=abc' },
  { id: 'b', url: 'https://cdn.test/two.mp4' },
];
const edit = Edit.createEdit([clip('a', 10, 15), clip('b', 5, 8), clip('a', 18, 20)]);

class FakeVideo {
  #listeners = new Map();
  #time = 0;
  #src = '';
  constructor() {
    this.readyState = 0;
    this.duration = NaN;
    this.seeking = false;
    this.loads = 0;
    this.plays = 0;
    this.pauses = 0;
    this.failSeeking = false;
    this.rejectPlay = false;
  }
  get src() { return this.#src; }
  set src(url) { this.#src = url; this.readyState = 0; this.seeking = false; this.#time = 0; }
  get currentTime() { return this.#time; }
  set currentTime(next) {
    if (this.failSeeking) throw new Error('range unsupported');
    this.seeking = true;
    this.#time = next;
  }
  load() { this.loads++; }
  pause() { this.pauses++; }
  play() { this.plays++; return this.rejectPlay ? Promise.reject(new Error('autoplay denied')) : Promise.resolve(); }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  addEventListener(name, fn) {
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set());
    this.#listeners.get(name).add(fn);
  }
  removeEventListener(name, fn) { this.#listeners.get(name)?.delete(fn); }
  emit(name) { for (const fn of [...(this.#listeners.get(name) || [])]) fn(); }
  metadata(duration = 90) {
    this.duration = duration;
    this.readyState = 1;
    this.emit('loadedmetadata');
  }
  finishSeek() { this.seeking = false; this.emit('seeked'); }
  tick(seconds) { this.#time = seconds; this.seeking = false; this.emit('timeupdate'); }
  end() { this.emit('ended'); }
}
function setup(overrides = {}) {
  const video = new FakeVideo();
  const states = [];
  const controller = Player.createController({
    video, sources, edit, onState: (state) => states.push(state),
    ...overrides,
  });
  return { video, controller, states };
}

test('starts in idle without downloading or assigning any MP4 URL', () => {
  const { video, controller } = setup();
  assert.equal(video.src, '');
  assert.equal(video.loads, 0);
  assert.equal(controller.snapshot().phase, 'idle');
  assert.equal(controller.snapshot().totalSeconds, 10);
  assert.equal(controller.snapshot().clipCount, 3);
});

test('plays clips from distinct MP4 URLs and finishes at total virtual duration', () => {
  const { video, controller } = setup();
  controller.play();
  assert.equal(controller.snapshot().phase, 'loading');
  assert.equal(video.src, sources[0].url);
  video.metadata();
  assert.equal(controller.snapshot().phase, 'seeking');
  assert.equal(video.currentTime, 10);
  video.finishSeek();
  assert.equal(controller.snapshot().phase, 'ready');
  assert.equal(video.plays, 1);
  video.tick(11.5);
  assert.equal(controller.snapshot().virtualSeconds, 1.5);
  video.tick(15);
  assert.equal(video.src, sources[1].url);
  assert.equal(controller.snapshot().virtualSeconds, 5);
  video.metadata();
  video.finishSeek();
  assert.equal(video.currentTime, 5);
  video.tick(8);
  assert.equal(video.src, sources[0].url);
  assert.equal(controller.snapshot().virtualSeconds, 8);
  video.metadata();
  video.finishSeek();
  video.tick(20);
  assert.equal(controller.snapshot().phase, 'finished');
  assert.equal(controller.snapshot().virtualSeconds, 10);
  assert.equal(controller.snapshot().requestedPlay, false);
});

test('virtual seek maps to the correct source and ignores stale seeking events', () => {
  const { video, controller } = setup();
  controller.seek(6.25);
  assert.equal(video.src, sources[1].url);
  video.metadata();
  assert.equal(video.currentTime, 6.25);
  video.emit('seeked'); // Fake element still reports seeking=true.
  assert.equal(controller.snapshot().phase, 'seeking');
  video.finishSeek();
  assert.equal(controller.snapshot().phase, 'ready');
  assert.equal(controller.snapshot().virtualSeconds, 6.25);
  assert.equal(controller.snapshot().requestedPlay, false);
  controller.seek(8);
  assert.equal(video.src, sources[0].url);
  video.metadata();
  video.finishSeek();
  assert.equal(video.currentTime, 18);
  assert.equal(controller.snapshot().virtualSeconds, 8);
});

test('pause during metadata loading prevents unwanted playback', () => {
  const { video, controller } = setup();
  controller.play();
  controller.pause();
  video.metadata();
  video.finishSeek();
  assert.equal(video.plays, 0);
  assert.equal(controller.snapshot().requestedPlay, false);
  controller.play();
  assert.equal(video.plays, 1);
});

test('seeking the exact end finishes; replay restarts at the beginning', () => {
  const { video, controller } = setup();
  controller.seek(10);
  assert.equal(controller.snapshot().phase, 'finished');
  assert.equal(video.src, '');
  controller.play();
  assert.equal(video.src, sources[0].url);
  assert.equal(controller.snapshot().virtualSeconds, 0);
});

test('fails when source duration is shorter than saved clip or range seeking throws', () => {
  const first = setup();
  first.controller.play();
  first.video.metadata(14);
  assert.equal(first.controller.snapshot().phase, 'error');
  assert.match(first.controller.snapshot().error, /長さを超えています/);
  const second = setup();
  second.video.failSeeking = true;
  second.controller.play();
  second.video.metadata();
  assert.equal(second.controller.snapshot().phase, 'error');
  assert.match(second.controller.snapshot().error, /シークできません/);
});

test('reports source errors, buffering and early media end without skipping silently', () => {
  const { video, controller } = setup();
  controller.play();
  video.emit('error');
  assert.equal(controller.snapshot().phase, 'error');
  controller.play();
  video.metadata();
  video.finishSeek();
  video.emit('waiting');
  assert.match(controller.snapshot().message, /通信待ち/);
  video.end();
  assert.equal(controller.snapshot().phase, 'error');
  assert.match(controller.snapshot().error, /終了位置より前/);
});

test('timeout aborts failed metadata loads and does not outlive destroyed playback', () => {
  let callback = null;
  const { video, controller } = setup({
    schedule: (fn) => { callback = fn; return 1; },
    cancelSchedule: () => { callback = null; },
  });
  controller.play();
  assert.equal(controller.snapshot().phase, 'loading');
  callback();
  assert.equal(controller.snapshot().phase, 'error');
  controller.play();
  assert.equal(video.src, sources[0].url);
  controller.destroy();
  assert.equal(video.src, '');
  assert.equal(callback, null);
  video.metadata();
  assert.equal(controller.snapshot().phase, 'loading', 'destroyed instance retains last internal state but never resumes');
  assert.equal(controller.snapshot().requestedPlay, false);
});

test('play rejection produces a recoverable explicit pause state', async () => {
  const { video, controller } = setup();
  video.rejectPlay = true;
  controller.play();
  video.metadata();
  video.finishSeek();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(controller.snapshot().requestedPlay, false);
  assert.match(controller.snapshot().message, /自動再生を許可/);
});

test('invalid external sources and out-of-range virtual seek are rejected', () => {
  assert.throws(() => Player.createController({
    video: new FakeVideo(), edit, sources: [{ id: 'a', url: 'https://site.test/watch' }],
  }), /MP4/);
  const { controller } = setup();
  assert.throws(() => controller.seek(-1), RangeError);
  assert.throws(() => controller.seek(10.1), RangeError);
});
