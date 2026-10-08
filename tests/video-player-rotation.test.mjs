import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Rotation = require('../video-player-rotation.js');

function fakeClassList() {
  const classes = new Set();
  return {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    contains(name) { return classes.has(name); },
  };
}

function fakeMedia() {
  const listeners = new Map();
  return {
    classList: fakeClassList(), style: {}, videoWidth: 1920, videoHeight: 1080,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    dispatch(type) { listeners.get(type)?.(); },
  };
}

test('saved left rotation sizes and rotates direct video inside the player frame', () => {
  const media = fakeMedia();
  const frame = { classList: fakeClassList(), style: {}, clientWidth: 800, clientHeight: 450 };
  let scheduled;
  const cleanup = Rotation.install(frame, media, 'left', { requestFrame(callback) { scheduled = callback; } });
  media.dispatch('loadedmetadata');
  scheduled();

  assert.equal(media.classList.contains('videoPlayerRotatedLeft'), true);
  assert.equal(media.classList.contains('videoPlayerRotatedRight'), false);
  assert.equal(media.style.width, '450px');
  assert.equal(media.style.height, '800px');
  cleanup();
  assert.equal(media.classList.contains('videoPlayerRotatedLeft'), false);
  assert.equal(media.style.width, '');
  assert.equal(media.style.height, '');
});

test('saved right rotation resizes again when the player frame changes', () => {
  const media = fakeMedia();
  const frame = { classList: fakeClassList(), style: {}, clientWidth: 900, clientHeight: 500 };
  let observerCallback;
  let scheduled = [];
  class FakeResizeObserver {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  }
  const cleanup = Rotation.install(frame, media, 'right', {
    ResizeObserverImpl: FakeResizeObserver,
    requestFrame(callback) { scheduled.push(callback); },
  });
  media.dispatch('loadedmetadata');
  scheduled.shift()();
  assert.equal(media.classList.contains('videoPlayerRotatedRight'), true);
  assert.equal(media.style.width, '500px');
  assert.equal(media.style.height, '900px');

  frame.clientWidth = 700;
  frame.clientHeight = 400;
  observerCallback();
  scheduled.shift()();
  assert.equal(media.style.width, '400px');
  assert.equal(media.style.height, '700px');
  cleanup();
});

test('no rotation leaves the video unchanged', () => {
  const media = fakeMedia();
  const frame = { classList: fakeClassList(), style: {}, clientWidth: 800, clientHeight: 450 };
  const cleanup = Rotation.install(frame, media, 'none');
  media.dispatch('loadedmetadata');
  assert.deepEqual(media.style, {});
  assert.equal(media.classList.contains('videoPlayerRotatedLeft'), false);
  assert.equal(media.classList.contains('videoPlayerRotatedRight'), false);
  cleanup();
});
