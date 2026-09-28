import test from 'node:test';
import assert from 'node:assert/strict';
import fishing from '../game/park-fishing.js';

test('a ¥500 bait pack adds five casts and keeps the input progress unchanged', () => {
  const original = fishing.createProgress();
  const result = fishing.buyBait(original, 500);
  assert.equal(result.ok, true);
  assert.equal(result.progress.bait, 5);
  assert.equal(result.cashRemaining, 0);
  assert.equal(original.bait, 0);
  assert.deepEqual(fishing.buyBait(original, 499), {
    ok:false,
    reason:'insufficient-funds',
    progress:original
  });
});

test('fishing windows change exactly at dawn, daytime, evening, and night boundaries', () => {
  const cases = [
    [299, 'night', 'catfish', 0.36],
    [300, 'dawn', 'crucian', 0.72],
    [539, 'dawn', 'crucian', 0.72],
    [540, 'day', 'bluegill', 0.52],
    [959, 'day', 'bluegill', 0.52],
    [960, 'evening', 'carp', 0.74],
    [1199, 'evening', 'carp', 0.74],
    [1200, 'night', 'catfish', 0.36]
  ];
  for (const [minute, id, fishType, chance] of cases) {
    assert.deepEqual(fishing.getFishingWindow(minute), { id, fishType, baseChance:chance });
  }
  assert.equal(fishing.getFishingWindow(-1), null);
  assert.equal(fishing.getFishingWindow(1440), null);
});

test('bite chance uses fishing skill with the specified bonus and 0.95 maximum', () => {
  assert.equal(fishing.biteChance(fishing.createProgress(), 480), 0.72);
  assert.equal(fishing.biteChance({ bait:0, fish:0, skill:50, casts:0, catches:0 }, 480), 0.82);
  assert.equal(fishing.biteChance({ bait:0, fish:0, skill:100, casts:0, catches:0 }, 480), 0.92);
  assert.equal(fishing.biteChance({ bait:0, fish:0, skill:100, casts:0, catches:0 }, 1320), 0.56);
  assert.equal(fishing.biteChance({ bait:0, fish:0, skill:100, casts:0, catches:0 }, 480), 0.92);
});

test('a roll below the threshold catches the window species and rewards two skill points', () => {
  const progress = { bait:2, fish:0, skill:0, casts:0, catches:0 };
  const result = fishing.cast(progress, 1, 300, 0.7199);
  assert.deepEqual(result, {
    ok:true,
    progress:{ bait:1, fish:1, skill:2, casts:1, catches:1 },
    caught:true,
    fishType:'crucian',
    chance:0.72,
    duration:25
  });
  assert.equal(progress.bait, 2);
});

test('a roll exactly at the threshold misses but consumes bait and grants only attempt skill', () => {
  const result = fishing.cast({ bait:1, fish:0, skill:0, casts:0, catches:0 }, 4, 540, 0.52);
  assert.deepEqual(result, {
    ok:true,
    progress:{ bait:0, fish:0, skill:1, casts:1, catches:0 },
    caught:false,
    fishType:null,
    chance:0.52,
    duration:25
  });
});

test('skill gain is capped at 100 after repeated successful casts', () => {
  const result = fishing.cast({ bait:3, fish:0, skill:99, casts:8, catches:8 }, 2, 1000, 0);
  assert.equal(result.caught, true);
  assert.equal(result.progress.skill, 100);
  assert.equal(result.progress.catches, 9);
  assert.equal(result.fishType, 'carp');
});

test('casts reject empty bait, invalid date, and malformed roll without changing progress', () => {
  const progress = fishing.createProgress();
  for (const [day, minute, roll, reason] of [
    [1, 480, 0.2, 'no-bait'],
    [0, 480, 0.2, 'invalid-time'],
    [1, 1440, 0.2, 'invalid-time'],
    [1, 480, 1, 'invalid-roll'],
    [1, 480, NaN, 'invalid-roll']
  ]) {
    assert.deepEqual(fishing.cast(progress, day, minute, roll), { ok:false, reason, progress });
  }
});

test('normalization clamps corrupt values and always returns a new safe fishing state', () => {
  const normalized = fishing.normalizeProgress({ bait:-3, fish:8, skill:180, casts:2, catches:9 });
  assert.deepEqual(normalized, { bait:0, fish:2, skill:100, casts:2, catches:2 });
  assert.notEqual(normalized, fishing.normalizeProgress(null));
});
