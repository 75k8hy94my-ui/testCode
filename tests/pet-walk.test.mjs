import test from 'node:test';
import assert from 'node:assert/strict';
import petWalk from '../game/pet-walk.js';

const walkingDog = (walkState) => petWalk.normalizeWalkState(walkState, {
  worldSize:10800,
  hasDog:true,
  playerCanWalk:true
});

test('a new walk is inactive and a valid start anchors the dog at the player trail', () => {
  const empty = petWalk.createWalkState();
  assert.deepEqual(empty, {
    active:false,
    trail:[],
    distance:0,
    followerDistance:0,
    elapsedMinutes:0,
    petX:0,
    petY:0,
    facing:0
  });

  const started = petWalk.beginWalk(empty, { x:120, y:260 });
  assert.equal(started.ok, true);
  assert.deepEqual(started.state, {
    active:true,
    trail:[{ x:120, y:260, distance:0 }],
    distance:0,
    followerDistance:0,
    elapsedMinutes:0,
    petX:120,
    petY:260,
    facing:0
  });
  assert.equal(empty.active, false);
});

test('a second start and invalid coordinates are rejected without changing the existing walk', () => {
  const active = petWalk.beginWalk(petWalk.createWalkState(), { x:100, y:100 }).state;
  const repeated = petWalk.beginWalk(active, { x:300, y:300 });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.reason, 'already-active');
  assert.deepEqual(repeated.state, active);

  const badOrigin = petWalk.beginWalk(petWalk.createWalkState(), { x:NaN, y:2 });
  assert.equal(badOrigin.ok, false);
  assert.equal(badOrigin.reason, 'invalid-origin');
  assert.equal(badOrigin.state.active, false);
});

test('recording a turn preserves the walked corner instead of replacing it with a straight shortcut', () => {
  let state = petWalk.beginWalk(petWalk.createWalkState(), { x:0, y:0 }).state;
  state = petWalk.recordPlayerPosition(state, { x:24, y:0 });
  state = petWalk.recordPlayerPosition(state, { x:24, y:80 });

  assert.equal(state.distance, 104);
  assert.ok(state.trail.some((point) => point.x === 24 && point.y === 0));
  assert.deepEqual(state.trail.at(-1), { x:24, y:80, distance:104 });
  let previous = state.trail[0];
  for (const point of state.trail.slice(1)) {
    const segmentLength = Math.hypot(point.x - previous.x, point.y - previous.y);
    assert.ok(segmentLength > 0 && segmentLength <= 8.01);
    assert.ok(point.x === 24 || point.y === 0);
    assert.ok(point.distance > previous.distance);
    assert.ok(Math.abs(point.distance - previous.distance - segmentLength) < 0.02);
    previous = point;
  }
});

test('the follower advances on the recorded polyline within its speed budget and does not overshoot', () => {
  let state = petWalk.beginWalk(petWalk.createWalkState(), { x:0, y:0 }).state;
  state = petWalk.recordPlayerPosition(state, { x:24, y:0 });
  state = petWalk.recordPlayerPosition(state, { x:24, y:80 });

  state = petWalk.advanceFollower(state, 3, 20);
  assert.equal(state.followerDistance, 60);
  assert.deepEqual({ x:state.petX, y:state.petY }, { x:24, y:36 });
  const distanceBefore = state.followerDistance;
  state = petWalk.advanceFollower(state, 10, 20);
  assert.equal(state.followerDistance, state.distance - 44);
  assert.ok(state.followerDistance - distanceBefore <= 200);
  assert.deepEqual({ x:state.petX, y:state.petY }, { x:24, y:36 });
  const caughtUp = petWalk.advanceFollower(state, 10, 20);
  assert.equal(caughtUp.followerDistance, state.followerDistance);
});

test('elapsed game time accumulates only for an active walk', () => {
  let state = petWalk.beginWalk(petWalk.createWalkState(), { x:4, y:7 }).state;
  state = petWalk.advanceElapsed(state, 2.5);
  state = petWalk.advanceElapsed(state, 1.25);
  assert.equal(state.elapsedMinutes, 3.75);
  assert.equal(petWalk.advanceElapsed(state, -1).elapsedMinutes, 3.75);
  assert.equal(petWalk.advanceElapsed(state, Number.NaN).elapsedMinutes, 3.75);
  assert.equal(petWalk.advanceElapsed(petWalk.clearWalkState(), 10).elapsedMinutes, 0);
});

test('long walks prune only trail history behind the follower and stay within 512 points', () => {
  let state = petWalk.beginWalk(petWalk.createWalkState(), { x:10, y:10 }).state;
  for (let step = 1; step <= 700; step += 1) {
    state = petWalk.recordPlayerPosition(state, { x:10 + step * 8, y:10 });
    state = petWalk.advanceFollower(state, .1, 90);
  }

  assert.equal(state.distance, 5600);
  assert.ok(state.trail.length <= 512);
  assert.ok(state.followerDistance <= state.trail.at(-1).distance);
  assert.ok(state.trail[0].distance <= state.followerDistance);
  assert.ok(state.trail.at(-1).distance === state.distance);
  const before = state.followerDistance;
  state = petWalk.advanceFollower(state, .1, 90);
  assert.ok(state.followerDistance >= before);
  assert.ok(state.followerDistance - before <= 9.01);
});

test('legacy, incompatible, malformed, and overlong walk snapshots fail closed', () => {
  const inactive = petWalk.createWalkState();
  assert.deepEqual(petWalk.normalizeWalkState(null, { worldSize:10800, hasDog:true, playerCanWalk:true }), inactive);

  const active = petWalk.beginWalk(inactive, { x:100, y:200 }).state;
  assert.deepEqual(petWalk.normalizeWalkState(active, { worldSize:10800, hasDog:false, playerCanWalk:true }), inactive);
  assert.deepEqual(petWalk.normalizeWalkState(active, { worldSize:10800, hasDog:true, playerCanWalk:false }), inactive);

  const invalidCases = [
    { ...active, distance:Infinity },
    { ...active, petX:NaN },
    { ...active, petY:10801 },
    { ...active, trail:[{ x:100, y:200, distance:0 }, { x:110, y:200, distance:5 }] },
    { ...active, trail:[{ x:100, y:200, distance:0 }, { x:10801, y:200, distance:10 }] },
    { ...active, trail:Array.from({ length:513 }, (_, i) => ({ x:100 + i, y:200, distance:i })) }
  ];
  for (const value of invalidCases) {
    assert.deepEqual(petWalk.normalizeWalkState(value, { worldSize:10800, hasDog:true, playerCanWalk:true }), inactive);
  }
});

test('clearing a walk produces a fresh inactive value without mutating its input', () => {
  const active = petWalk.beginWalk(petWalk.createWalkState(), { x:10, y:20 }).state;
  const before = structuredClone(active);
  assert.deepEqual(petWalk.clearWalkState(), petWalk.createWalkState());
  assert.deepEqual(active, before);
});
