(function initCityDaysCrossingControl(global) {
  "use strict";

  const DEFAULT_DECELERATION = 36;
  const STOP_MARGIN = 26;
  const CLEARANCE_MARGIN = 1.5;
  const SAFE_FRONT_CLEARANCE = 14;
  const PASSED_REAR_CLEARANCE = 8;

  function safeFrontClearance(crosswalk) {
    return Math.max(SAFE_FRONT_CLEARANCE, Math.max(0, Number(crosswalk?.depth) || 0) / 2 + 8);
  }

  function vehicleDistanceToCrossing(crosswalk, vehicle) {
    if (Number.isFinite(vehicle.distanceToCrossing)) return vehicle.distanceToCrossing;
    if (vehicle.edgeId !== crosswalk.roadEdgeId || !Number.isFinite(vehicle.along)) return null;
    const direction = Number(vehicle.directionSign) < 0 ? -1 : 1;
    return (crosswalk.along - vehicle.along) * direction;
  }

  function vehicleStoppingDistance(vehicle, deceleration = DEFAULT_DECELERATION) {
    const speed = Math.max(0, Number(vehicle.speed) || 0);
    return speed * speed / (2 * Math.max(1, deceleration)) + STOP_MARGIN;
  }

  function assessPedestrian(crosswalk, pedestrian, vehicles = [], options = {}) {
    const walkSpeed = Math.max(8, Number(pedestrian?.speed) || 28);
    const crossingDuration = (Math.max(1, Number(crosswalk?.length) || 120) / walkSpeed) + CLEARANCE_MARGIN;
    let nearest = null;
    let blockingCommitted = null;
    let unsafeApproach = null;
    let requestVehicleYield = false;

    for (const vehicle of vehicles) {
      const distance = vehicleDistanceToCrossing(crosswalk, vehicle);
      if (distance == null) continue;
      const halfLength = Math.max(8, (Number(vehicle.length) || 34) / 2);
      const frontClearance = distance - halfLength;
      const rearClearance = distance + halfLength;
      if (rearClearance < -PASSED_REAR_CLEARANCE) continue;

      const speed = Math.max(0, Number(vehicle.speed) || 0);
      const timeToArrival = speed < .1 ? Infinity : Math.max(0, frontClearance) / speed;
      const stoppingDistance = vehicleStoppingDistance(vehicle, options.deceleration);
      const canStopBeforeCrossing = frontClearance >= safeFrontClearance(crosswalk) &&
        (speed < .1 || distance >= stoppingDistance);
      const committed = frontClearance < safeFrontClearance(crosswalk);
      const safelyStopped = speed < .1 && frontClearance >= safeFrontClearance(crosswalk);
      const gapSafe = !committed && (safelyStopped || timeToArrival >= crossingDuration + CLEARANCE_MARGIN);
      const candidate = {
        vehicle,
        distance,
        frontClearance,
        rearClearance,
        speed,
        timeToArrival,
        canStop:canStopBeforeCrossing,
        committed,
        gapSafe
      };

      if (!nearest || candidate.timeToArrival < nearest.timeToArrival ||
          (candidate.timeToArrival === nearest.timeToArrival && String(vehicle.id).localeCompare(String(nearest.vehicle.id)) < 0)) {
        nearest = candidate;
      }
      if (committed && (!blockingCommitted || rearClearance > blockingCommitted.rearClearance)) {
        blockingCommitted = candidate;
      }
      if (!gapSafe && !committed && (!unsafeApproach || timeToArrival < unsafeApproach.timeToArrival)) {
        unsafeApproach = candidate;
      }
      if (!gapSafe && !committed && canStopBeforeCrossing) requestVehicleYield = true;
    }

    const safeToEnter = !blockingCommitted && !unsafeApproach;
    const blocker = blockingCommitted || unsafeApproach || nearest;
    return {
      decision:safeToEnter ? "cross" : "wait",
      nearestVehicleId:blocker?.vehicle.id ?? null,
      timeToArrival:blocker?.timeToArrival ?? Infinity,
      safeToEnter,
      crossingDuration,
      requestVehicleYield,
      vehicleCommitted:Boolean(blockingCommitted),
      frontClearance:blocker?.frontClearance ?? Infinity
    };
  }

  function updateClaim(current, pedestrianId, phase) {
    const state = {
      pedestrianId:current?.pedestrianId || null,
      phase:current?.phase || "clear",
      waitingPedestrianIds:[...(current?.waitingPedestrianIds || [])]
    };
    const id = String(pedestrianId || "");
    if (!id) return state;
    if (phase === "clear") {
      state.waitingPedestrianIds = state.waitingPedestrianIds.filter((value) => value !== id);
      if (state.pedestrianId === id) {
        state.pedestrianId = null;
        state.phase = "clear";
      }
    } else if (phase === "waiting") {
      if (state.pedestrianId === id) state.phase = "waiting";
      else if (!state.waitingPedestrianIds.includes(id)) state.waitingPedestrianIds.push(id);
      state.waitingPedestrianIds.sort((a, b) => a.localeCompare(b));
    } else if (phase === "crossing") {
      if (!state.pedestrianId || state.pedestrianId === id) {
        state.pedestrianId = id;
        state.phase = "crossing";
        state.waitingPedestrianIds = state.waitingPedestrianIds.filter((value) => value !== id);
      }
    }
    if (!state.pedestrianId && state.waitingPedestrianIds.length) {
      state.pedestrianId = state.waitingPedestrianIds.shift();
      state.phase = "waiting";
    }
    return state;
  }

  function vehicleYieldDecision(crosswalk, claim, vehicle, options = {}) {
    const ownsCrossing = claim?.pedestrianId && (claim.phase === "waiting" || claim.phase === "crossing");
    if (!ownsCrossing) return { shouldYield:false, stopOffset:0, canStop:false, stoppingDistance:0, committed:false };
    const distance = vehicleDistanceToCrossing(crosswalk, vehicle);
    if (distance == null) return { shouldYield:false, stopOffset:0, canStop:false, stoppingDistance:0, committed:false };

    const halfLength = Math.max(8, (Number(vehicle.length) || 34) / 2);
    const frontClearance = distance - halfLength;
    const rearClearance = distance + halfLength;
    if (rearClearance < -PASSED_REAR_CLEARANCE) {
      return { shouldYield:false, stopOffset:0, canStop:false, stoppingDistance:0, committed:false, cleared:true };
    }

    const speed = Math.max(0, Number(vehicle.speed) || 0);
    const stoppingDistance = vehicleStoppingDistance(vehicle, options.deceleration);
    const canStop = frontClearance >= safeFrontClearance(crosswalk) &&
      (speed < .1 || distance >= stoppingDistance);
    const committed = frontClearance < safeFrontClearance(crosswalk);
    const timeToArrival = speed < .1 ? Infinity : Math.max(0, frontClearance) / speed;
    const activeClearance = Math.max(0, Number(claim.clearanceTime) || (Number(crosswalk.length) || 120) / 28);
    const conflictImminent = timeToArrival <= activeClearance + CLEARANCE_MARGIN || distance <= stoppingDistance + 42;

    // A vehicle whose nose has already entered the pedestrian conflict envelope
    // must clear the crossing when the pedestrian is still waiting. Asking both
    // actors to stop is the reciprocal-yield deadlock this module is meant to avoid.
    if (claim.phase === "waiting" && committed) {
      return {
        shouldYield:false,
        stopOffset:0,
        canStop:false,
        stoppingDistance,
        timeToArrival,
        emergencyBrake:false,
        committed:true,
        frontClearance
      };
    }

    const shouldYield = claim.phase === "crossing"
      ? (committed || canStop && conflictImminent || speed < .1)
      : (canStop && conflictImminent || speed < .1 && !committed);
    return {
      shouldYield,
      stopOffset:Math.max(0, frontClearance - SAFE_FRONT_CLEARANCE),
      canStop,
      stoppingDistance,
      timeToArrival,
      emergencyBrake:claim.phase === "crossing" && committed && !canStop,
      committed,
      frontClearance
    };
  }

  function arbitrateClaims(requests = []) {
    const ordered = requests
      .filter((request) => request?.pedestrianId)
      .slice()
      .sort((a, b) => (Number(a.requestedAt) || 0) - (Number(b.requestedAt) || 0) || String(a.pedestrianId).localeCompare(String(b.pedestrianId)));
    return ordered.length
      ? { pedestrianId:String(ordered[0].pedestrianId), phase:"crossing", waitingPedestrianIds:ordered.slice(1).map((request) => String(request.pedestrianId)) }
      : { pedestrianId:null, phase:"clear", waitingPedestrianIds:[] };
  }

  const api = Object.freeze({ assessPedestrian, updateClaim, vehicleYieldDecision, arbitrateClaims, vehicleStoppingDistance, safeFrontClearance, SAFE_FRONT_CLEARANCE });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysCrossingControl = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
