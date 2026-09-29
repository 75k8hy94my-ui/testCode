import test from 'node:test';
import assert from 'node:assert/strict';
import trajectory from '../game/vehicle-trajectory.js';

test('junction curve joins actual incoming and outgoing lane poses continuously', () => {
  const curve = trajectory.createJunctionCurve(
    { point:{ x:-76,y:0 }, tangent:{ x:1,y:0 } },
    { point:{ x:0,y:76 }, tangent:{ x:0,y:1 } }
  );
  const start = trajectory.poseAt(curve, 0);
  const middle = trajectory.poseAt(curve, .5);
  const end = trajectory.poseAt(curve, 1);
  assert.deepEqual({ x:start.x,y:start.y }, { x:-76,y:0 });
  assert.deepEqual({ x:end.x,y:end.y }, { x:0,y:76 });
  assert.ok(middle.x > -76 && middle.y > 0);
  assert.ok(middle.tangent.x > .2 && middle.tangent.y > .2);
  assert.ok(curve.length > Math.hypot(76, 76));
});

test('physical lane offsets use eased endpoints and have zero lateral velocity at both ends', () => {
  assert.equal(trajectory.smoothstep(0), 0);
  assert.equal(trajectory.smoothstep(1), 1);
  assert.ok(trajectory.smoothstep(.25) < .25);
  assert.ok(trajectory.smoothstep(.75) > .75);
});

test('lateral motion contributes to the physical heading used by collisions and following', () => {
  const centered = trajectory.withLateralVelocity({ x:0,y:0,tangent:{ x:1,y:0 } }, 20, 0);
  const changing = trajectory.withLateralVelocity({ x:0,y:0,tangent:{ x:1,y:0 } }, 20, 8);
  assert.equal(centered.tangent.y, 0);
  assert.ok(changing.tangent.y < 0);
  assert.ok(Math.abs(Math.hypot(changing.velocity.x,changing.velocity.y) - Math.hypot(20,8)) < 1e-9);
});
