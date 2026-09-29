import test from 'node:test';
import assert from 'node:assert/strict';
import overtake from '../game/traffic-overtake.js';
import mapModule from '../game/map-model.js';

const { createMapModel } = mapModule;

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

test('an oncoming car predicted to reach the passing window is waited for', () => {
  const scenario = {
    roadWidth:100,
    carHalfWidth:17,
    currentOffset:20,
    obstacleDistance:200,
    planningSpeed:40,
    opposingVehicles:[{ distance:430, speed:30, halfLength:40 }]
  };

  // The oncoming car is beyond the maneuver's end today, but closes 70 units/s.
  // It enters the +28+40 clearance window before the passing car returns.
  assert.equal(overtake.plan(scenario),null);
});

test('an oncoming car that clears before the lane-change starts does not block passing', () => {
  const result = overtake.plan({
    roadWidth:100,
    carHalfWidth:17,
    currentOffset:20,
    obstacleDistance:200,
    planningSpeed:40,
    opposingVehicles:[{ distance:60, speed:30, halfLength:40 }]
  });

  assert.deepEqual(result,{ targetOffset:-20, startDistance:80, endDistance:300 });
});

test('an oncoming car already behind the planner is not treated as a future collision', () => {
  assert.deepEqual(overtake.plan({
    roadWidth:100,
    carHalfWidth:17,
    currentOffset:20,
    obstacleDistance:200,
    planningSpeed:40,
    opposingVehicles:[{ distance:-80, speed:30, halfLength:40 }]
  }),{ targetOffset:-20, startDistance:80, endDistance:300 });
});

test('a parked obstacle behind the driving direction is not an overtaking target', () => {
  assert.equal(overtake.plan({
    roadWidth:100,
    carHalfWidth:17,
    currentOffset:20,
    obstacleDistance:-81,
    planningSpeed:40,
    opposingVehicles:[]
  }),null);
});

test('a too-narrow road or short sight distance keeps traffic stopped behind the obstacle', () => {
  assert.equal(overtake.plan({
    roadWidth:50, carHalfWidth:17, currentOffset:12, obstacleDistance:200, opposingVehicles:[]
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
  assert.ok(Math.abs(overtake.offsetAt(plan, 300).offset - (20 - 40 * (20 / 27))) < 1e-9);
  assert.deepEqual(overtake.offsetAt(plan, 320), { offset:20, complete:true });
});

test('turn signal follows the planned passing side, flashes, and stops with the maneuver', () => {
  const passRight = { fromOffset:21, targetOffset:-20 };
  assert.deepEqual(overtake.signalFor(passRight, 0), { side:'right', lit:true });
  assert.deepEqual(overtake.signalFor(passRight, 450), { side:'right', lit:false });
  assert.deepEqual(overtake.signalFor({ fromOffset:-20, targetOffset:21 }, 0), { side:'left', lit:true });
  assert.equal(overtake.signalFor(null, 0), null);
  assert.equal(overtake.signalFor({ fromOffset:10, targetOffset:10 }, 0), null);
});

test('turn signal paints only the selected front and rear lamps with a dim off phase', () => {
  const calls = [];
  const ctx = {
    fillStyle:'',
    strokeStyle:'',
    fillRect(...rect) { calls.push({ type:'fill', color:this.fillStyle, rect }); },
    strokeRect(...rect) { calls.push({ type:'stroke', color:this.strokeStyle, rect }); }
  };

  overtake.drawSignal(ctx, 64, 29, { side:'right', lit:true });
  assert.deepEqual(calls, [
    { type:'fill', color:'#ffd06a', rect:[24, 8.5, 6, 5] },
    { type:'stroke', color:'rgba(255,239,184,.9)', rect:[24, 8.5, 6, 5] },
    { type:'fill', color:'#ffd06a', rect:[-30, 8.5, 6, 5] },
    { type:'stroke', color:'rgba(255,239,184,.9)', rect:[-30, 8.5, 6, 5] }
  ]);

  calls.length = 0;
  overtake.drawSignal(ctx, 64, 29, { side:'left', lit:false });
  assert.deepEqual(calls, [
    { type:'fill', color:'rgba(220,151,48,.38)', rect:[24, -13.5, 6, 5] },
    { type:'stroke', color:'rgba(84,54,21,.68)', rect:[24, -13.5, 6, 5] },
    { type:'fill', color:'rgba(220,151,48,.38)', rect:[-30, -13.5, 6, 5] },
    { type:'stroke', color:'rgba(84,54,21,.68)', rect:[-30, -13.5, 6, 5] }
  ]);
});

test('intersection signals identify left, right, and reverse-direction turns', () => {
  assert.deepEqual(overtake.turnSignalForRoute({
    currentPoints:[{ x:0, y:0 },{ x:100, y:0 }],
    currentDirectionSign:1,
    nextPoints:[{ x:100, y:0 },{ x:100, y:-100 }],
    nextDirectionSign:1,
    distanceToJunction:120,
    timeMs:0
  }), { side:'left', lit:true });

  assert.deepEqual(overtake.turnSignalForRoute({
    currentPoints:[{ x:0, y:0 },{ x:100, y:0 }],
    currentDirectionSign:1,
    nextPoints:[{ x:100, y:0 },{ x:100, y:100 }],
    nextDirectionSign:1,
    distanceToJunction:120,
    timeMs:450
  }), { side:'right', lit:false });

  assert.deepEqual(overtake.turnSignalForRoute({
    currentPoints:[{ x:0, y:0 },{ x:100, y:0 }],
    currentDirectionSign:-1,
    nextPoints:[{ x:0, y:0 },{ x:0, y:100 }],
    nextDirectionSign:-1,
    distanceToJunction:120,
    timeMs:0
  }), { side:'right', lit:true });
});

test('intersection signals stay off for straight paths and outside the approach window', () => {
  const straight = overtake.turnSignalForRoute({
    currentPoints:[{ x:0, y:0 },{ x:100, y:0 }],
    currentDirectionSign:1,
    nextPoints:[{ x:100, y:0 },{ x:200, y:5 }],
    nextDirectionSign:1,
    distanceToJunction:180,
    timeMs:0
  });
  assert.equal(straight, null);

  const tooFar = overtake.turnSignalForRoute({
    currentPoints:[{ x:0, y:0 },{ x:100, y:0 }],
    currentDirectionSign:1,
    nextPoints:[{ x:100, y:0 },{ x:100, y:-100 }],
    nextDirectionSign:1,
    distanceToJunction:241,
    timeMs:0
  });
  assert.equal(tooFar, null);
});

test('a vehicle stopped by the parked car completes its partial lane change without moving forward', () => {
  const plan = {
    startAlong:100,
    endAlong:320,
    directionSign:1,
    fromOffset:21,
    targetOffset:-20
  };
  let result = overtake.offsetAt(plan, 124.4, .175, { stationary:true });
  plan.stationaryShiftProgress = result.stationaryShiftProgress;
  plan.stationaryShiftStart = result.stationaryShiftStart;
  plan.stationaryShiftElapsed = result.stationaryShiftElapsed;
  assert.ok(result.offset < -18 && result.offset > -20);

  result = overtake.offsetAt(plan, 124.4, .175, { stationary:true });
  plan.stationaryShiftProgress = result.stationaryShiftProgress;
  plan.stationaryShiftStart = result.stationaryShiftStart;
  plan.stationaryShiftElapsed = result.stationaryShiftElapsed;
  assert.equal(result.offset, -20);

  assert.equal(overtake.offsetAt(plan, 124.4, 0).offset, -20);
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

test('a stopped car can recover from a close but non-overlapping parked-car queue', () => {
  assert.deepEqual(overtake.plan({
    roadWidth:100,
    carHalfWidth:17,
    currentOffset:20,
    obstacleLateral:20,
    obstacleHalfWidth:17,
    obstacleDistance:96,
    minimumDistance:70,
    opposingVehicles:[]
  }), { targetOffset:-20, startDistance:0, endDistance:196, emergency:true });
});

test('emergency clearance uses both vehicle half-lengths without adding lateral width', () => {
  const minimumDistance = overtake.minimumEmergencyDistance(29.7,35,4);
  assert.equal(minimumDistance,68.7);
  assert.deepEqual(overtake.plan({
    roadWidth:100,
    carHalfWidth:17,
    currentOffset:20,
    obstacleLateral:20,
    obstacleHalfWidth:17,
    obstacleDistance:81,
    minimumDistance,
    opposingVehicles:[]
  }),{ targetOffset:-20,startDistance:0,endDistance:181,emergency:true });
});

test('a van can overtake the roadside car on the 82-unit home street', () => {
  assert.deepEqual(overtake.plan({
    roadWidth:82,
    carHalfWidth:18.9,
    currentOffset:21,
    obstacleLateral:23,
    obstacleHalfWidth:17.55,
    obstacleDistance:250,
    opposingVehicles:[]
  }), { targetOffset:-20.1, startDistance:130, endDistance:350 });
});

test('default parked car can be passed and cleared on the actual curved home street', () => {
  const map = createMapModel();
  const edge = map.getEdge('residential-home-south');
  const parkedHit = map.nearestRoad(9 * 600 + 38, 6600, { vehicleOnly:true });
  assert.equal(parkedHit.edgeId,edge.id);

  let parkedAlong = 0;
  let edgeLength = 0;
  for (let i = 1; i < edge.points.length; i += 1) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    const segmentLength = Math.hypot(b.x - a.x,b.y - a.y);
    edgeLength += segmentLength;
    if (i - 1 === parkedHit.segmentIndex) {
      parkedAlong += segmentLength * parkedHit.t;
    } else if (i - 1 < parkedHit.segmentIndex) {
      parkedAlong += segmentLength;
    }
  }

  const carAlong = parkedAlong - 240;
  const carHalfWidth = 36 * .9 / 2;
  const parkedHalfWidth = 39 * .9 / 2;
  const parkedHalfLength = 76 * .9 / 2;
  const actualDistance = parkedAlong - carAlong;
  const centerGap = actualDistance - 66 * .9 / 2 - parkedHalfLength;
  assert.ok(centerGap < 180);

  const from = edge.points[parkedHit.segmentIndex];
  const to = edge.points[parkedHit.segmentIndex + 1];
  const segmentLength = Math.hypot(to.x - from.x,to.y - from.y);
  const tangentX = (to.x - from.x) / segmentLength;
  const tangentY = (to.y - from.y) / segmentLength;
  const obstacleX = parkedHit.point.x + tangentY * 23;
  const obstacleY = parkedHit.point.y - tangentX * 23;
  const obstacleLateral = (obstacleX - parkedHit.point.x) * tangentY +
    (obstacleY - parkedHit.point.y) * -tangentX;
  assert.ok(overtake.blocksLane({
    carOffset:21,
    carHalfWidth,
    obstacleLateral,
    obstacleHalfWidth:parkedHalfWidth
  }));

  const plan = overtake.planForObstacle({
    roadWidth:edge.width,
    carHalfWidth,
    currentOffset:21,
    obstacleDistance:actualDistance,
    minimumDistance:130,
    obstacleLateral,
    obstacleHalfWidth:parkedHalfWidth,
    obstacleHalfLength:parkedHalfLength,
    vehicleHalfLength:66 * .9 / 2,
    endpointDistance:edgeLength - carAlong,
    currentAlong:carAlong,
    directionSign:1,
    opposingVehicles:[]
  });
  assert.ok(plan);
  assert.deepEqual(plan,{
    startAlong:parkedAlong - 120,
    endAlong:parkedAlong + 100,
    directionSign:1,
    fromOffset:21,
    targetOffset:-21,
    emergency:undefined,
    shiftProgress:0,
    holdUntilAlong:null
  });

  assert.equal(overtake.offsetAt(plan,plan.startAlong + 30).offset,plan.targetOffset);
  assert.equal(overtake.offsetAt(plan,parkedAlong).offset,plan.targetOffset);
  assert.deepEqual(overtake.offsetAt(plan,plan.endAlong),{
    offset:21,
    complete:true
  });
});

test('runtime overtake plan keeps junction clearance and waits until the parked-car rear is clear', () => {
  const scenario = {
    roadWidth:100,
    carHalfWidth:17,
    vehicleHalfLength:30,
    currentOffset:20,
    obstacleDistance:90,
    minimumDistance:70,
    obstacleLateral:20,
    obstacleHalfWidth:17,
    obstacleHalfLength:40,
    currentAlong:100,
    directionSign:1,
    opposingVehicles:[]
  };

  assert.equal(overtake.planForObstacle({ ...scenario,endpointDistance:290 }),null);
  assert.deepEqual(overtake.planForObstacle({ ...scenario,endpointDistance:291 }),{
    startAlong:100,
    endAlong:314,
    directionSign:1,
    fromOffset:20,
    targetOffset:-20,
    emergency:true,
    shiftProgress:0,
    holdUntilAlong:284
  });
});

test('close-queue recovery shifts sideways while stopped, then returns after clearing the parked car', () => {
  const plan = {
    emergency:true,
    shiftProgress:0,
    fromOffset:20,
    targetOffset:-20,
    directionSign:1,
    holdUntilAlong:280
  };
  let result = overtake.offsetAt(plan, 100, .175);
  plan.shiftProgress = result.shiftProgress;
  assert.equal(result.offset, 0);
  result = overtake.offsetAt(plan, 100, .175);
  plan.shiftProgress = result.shiftProgress;
  assert.equal(result.offset, -20);
  assert.equal(overtake.offsetAt(plan, 280).offset, -20);
  assert.equal(overtake.offsetAt(plan, 295).offset, 0);
  assert.deepEqual(overtake.offsetAt(plan, 310), { offset:20, shiftProgress:1, complete:true });
});
