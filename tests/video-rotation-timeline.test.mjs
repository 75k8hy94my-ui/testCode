import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const Timeline = require('../video-rotation-timeline.js');
const Data = require('../video-data.js');
const Rotation = require('../video-player-rotation.js');

test('rotation keyframes choose absolute orientation at and after each time', () => {
  const rows = Timeline.normalize([
    { seconds: 40, direction: 'half' },
    { seconds: 10, direction: 'right' },
    { seconds: 25, direction: 'none' },
    { seconds: 70, direction: 'left' },
  ]);
  assert.equal(Timeline.directionAt(rows, 0, 'left'), 'left');
  assert.equal(Timeline.directionAt(rows, 10, 'left'), 'right');
  assert.equal(Timeline.directionAt(rows, 25, 'left'), 'none');
  assert.equal(Timeline.directionAt(rows, 40, 'left'), 'half');
  assert.equal(Timeline.directionAt(rows, 500, 'left'), 'left');
  assert.equal(Timeline.directionAt(rows, 14, 'none'), 'right');
  assert.equal(Timeline.normalize([{ seconds: -1, direction: 'left' }, { seconds: 1, direction: 'bad' }]).length, 0);
});

test('rotation timelines survive normalization and metadata merges', () => {
  const rows = [{ seconds: 15, direction: 'right' }, { seconds: 90, direction: 'half' }];
  assert.deepEqual(Data.normalizeVideo({ id: 'clip', rotationKeyframes: rows }).rotationKeyframes, rows);
  const merged = Data.mergeVideoMetaPreservingThumbnailTime({ clip: { rotationKeyframes: rows } }, { clip: { title: 'Updated' } });
  assert.deepEqual(merged.clip.rotationKeyframes, rows);
});

test('playback can rotate and unrotate on seeking without changing media content', () => {
  const classes = () => {
    const values = new Set();
    return { add(x) { values.add(x); }, remove(x) { values.delete(x); }, contains(x) { return values.has(x); } };
  };
  const listeners = new Map();
  const video = {
    currentTime: 0, videoWidth: 1920, videoHeight: 1080, style: {}, classList: classes(),
    addEventListener(type, cb) { const callbacks = listeners.get(type) || new Set(); callbacks.add(cb); listeners.set(type, callbacks); },
    removeEventListener(type, cb) { listeners.get(type)?.delete(cb); },
    emit(type) { for (const cb of listeners.get(type) || []) cb(); },
  };
  const frame = { classList: classes(), style: { height: '500px' }, clientWidth: 900, clientHeight: 500 };
  const cleanup = Timeline.attach(frame, video, [{ seconds: 4, direction: 'half' }, { seconds: 8, direction: 'left' }, { seconds: 12, direction: 'none' }], 'none', Rotation);
  video.currentTime = 4; video.emit('seeking');
  assert.equal(video.classList.contains('videoPlayerRotatedHalf'), true);
  video.currentTime = 8; video.emit('timeupdate');
  assert.equal(video.classList.contains('videoPlayerRotatedHalf'), false);
  assert.equal(video.classList.contains('videoPlayerRotatedLeft'), true);
  video.currentTime = 12; video.emit('seeked');
  assert.equal(video.classList.contains('videoPlayerRotatedLeft'), false);
  cleanup();
  assert.equal(listeners.get('seeking').size, 0);
});

test('normal editor owns timed rotation UI and player loads corresponding runtime', () => {
  const edit = fs.readFileSync(new URL('../video-edit-page.js', import.meta.url), 'utf8');
  const player = fs.readFileSync(new URL('../video-player-page.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
  assert.match(edit, /data-add-rotation/);
  assert.match(edit, /function readRotationRows/);
  assert.match(edit, /rotationKeyframes, thumbnailUrl/);
  assert.match(player, /rotationTimeline\.attach/);
  assert.ok(html.indexOf('video-rotation-timeline.js') < html.indexOf('video-player-page.js'));
});
