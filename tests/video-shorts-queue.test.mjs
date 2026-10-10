import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { generate } = require('../video-shorts-queue.js');

function video(id, patch = {}) {
  return {
    id,
    url: `https://cdn.example/${id}.mp4`,
    title: '',
    tags: [],
    durationSeconds: 300,
    videoWidth: 720,
    videoHeight: 1280,
    shorts: { liked: false, playCount: 0, earlySwipeCount: 0, updatedAt: 0 },
    ...patch,
  };
}

const fixedRandom = () => 0.5;

test('marker clips group later marks within thirty seconds and ignore marks through ten seconds after the endpoint', () => {
  const entries = generate([video('markers', { durationSeconds: 180 })], {
    markersByVideo: { markers: [10, 35, 50, 61, 70, 92, 120].map((seconds) => ({ seconds, icon: 'water' })) },
    random: fixedRandom,
  });
  assert.deepEqual(entries.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]), [[10, 45], [61, 80], [92, 130]]);
});

test('marker clips clamp their ends and discard invalid or out-of-range marker seconds', () => {
  const entries = generate([video('tail', { durationSeconds: 50, videoWidth: 1920, videoHeight: 1080 })], {
    markersByVideo: { tail: [{ seconds: -1 }, { seconds: 42 }, { seconds: 50 }, { seconds: 51 }] },
    random: fixedRandom,
  });
  assert.deepEqual(entries.map((entry) => [entry.startSeconds, entry.endSeconds]), [[42, 50]]);
  assert.equal(entries[0].entryType, 'marker');
  assert.equal(entries[0].tier, 1);
});

test('portrait tag, custom-title, and remaining videos get one bounded random segment each', () => {
  const entries = generate([
    video('tagged', { tags: ['music'] }),
    video('named', { title: 'A custom title' }),
    video('default-title'),
  ], { markersByVideo: {}, random: fixedRandom });
  assert.deepEqual(entries.map(({ videoId, startSeconds, endSeconds, entryType, tier }) => ({ videoId, startSeconds, endSeconds, entryType, tier })), [
    { videoId: 'tagged', startSeconds: 135, endSeconds: 165, entryType: 'random-short', tier: 1 },
    { videoId: 'named', startSeconds: 135, endSeconds: 165, entryType: 'random-short', tier: 2 },
    { videoId: 'default-title', startSeconds: 135, endSeconds: 165, entryType: 'random-short', tier: 3 },
  ]);
});

test('videos shorter than thirty seconds use their full duration once', () => {
  const entries = generate([video('tiny', { durationSeconds: 12, tags: ['clip'] })], { markersByVideo: {}, random: fixedRandom });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].startSeconds, 0);
  assert.equal(entries[0].endSeconds, 12);
});

test('only direct-link URLs enter the queue and unmarked landscape/square videos overflow short clips', () => {
  const entries = generate([
    video('portrait'),
    video('landscape', { videoWidth: 1920, videoHeight: 1080 }),
    video('square', { videoWidth: 900, videoHeight: 900 }),
    video('embedded', { url: 'https://example.com/embed/id' }),
    video('marked-landscape', { videoWidth: 1920, videoHeight: 1080 }),
  ], { markersByVideo: { 'marked-landscape': [{ seconds: 20 }] }, random: fixedRandom });
  assert.deepEqual(entries.map(({ videoId, entryType }) => [videoId, entryType]), [
    ['marked-landscape', 'marker'],
    ['portrait', 'random-short'],
    ['landscape', 'overflow-landscape'],
    ['square', 'overflow-landscape'],
  ]);
});

test('videos at least twenty-five minutes long play in full after all shorter overflow videos', () => {
  const entries = generate([
    video('long-marked', { durationSeconds: 1500, videoWidth: 1920, videoHeight: 1080 }),
    video('landscape', { durationSeconds: 100, videoWidth: 1920, videoHeight: 1080 }),
    video('long-portrait', { durationSeconds: 1500 }),
  ], { markersByVideo: { 'long-marked': [{ seconds: 10 }] }, random: fixedRandom });
  assert.deepEqual(entries.map(({ videoId, startSeconds, endSeconds, entryType }) => [videoId, startSeconds, endSeconds, entryType]), [
    ['landscape', 0, 100, 'overflow-landscape'],
    ['long-marked', 0, 1500, 'overflow-long'],
    ['long-portrait', 0, 1500, 'overflow-long'],
  ]);
});

test('likes, Tier 1 play-count buckets, and early swipes set priority before random tie order', () => {
  const videos = [
    video('liked', { shorts: { liked: true, playCount: 99, earlySwipeCount: 8, updatedAt: 1 } }),
    video('count-10-skip-3', { shorts: { liked: false, playCount: 10, earlySwipeCount: 3, updatedAt: 1 } }),
    video('count-11-skip-0', { shorts: { liked: false, playCount: 11, earlySwipeCount: 0, updatedAt: 1 } }),
    video('count-10-skip-1', { shorts: { liked: false, playCount: 10, earlySwipeCount: 1, updatedAt: 1 } }),
    video('count-10-skip-2', { shorts: { liked: false, playCount: 10, earlySwipeCount: 2, updatedAt: 1 } }),
  ];
  const markersByVideo = Object.fromEntries(videos.map(({ id }) => [id, [{ seconds: 10 }]]));
  assert.deepEqual(generate(videos, { markersByVideo, random: fixedRandom }).map(({ videoId }) => videoId), [
    'liked', 'count-10-skip-1', 'count-10-skip-2', 'count-10-skip-3', 'count-11-skip-0',
  ]);
});

test('each entry receives the requested queue generation identifier', () => {
  assert.equal(generate([video('v1')], { markersByVideo: {}, generation: 7, random: fixedRandom })[0].generation, 7);
});
