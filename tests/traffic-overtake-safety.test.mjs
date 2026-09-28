import test from 'node:test';
import assert from 'node:assert/strict';
import safety from '../game/traffic-overtake-safety.js';

test('oncoming vehicles that converge during the pass window block the maneuver', () => {
  assert.equal(safety.conflictsWithOncoming({
    startDistance:80,
    endDistance:300,
    planningSpeed:85,
    vehicleDistance:600,
    vehicleSpeed:90,
    vehicleHalfLength:38
  }),true);
});

test('an oncoming vehicle that has passed behind is not a future conflict', () => {
  assert.equal(safety.conflictsWithOncoming({
    startDistance:80,
    endDistance:300,
    planningSpeed:85,
    vehicleDistance:-90,
    vehicleSpeed:90,
    vehicleHalfLength:38
  }),false);
});

test('a stationary or speed-unknown vehicle keeps the spatial clearance check', () => {
  assert.equal(safety.conflictsWithOncoming({
    startDistance:80,
    endDistance:300,
    vehicleDistance:330,
    vehicleHalfLength:38
  }),true);
  assert.equal(safety.conflictsWithOncoming({
    startDistance:80,
    endDistance:300,
    vehicleDistance:500,
    vehicleSpeed:0,
    vehicleHalfLength:38
  }),false);
});

test('a stopped oncoming vehicle is checked against its cruise speed during a pass', () => {
  assert.equal(safety.conflictsWithOncoming({
    startDistance:80,
    endDistance:300,
    planningSpeed:85,
    vehicleDistance:600,
    vehicleSpeed:0,
    vehicleCruiseSpeed:75,
    vehicleHalfLength:38
  }),true);
});
