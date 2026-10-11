import test from 'node:test';
import assert from 'node:assert/strict';
import Edit from '../video-virtual-edit.js';
import State from '../video-virtual-editor-state.js';

const clip = (sourceVideoId, startSeconds, endSeconds) => ({ sourceVideoId, startSeconds, endSeconds });
const edit = (endSeconds) => Edit.createEdit([clip('source-a', 0, endSeconds)]);

test('empty draft history supports one undo step without inventing an edit', () => {
  const initial = State.createHistory(null);
  assert.deepEqual(initial.current, { edit: null, selectedIndex: null });
  assert.equal(State.undo(initial).snapshot.edit, null);
  assert.equal(State.redo(initial).snapshot.edit, null);
});

test('history snapshots edits and selections and restores them through undo and redo', () => {
  const initial = State.createHistory(edit(2));
  const next = State.push(initial, edit(4), 0);
  assert.deepEqual(next.current, { edit: edit(4), selectedIndex: 0 });
  assert.deepEqual(State.undo(next).snapshot, { edit: edit(2), selectedIndex: null });
  assert.deepEqual(State.redo(State.undo(next).history).snapshot, { edit: edit(4), selectedIndex: 0 });
  assert.deepEqual(initial.current, { edit: edit(2), selectedIndex: null });
});

test('new history edit clears redo and retains no more than 100 undo snapshots', () => {
  let history = State.createHistory(edit(1));
  history = State.push(history, edit(2), 0);
  history = State.push(history, edit(3), 0);
  history = State.undo(history).history;
  history = State.push(history, edit(9), 0);
  assert.equal(State.redo(history).snapshot.edit.clips[0].endSeconds, 9);

  history = State.createHistory(edit(1));
  for (let value = 2; value <= 102; value += 1) history = State.push(history, edit(value), 0);
  let oldest = null;
  for (let count = 0; count < 100; count += 1) oldest = State.undo(history), history = oldest.history;
  assert.equal(oldest.snapshot.edit.clips[0].endSeconds, 2);
  assert.equal(State.undo(history).snapshot.edit.clips[0].endSeconds, 2);
});

test('pointer mapping includes horizontal scroll and clamps to virtual duration', () => {
  const input = { clientX: 160, rectLeft: 100, scrollLeft: 50, pixelsPerSecond: 10, totalSeconds: 12 };
  assert.equal(State.mapClientXToVirtualTime(input), 11);
  assert.equal(State.mapClientXToVirtualTime({ ...input, clientX: 0 }), 0);
  assert.equal(State.mapClientXToVirtualTime({ ...input, clientX: 500 }), 12);
});

test('clip offsets accumulate virtual durations across source videos', () => {
  const value = Edit.createEdit([clip('source-a', 10, 12.5), clip('source-b', 3, 8)]);
  assert.deepEqual(State.clipOffsets(value), { offsets: [0, 2.5], totalSeconds: 7.5 });
  assert.deepEqual(value.clips, [clip('source-a', 10, 12.5), clip('source-b', 3, 8)]);
});

test('zoom stays within usable bounds and falls back for malformed values', () => {
  assert.equal(State.clampZoom(1), 2);
  assert.equal(State.clampZoom(999), 512);
  assert.equal(State.clampZoom(42), 42);
  for (const invalid of [NaN, Infinity, -Infinity, '42', null]) assert.equal(State.clampZoom(invalid), 24);
});
