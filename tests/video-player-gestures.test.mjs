import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Gestures = require('../video-player-gestures.js');

function fakeTimers() {
  let nextId = 0;
  const pending = new Map();
  return {
    setTimeoutRef(callback) { const id = ++nextId; pending.set(id, callback); return id; },
    clearTimeoutRef(id) { pending.delete(id); },
    flush() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach((callback) => callback()); },
  };
}

test('a single video tap toggles playback only after the double-tap window', () => {
  const timers = fakeTimers();
  let singles = 0;
  let doubles = 0;
  const gestures = Gestures.create({ onSingleTap: () => { singles += 1; }, onDoubleTap: () => { doubles += 1; }, ...timers });
  gestures.tap({ clientX: 10 });
  assert.equal(singles, 0);
  timers.flush();
  assert.equal(singles, 1);
  assert.equal(doubles, 0);
});

test('a double tap cancels playback toggle and fires only one double-tap action', () => {
  const timers = fakeTimers();
  const seen = [];
  const gestures = Gestures.create({ onSingleTap: () => seen.push('play-toggle'), onDoubleTap: (event) => seen.push(event.clientX), ...timers });
  gestures.tap({ clientX: 40 });
  gestures.tap({ clientX: 42 });
  timers.flush();
  assert.deepEqual(seen, [42]);
});

test('destroying the gesture handler cancels a pending single-tap action', () => {
  const timers = fakeTimers();
  let singles = 0;
  const gestures = Gestures.create({ onSingleTap: () => { singles += 1; }, onDoubleTap() {}, ...timers });
  gestures.tap({});
  gestures.destroy();
  timers.flush();
  assert.equal(singles, 0);
});

test('double taps reserve outer video zones for seeking and the center for fullscreen', () => {
  const rect = { left: 0, width: 300 };
  assert.equal(Gestures.actionAt(40, rect), 'seekBackward');
  assert.equal(Gestures.actionAt(260, rect), 'seekForward');
  assert.equal(Gestures.actionAt(150, rect), 'fullscreen');
});
