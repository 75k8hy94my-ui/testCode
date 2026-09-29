(function initCityDaysCrossingControl(global) {
  "use strict";

  const DEFAULT_DECELERATION = 36;
  const STOP_MARGIN = 26;
  const CLEARANCE_MARGIN = 1.5;

  function vehicleDistanceToCrossing(crosswalk, vehicle) {
    if (Number.isFinite(vehicle.distanceToCrossing)) return Math.max(0, vehicle.distanceToCrossing);
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
    for (const vehicle of vehicles) {
      const distance = vehicleDistanceToCrossing(crosswalk, vehicle);
      if (distance == null || distance < -8) continue;
      const speed = Math.max(0, Number(vehicle.speed) || 0);
      const timeToArrival = speed < .1 ? Infinity : Math.max(0, distance - (Number(vehicle.length) || 34) / 2) / speed;
      const canStop = distance >= vehicleStoppingDistance(vehicle, options.deceleration);
      const candidate = { vehicle, distance:Math.max(0, distance), speed, timeToArrival, canStop };
      if (!nearest || candidate.timeToArrival < nearest.timeToArrival || (candidate.timeToArrival === nearest.timeToArrival && String(vehicle.id).localeCompare(String(nearest.vehicle.id)) < 0)) nearest = candidate;
    }
    const safeGap = !nearest || nearest.speed < .1 || nearest.timeToArrival >= crossingDuration;
    const vehicleStopped = !nearest || nearest.speed < .1;
    const safeToEnter = safeGap && vehicleStopped || Boolean(nearest && nearest.timeToArrival >= crossingDuration + CLEARANCE_MARGIN);
    return {
      decision:safeToEnter ? "cross" : "wait",
      nearestVehicleId:nearest?.vehicle.id ?? null,
      timeToArrival:nearest?.timeToArrival ?? Infinity,
      safeToEnter,
      crossingDuration,
      requestVehicleYield:Boolean(nearest && nearest.canStop && !safeToEnter)
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
    if (!ownsCrossing) return { shouldYield:false, stopOffset:0, canStop:false, stoppingDistance:0 };
    const distance = vehicleDistanceToCrossing(crosswalk, vehicle);
    if (distance == null || distance < -8) return { shouldYield:false, stopOffset:0, canStop:false, stoppingDistance:0 };
    const speed = Math.max(0, Number(vehicle.speed) || 0);
    const stoppingDistance = vehicleStoppingDistance(vehicle, options.deceleration);
    const canStop = speed < .1 || distance >= stoppingDistance;
    const timeToArrival = speed < .1 ? Infinity : Math.max(0, distance - (Number(vehicle.length) || 34) / 2) / speed;
    const activeClearance = Math.max(0, Number(claim.clearanceTime) || (Number(crosswalk.length) || 120) / 28);
    const conflictImminent = timeToArrival <= activeClearance + CLEARANCE_MARGIN || distance <= stoppingDistance + 42;
    const shouldYield = speed < .1 || canStop && conflictImminent;
    return {
      shouldYield,
      stopOffset:Math.max(0, distance - (Number(options.stopOffset) || 18)),
      canStop,
      stoppingDistance,
      timeToArrival,
      emergencyBrake:claim.phase === "crossing" && !canStop
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

  const api = Object.freeze({ assessPedestrian, updateClaim, vehicleYieldDecision, arbitrateClaims, vehicleStoppingDistance });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysCrossingControl = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
