import test from 'node:test';
import assert from 'node:assert/strict';
import crossingControl from '../game/crossing-control.js';

const crosswalk = { id:'crosswalk:a', roadEdgeId:'street', along:500, length:140 };

test('pedestrian may cross when no conflicting vehicle is approaching', () => {
  const result = crossingControl.assessPedestrian(crosswalk, { id:'walker', speed:30 }, []);
  assert.equal(result.decision, 'cross');
  assert.equal(result.safeToEnter, true);
});

test('pedestrian may use a clear vehicle arrival gap without making the car stop unnecessarily', () => {
  const result = crossingControl.assessPedestrian(crosswalk, { id:'walker', speed:30 }, [
    { id:'distant-car', edgeId:'street', along:0, directionSign:1, speed:20 }
  ]);
  assert.equal(result.decision, 'cross');
  assert.equal(result.safeToEnter, true);
  assert.equal(result.requestVehicleYield, false);
});

test('pedestrian waits for a fast vehicle too close to stop safely', () => {
  const result = crossingControl.assessPedestrian(crosswalk, { id:'walker', speed:30 }, [
    { id:'car', edgeId:'street', along:430, directionSign:1, speed:120 }
  ]);
  assert.equal(result.decision, 'wait');
  assert.equal(result.nearestVehicleId, 'car');
  assert.equal(result.safeToEnter, false);
});

test('vehicle yields only if its real stopping distance fits before the crossing', () => {
  const claim = { pedestrianId:'walker', phase:'waiting' };
  assert.equal(crossingControl.vehicleYieldDecision(crosswalk, claim, { id:'car', distanceToCrossing:220, speed:32 }).shouldYield, true);
  assert.equal(crossingControl.vehicleYieldDecision(crosswalk, claim, { id:'car', distanceToCrossing:15, speed:100 }).shouldYield, false);
});

test('crossing claim remains exclusive while occupied and releases cars when clear', () => {
  let claim = crossingControl.updateClaim(null, 'walker-a', 'waiting');
  claim = crossingControl.updateClaim(claim, 'walker-a', 'crossing');
  assert.equal(crossingControl.vehicleYieldDecision(crosswalk, claim, { id:'car', distanceToCrossing:50, speed:12 }).shouldYield, true);
  claim = crossingControl.updateClaim(claim, 'walker-a', 'clear');
  assert.equal(claim.pedestrianId, null);
  assert.equal(crossingControl.vehicleYieldDecision(crosswalk, claim, { id:'car', distanceToCrossing:50, speed:12 }).shouldYield, false);
});

test('simultaneous crosswalk claims are resolved in stable order without reciprocal waiting', () => {
  const winner = crossingControl.arbitrateClaims([
    { pedestrianId:'walker-z', requestedAt:10 },
    { pedestrianId:'walker-a', requestedAt:10 }
  ]);
  assert.equal(winner.pedestrianId, 'walker-a');
  assert.equal(winner.phase, 'crossing');
});
