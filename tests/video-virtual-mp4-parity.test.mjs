import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Edit from '../video-virtual-edit.js';
import Store from '../video-virtual-edit-store.js';
import Publish from '../video-virtual-publish.js';
import Adapter from '../video-player-virtual-adapter.js';

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const standardPlayer = read('video-player-page.js');
const standardControls = read('video-player-controls.js');
const standardHtml = read('video-player.html');
const library = read('video-library.js');
const editor = read('video-edit-page.js');

test('normal watch-page URL and controls are shared across raw and edited MP4s', () => {
  assert.doesNotMatch(standardPlayer, /location\.replace\(route\.href\)/);
  assert.match(standardPlayer, /publishedEdit \|\| directVideo/);
  assert.match(standardPlayer, /MangaReaderVideoVirtualAdapter/);
  assert.match(standardPlayer, /videoPlayerRelated|videoRelated/);
  assert.match(standardControls, /const playback = video\.__virtualPlaybackAdapter \|\| video/);
  assert.match(standardControls, /playback\.duration/);
  assert.match(standardControls, /playback\.currentTime/);
  assert.match(standardControls, /playback\.paused/);
  assert.match(standardControls, /virtual-edit-state/);
  assert.match(standardControls, /customVideoVolume/);
  assert.match(standardControls, /videoMarkerPanel/);
  assert.match(standardHtml, /video-player-virtual-adapter\.js/);
  assert.ok(standardHtml.indexOf('video-player-virtual-adapter.js') < standardHtml.indexOf('video-player-page.js'));
});

test('all normal video cards retain title, favorites, tags, folders, metadata and custom properties', () => {
  assert.match(library, /VideoCard\.create\(cardMedia/);
  assert.match(library, /video\.virtualEdition === true/);
  assert.match(library, /state\.meta\[String\(video\.id\)\]/);
  assert.match(library, /function openVideo\(videoId\)/);
  assert.match(library, /lastOpenedAt: Date\.now\(\)/);
  assert.match(editor, /const matching = base\?\.virtualEdition === true/);
});

test('virtual player adapter reports edited duration/time, seeks across clips and does not synthesize timeupdate', () => {
  const events = {};
  let lastState;
  const callbacks = [];
  const video = {
    dataset: {},
    controls: true,
    addEventListener(event, handler) { (events[event] ||= []).push(handler); },
    removeEventListener(event, handler) { events[event] = (events[event] || []).filter(fn => fn !== handler); },
    dispatchEvent(event) { callbacks.push(event.type); (events[event.type] || []).forEach(fn => fn(event)); },
  };
  const entry = Edit.createEdit([
    { sourceVideoId: 'a', startSeconds: 1, endSeconds: 7 },
    { sourceVideoId: 'a', startSeconds: 7, endSeconds: 13, rotation: 90 },
  ]);
  const original = 'https://example.test/a.mp4';
  const controller = {
    snapshot() { return lastState; },
    play() { lastState = { ...lastState, requestedPlay: true }; emit(lastState); },
    pause() { lastState = { ...lastState, requestedPlay: false }; emit(lastState); },
    seek(value) { lastState = { ...lastState, virtualSeconds: value }; emit(lastState); },
    destroy() {},
  };
  const emit = (state) => events['virtual-edit-state']?.forEach(fn => fn({ detail: state }));
  // Verify the actual adapter delegates virtual timeline updates, not native currentTime.
  const originalCreator = globalThis.MangaReaderVideoVirtualPlayback;
  assert.equal(typeof Adapter.attach, 'function');
  const PlaybackSource = read('video-player-virtual-adapter.js');
  const mockedPlayback = { createController(config) {
    lastState = { phase: 'idle', totalSeconds: 12, virtualSeconds: 0, requestedPlay: false };
    config.onState(lastState);
    return { ...controller, play() { controller.play(); config.onState(lastState); },
      pause() { controller.pause(); config.onState(lastState); },
      seek(value) { controller.seek(value); config.onState(lastState); } };
  } };
  const sandbox = { module: { exports: {} }, require: () => mockedPlayback, CustomEvent: class {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  } };
  vm.runInNewContext(PlaybackSource, sandbox);
  const attached = sandbox.module.exports.attach({ video, edit: entry, sources: [{ id: 'a', url: original }] });
  assert.equal(attached.duration, 12);
  attached.currentTime = 8;
  assert.equal(attached.currentTime, 8);
  assert.equal(attached.paused, true);
  attached.play();
  assert.equal(attached.paused, false);
  attached.pause();
  assert.equal(attached.paused, true);
  assert.equal(callbacks.every(type => type === 'virtual-edit-state'), true);
  attached.destroy();
});

test('the virtual project store is not exposed as a second library', () => {
  assert.equal(Store.VIDEO_KEY, 'mangaReaderVideos');
  assert.equal(Publish.VIDEO_KEY, 'mangaReaderVideos');
  assert.equal(Publish.META_KEY, 'mangaReaderVideoMeta');
  assert.match(standardPlayer, /上書き前の動画に戻す/);
  assert.match(standardPlayer, /詳細を編集/);
});
