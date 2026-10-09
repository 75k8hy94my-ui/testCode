import test from 'node:test';
import assert from 'node:assert/strict';
import edits from '../video-virtual-edit.js';

const clip = (sourceVideoId, startSeconds, endSeconds) => ({ sourceVideoId, startSeconds, endSeconds });

test('recognizes only HTTP(S) MP4 direct links, including signed URLs', () => {
  assert.equal(edits.isMp4Url('https://cdn.example.test/a.MP4?token=abc#t=15'), true);
  assert.equal(edits.isMp4Url('http://cdn.example.test/a.mp4'), true);
  for (const url of ['https://cdn.example.test/a.m3u8', 'https://cdn.example.test/a.mov',
    'https://cdn.example.test/a.mp4/stream', 'https://cdn.example.test/watch?name=a.mp4',
    'javascript:alert(1)', 'file:///a.mp4', 'not a URL']) {
    assert.equal(edits.isMp4Url(url), false, url);
  }
});

test('creates a versioned, JSON-serializable edit without modifying input', () => {
  const original = clip('a', 2.5, 35);
  const result = edits.createEdit([original]);
  assert.deepEqual(result, { type: 'virtual-mp4-edit', version: 1, clips: [original] });
  assert.notEqual(result.clips[0], original);
  assert.deepEqual(edits.normalizeEdit(JSON.parse(JSON.stringify(result))), result);
  result.clips[0].startSeconds = 4;
  assert.equal(original.startSeconds, 2.5);
});

test('rejects malformed ranges, invalid versions, and oversized edit lists', () => {
  for (const bad of [clip('', 0, 1), clip('a', -1, 1), clip('a', 5, 5),
    clip('a', 9, 2), clip('a', NaN, 5), clip('a', 0, Infinity),
    { sourceVideoId: 'a', startSeconds: '0', endSeconds: 1 }]) {
    assert.throws(() => edits.createEdit([bad]));
  }
  assert.throws(() => edits.createEdit([]));
  assert.throws(() => edits.createEdit(Array.from({ length: edits.MAX_CLIPS + 1 }, () => clip('a', 0, 1))));
  assert.throws(() => edits.normalizeEdit({ type: 'virtual-mp4-edit', version: 999, clips: [clip('a', 0, 1)] }));
});

test('requires every source to exist in the registered video list and be an MP4', () => {
  const project = edits.createEdit([clip('a', 0, 30), clip('b', 2, 6)]);
  const videos = [
    { id: 'a', url: 'https://cdn.example.test/a.mp4?t=1' },
    { id: 'b', url: 'https://cdn.example.test/b.mp4' },
  ];
  assert.deepEqual(edits.validateSources(project, videos), project);
  assert.throws(() => edits.validateSources(project, videos.slice(0, 1)), /missing or is not/);
  assert.throws(() => edits.validateSources(project, [videos[0], { id: 'b', url: 'https://site.test/watch' }]), /missing or is not/);
});

test('splits one range using original source time without altering its input', () => {
  const original = edits.createEdit([clip('a', 10, 50)]);
  const result = edits.splitClip(original, 0, 27.5);
  assert.deepEqual(result.clips, [clip('a', 10, 27.5), clip('a', 27.5, 50)]);
  assert.deepEqual(original.clips, [clip('a', 10, 50)]);
  for (const point of [10, 50, -1, NaN]) assert.throws(() => edits.splitClip(original, 0, point));
  assert.throws(() => edits.splitClip(original, 3, 12));
});

test('joins ranges from separate MP4 sources and calculates the virtual duration', () => {
  const a = edits.createEdit([clip('a', 10, 40)]);
  const b = edits.createEdit([clip('b', 5, 25), clip('a', 1, 3)]);
  const result = edits.joinEdits(a, b);
  assert.deepEqual(result.clips, [clip('a', 10, 40), clip('b', 5, 25), clip('a', 1, 3)]);
  assert.equal(edits.totalDuration(result), 52);
  assert.equal(a.clips.length, 1);
  assert.equal(b.clips.length, 2);
});

test('trims, reorders, and removes without mutating the project', () => {
  const a = edits.createEdit([clip('a', 0, 20), clip('b', 4, 8)]);
  const trimmed = edits.trimClip(a, 0, 3, 11);
  assert.deepEqual(trimmed.clips[0], clip('a', 3, 11));
  assert.deepEqual(edits.moveClip(trimmed, 0, 1).clips, [clip('b', 4, 8), clip('a', 3, 11)]);
  assert.deepEqual(edits.removeClip(trimmed, 0).clips, [clip('b', 4, 8)]);
  assert.deepEqual(a.clips, [clip('a', 0, 20), clip('b', 4, 8)]);
  assert.throws(() => edits.trimClip(a, 0, -1, 2));
  assert.throws(() => edits.trimClip(a, 0, 0, 21));
  assert.throws(() => edits.moveClip(a, 0, 2));
  assert.throws(() => edits.removeClip(edits.createEdit([clip('a', 0, 1)]), 0));
});

test('maps virtual timeline boundaries to source times without re-encoding', () => {
  const edit = edits.createEdit([clip('a', 10, 20), clip('b', 3, 7)]);
  assert.deepEqual(edits.locateTime(edit, 0), { clipIndex: 0, sourceVideoId: 'a', sourceSeconds: 10 });
  assert.deepEqual(edits.locateTime(edit, 9), { clipIndex: 0, sourceVideoId: 'a', sourceSeconds: 19 });
  assert.deepEqual(edits.locateTime(edit, 10), { clipIndex: 1, sourceVideoId: 'b', sourceSeconds: 3 });
  assert.deepEqual(edits.locateTime(edit, 13), { clipIndex: 1, sourceVideoId: 'b', sourceSeconds: 6 });
  assert.equal(edits.locateTime(edit, 14), null);
  assert.equal(edits.locateTime(edit, -0.1), null);
});
