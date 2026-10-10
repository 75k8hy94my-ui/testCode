import test from 'node:test';
import assert from 'node:assert/strict';
import progression from '../game/vehicle-progression.js';

test('a new game begins without owning the used car', () => {
  assert.deepEqual(progression.createNewGame(), { owned:false });
});

test('legacy saves without ownership data retain their existing car', () => {
  assert.deepEqual(progression.normalize(undefined), { owned:true });
  assert.deepEqual(progression.normalize({}), { owned:true });
  assert.deepEqual(progression.normalize({ owned:false }), { owned:false });
});

test('used car purchase requires ten thousand yen and cannot be bought with starting cash alone', () => {
  const initial = progression.createNewGame();
  assert.equal(progression.purchase(initial, 8000).ok, false);
  const result = progression.purchase(initial, 9999);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient-funds');
  assert.deepEqual(result.progress, initial);
  assert.equal(result.cashRemaining, 9999);
});

test('used car purchase is atomic and cannot be repeated', () => {
  const result = progression.purchase(progression.createNewGame(), 12000);
  assert.equal(result.ok, true);
  assert.deepEqual(result.progress, { owned:true });
  assert.equal(result.cashRemaining, 2000);
  const repeated = progression.purchase(result.progress, result.cashRemaining);
  assert.equal(repeated.ok, false);
  assert.equal(repeated.reason, 'already-owned');
  assert.equal(repeated.cashRemaining, 2000);
});
