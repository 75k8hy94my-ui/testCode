import test from 'node:test';
import assert from 'node:assert/strict';
import overtake from '../game/traffic-overtake.js';

test('a parked-car pass is allowed only when the opposite lane is clear for the whole maneuver', () => {
  const result = overtake.plan({
    roadWidth:100,
    carHalfWidth:17,
    currentOffset:20,
    obstacleLateral:20,
    obstacleHalfWidth:17,
    obstacleDistance:200,
    opposingVehicles:[]
  });

  assert.deepEqual(result, { targetOffset:-20, startDistance:80, endDistance:300 });
  assert.equal(overtake.plan({
    roadWidth:100, carHalfWidth:17, currentOffset:20, obstacleDistance:200,
    opposingVehicles:[{ distance:250, halfLength:40 }]
  }), null);
  assert.equal(overtake.plan({
    roadWidth:100, carHalfWidth:17, currentOffset:20, obstacleDistance:200,
    obstacleLateral:5, obstacleHalfWidth:24, opposingVehicles:[]
  }), null);
});

test('a too-narrow road or short sight distance keeps traffic stopped behind the obstacle', () => {
  assert.equal(overtake.plan({
    roadWidth:60, carHalfWidth:17, currentOffset:12, obstacleDistance:200, opposingVehicles:[]
  }), null);
  assert.equal(overtake.plan({
    roadWidth:100, carHalfWidth:17, currentOffset:20, obstacleDistance:100, opposingVehicles:[]
  }), null);
});

test('overtaking changes lanes before the obstacle and returns to the original lane afterwards', () => {
  const plan = { startAlong:100, endAlong:320, directionSign:1, fromOffset:20, targetOffset:-20 };
  assert.deepEqual(overtake.offsetAt(plan, 90), { offset:20, complete:false });
  assert.deepEqual(overtake.offsetAt(plan, 130), { offset:-20, complete:false });
  assert.deepEqual(overtake.offsetAt(plan, 210), { offset:-20, complete:false });
  assert.ok(Math.abs(overtake.offsetAt(plan, 300).offset + 20 / 3) < 1e-9);
  assert.deepEqual(overtake.offsetAt(plan, 320), { offset:20, complete:true });
});

test('lane-shift progress works when traffic travels in the reverse edge direction', () => {
  const plan = { startAlong:900, endAlong:680, directionSign:-1, fromOffset:20, targetOffset:-20 };
  assert.deepEqual(overtake.offsetAt(plan, 870), { offset:-20, complete:false });
  assert.deepEqual(overtake.offsetAt(plan, 680), { offset:20, complete:true });
});

test('parked-car detection accounts for its body projecting into the lane', () => {
  const parkedCar = { obstacleLateral:-68, obstacleHalfWidth:38 };
  assert.equal(overtake.blocksLane({ carOffset:-21, carHalfWidth:16, ...parkedCar }), true);
  assert.equal(overtake.blocksLane({ carOffset:21, carHalfWidth:16, ...parkedCar }), false);
});

test('default roadside parking on the 82-unit residential street is passable from the blocked lane', () => {
  const obstacle = { obstacleLateral:68, obstacleHalfWidth:38 };
  assert.equal(overtake.blocksLane({ carOffset:21, carHalfWidth:16, ...obstacle }), true);
  const plan = overtake.plan({
    roadWidth:82,
    carHalfWidth:16,
    currentOffset:21,
    obstacleDistance:180,
    ...obstacle,
    opposingVehicles:[]
  });
  assert.deepEqual(plan, { targetOffset:-21, startDistance:60, endDistance:280 });
});
