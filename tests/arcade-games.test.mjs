import test from 'node:test';
import assert from 'node:assert/strict';
import arcadeModule from '../game/arcade-games.js';

const arcade = arcadeModule.default || arcadeModule;

test('arcade play costs ¥300 once and rejects insufficient or invalid cash', () => {
  const progress = arcade.createProgress();
  const started = arcade.startPlay(progress, 300);
  assert.equal(started.ok, true);
  assert.equal(started.cashRemaining, 0);
  assert.equal(started.progress.activePlay, true);
  assert.equal(arcade.startPlay(progress, 299).reason, 'insufficient-funds');
  assert.equal(arcade.startPlay(progress, NaN).reason, 'invalid-cash');
  assert.equal(arcade.startPlay(progress, 300.5).reason, 'invalid-cash');
});

test('well-aimed play has higher odds than a miss and resolves only one active play', () => {
  const progress = arcade.startPlay(arcade.createProgress(), 900).progress;
  const wellAimed = arcade.resolvePlay(progress, arcade.PRIZE_CATALOG[0].position, 0.5);
  const poorlyAimed = arcade.resolvePlay(progress, 100, 0.5);
  assert.equal(wellAimed.ok, true);
  assert.equal(wellAimed.won, true);
  assert.equal(poorlyAimed.won, false);
  assert.equal(arcade.resolvePlay(wellAimed.progress, 50, 0.2).reason, 'no-active-play');
  assert.equal(wellAimed.progress.plays, 1);
  assert.equal(wellAimed.progress.wins, 1);
});

test('arcade progress migrates old or corrupt data and records duplicate prizes safely', () => {
  assert.deepEqual(arcade.normalizeProgress(undefined), arcade.createProgress());
  assert.deepEqual(arcade.normalizeProgress({ plays:-1, wins:50, prizes:{ unknown:99, 'mame-doll':-2 } }), arcade.createProgress());

  const prize = arcade.PRIZE_CATALOG[0];
  let progress = arcade.startPlay(arcade.createProgress(), 300).progress;
  progress = arcade.resolvePlay(progress, prize.position, 0.1).progress;
  progress = arcade.startPlay(progress, 300).progress;
  progress = arcade.resolvePlay(progress, prize.position, 0.1).progress;
  assert.equal(progress.prizes[prize.id], 2);
  assert.equal(arcade.listCollection(progress).length, 6);
  assert.equal(arcade.listCollection(progress)[0].count, 2);
});

test('collection totals cannot exceed recorded wins when progress is normalized', () => {
  const prize = arcade.PRIZE_CATALOG[2];
  const normalized = arcade.normalizeProgress({ plays:2, wins:1, prizes:{ [prize.id]:99 } });
  assert.equal(normalized.prizes[prize.id], 1);
  assert.equal(Object.values(normalized.prizes).reduce((sum, count) => sum + count, 0), normalized.wins);
});

test('arcade rejects invalid positions and random values without changing progress', () => {
  const progress = arcade.startPlay(arcade.createProgress(), 300).progress;
  for (const args of [[-1, 0], [101, 0], [50, -0.1], [50, 1], [NaN, 0.5]]) {
    const result = arcade.resolvePlay(progress, ...args);
    assert.equal(result.ok, false);
  }
  assert.equal(progress.plays, 0);
  assert.equal(progress.activePlay, true);
});
