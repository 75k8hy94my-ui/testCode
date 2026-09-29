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


test('vehicles that already passed an unsignalized crossing do not keep the pedestrian claim blocked', () => {
  const passed = { id:'past-car', edgeId:'street', distanceToCrossing:-50, speed:100, length:40 };
  const assessment = crossingControl.assessPedestrian(crosswalk, { id:'walker', speed:30 }, [passed]);
  assert.equal(assessment.decision, 'cross');
  assert.equal(assessment.nearestVehicleId, null);
  const yieldDecision = crossingControl.vehicleYieldDecision(
    crosswalk,
    { pedestrianId:'walker', phase:'waiting' },
    passed
  );
  assert.equal(yieldDecision.shouldYield, false);
});


test('a vehicle already committed into the crossing clears first instead of mutually waiting with a pedestrian', () => {
  const vehicle = { id:'committed', edgeId:'street', distanceToCrossing:30, speed:0, length:76 };
  const assessment = crossingControl.assessPedestrian(crosswalk, { id:'walker', speed:30 }, [vehicle]);
  assert.equal(assessment.decision, 'wait');
  assert.equal(assessment.vehicleCommitted, true);
  assert.equal(assessment.requestVehicleYield, false);

  const yieldDecision = crossingControl.vehicleYieldDecision(
    crosswalk,
    { pedestrianId:'walker', phase:'waiting', clearanceTime:5 },
    vehicle
  );
  assert.equal(yieldDecision.committed, true);
  assert.equal(yieldDecision.shouldYield, false);
});

test('a vehicle stopped fully behind the crossing yields and lets the pedestrian enter', () => {
  const vehicle = { id:'safe-stop', edgeId:'street', distanceToCrossing:70, speed:0, length:76 };
  const assessment = crossingControl.assessPedestrian(crosswalk, { id:'walker', speed:30 }, [vehicle]);
  assert.equal(assessment.decision, 'cross');
  assert.equal(assessment.vehicleCommitted, false);

  const yieldDecision = crossingControl.vehicleYieldDecision(
    crosswalk,
    { pedestrianId:'walker', phase:'waiting', clearanceTime:5 },
    vehicle
  );
  assert.equal(yieldDecision.shouldYield, true);
  assert.ok(yieldDecision.frontClearance >= crossingControl.SAFE_FRONT_CLEARANCE);
});
