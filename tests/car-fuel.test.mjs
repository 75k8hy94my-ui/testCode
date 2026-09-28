import test from 'node:test';
import assert from 'node:assert/strict';
import fuel from '../game/car-fuel.js';

test('fuel constants define a practical initial range and one portable emergency can', () => {
  assert.equal(fuel.CAPACITY_LITERS, 40);
  assert.equal(fuel.INITIAL_FUEL_LITERS, 12);
  assert.equal(fuel.CAN_CAPACITY_LITERS, 5);
  assert.equal(fuel.CAN_PRICE, 1200);
});

test('fuel normalization clamps invalid saves and defaults missing fuel for legacy saves', () => {
  assert.equal(fuel.normalizeFuel(undefined), 12);
  assert.equal(fuel.normalizeFuel(-4), 0);
  assert.equal(fuel.normalizeFuel(900), 40);
  assert.equal(fuel.normalizeFuel('not fuel'), 12);
  assert.equal(fuel.normalizeFuel(3.456), 3.46);
});

test('fuel consumption follows distance and never becomes negative', () => {
  assert.deepEqual(fuel.consumeFuel(12, 1250), { fuel:10.75, consumed:1.25 });
  assert.deepEqual(fuel.consumeFuel(0.2, 1000), { fuel:0, consumed:0.2 });
  assert.deepEqual(fuel.consumeFuel(12, -10), { fuel:12, consumed:0 });
});

test('refueling charges only delivered liters and rejects full tanks or insufficient funds', () => {
  assert.deepEqual(fuel.refuel(12, 10, 2000), { ok:true, fuel:22, liters:10, cost:1500, cashRemaining:500 });
  assert.deepEqual(fuel.refuel(35, 10, 2000), { ok:true, fuel:40, liters:5, cost:750, cashRemaining:1250 });
  assert.deepEqual(fuel.refuel(40, 10, 2000), { ok:false, reason:'tank-full' });
  assert.deepEqual(fuel.refuel(12, 10, 1000), { ok:false, reason:'insufficient-funds' });
  assert.deepEqual(fuel.refuel(12, 0, 2000), { ok:false, reason:'invalid-amount' });
});

test('portable can purchase and use are limited and preserve state on rejection', () => {
  assert.deepEqual(fuel.buyCan(0, 1500), { ok:true, count:1, cashRemaining:300 });
  assert.deepEqual(fuel.buyCan(1, 1500), { ok:false, reason:'can-already-owned' });
  assert.deepEqual(fuel.buyCan(0, 1000), { ok:false, reason:'insufficient-funds' });
  assert.deepEqual(fuel.useCan(10, 1), { ok:true, fuel:15, liters:5, count:0 });
  assert.deepEqual(fuel.useCan(39, 1), { ok:true, fuel:40, liters:1, count:0 });
  assert.deepEqual(fuel.useCan(40, 1), { ok:false, reason:'tank-full' });
  assert.deepEqual(fuel.useCan(10, 0), { ok:false, reason:'no-can' });
});
