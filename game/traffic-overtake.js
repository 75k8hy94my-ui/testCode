(function initCityDaysTrafficOvertake(global) {
  "use strict";

  const safety = global.CityDaysTrafficOvertakeSafety ||
    (typeof require === "function" ? require("./traffic-overtake-safety.js") : null);

  function minimumEmergencyDistance(vehicleHalfLength, obstacleHalfLength, clearance = 4) {
    return Math.max(0,Number(vehicleHalfLength) || 0) +
      Math.max(0,Number(obstacleHalfLength) || 0) +
      Math.max(0,Number(clearance) || 0);
  }

  function plan({ roadWidth, carHalfWidth, currentOffset, obstacleDistance, minimumDistance = 130, obstacleLateral, obstacleHalfWidth, planningSpeed, opposingVehicles }) {
    const laneOffset = Math.abs(currentOffset || 0);
    if (obstacleDistance < minimumDistance || currentOffset <= 0) return null;
    const emergency = obstacleDistance < 130;
    const startDistance = emergency ? 0 : obstacleDistance - 120;
    const endDistance = obstacleDistance + 100;
    const availableOpposingOffset = roadWidth / 2 - carHalfWidth - 2;
    const targetMagnitude = Math.min(laneOffset, availableOpposingOffset);
    if (targetMagnitude <= 0 || carHalfWidth * 2 + laneOffset + targetMagnitude + 2 > roadWidth) return null;
    let targetOffset = -targetMagnitude;
    const obstacleClearance = carHalfWidth + Math.max(0, obstacleHalfWidth || 0) + 4;
    if (Number.isFinite(obstacleLateral) && Math.abs(targetOffset - obstacleLateral) < obstacleClearance) {
      const fartherOffset = obstacleLateral > targetOffset
        ? obstacleLateral - obstacleClearance
        : obstacleLateral + obstacleClearance;
      if (fartherOffset < 0 && Math.abs(fartherOffset) <= availableOpposingOffset) targetOffset = fartherOffset;
      else return null;
    }
    if (Number.isFinite(obstacleLateral) && Math.abs(targetOffset - obstacleLateral) < obstacleClearance) return null;
    const blocked = (opposingVehicles || []).some((vehicle) => {
      return safety?.conflictsWithOncoming({
        startDistance,
        endDistance,
        planningSpeed,
        vehicleDistance:vehicle.distance,
        vehicleSpeed:vehicle.speed,
        vehicleCruiseSpeed:vehicle.cruiseSpeed,
        vehicleHalfLength:vehicle.halfLength
      }) ?? false;
    });
    if (blocked) return null;

    return emergency
      ? { targetOffset, startDistance, endDistance, emergency:true }
      : { targetOffset, startDistance, endDistance };
  }

  function planForObstacle({
    roadWidth,
    carHalfWidth,
    vehicleHalfLength = 0,
    currentOffset,
    obstacleDistance,
    minimumDistance = 130,
    obstacleLateral,
    obstacleHalfWidth,
    obstacleHalfLength = 0,
    endpointDistance,
    endpointClearance = 100,
    planningSpeed,
    currentAlong,
    directionSign = 1,
    opposingVehicles
  } = {}) {
    if (!Number.isFinite(endpointDistance) || !Number.isFinite(currentAlong)) return null;
    const maneuver = plan({
      roadWidth,
      carHalfWidth,
      currentOffset,
      obstacleDistance,
      minimumDistance,
      obstacleLateral,
      obstacleHalfWidth,
      planningSpeed,
      opposingVehicles
    });
    if (!maneuver || endpointDistance <= maneuver.endDistance + endpointClearance) return null;

    const sign = directionSign < 0 ? -1 : 1;
    const holdUntilAlong = maneuver.emergency
      ? currentAlong + sign * (obstacleDistance + obstacleHalfLength + vehicleHalfLength + 24)
      : null;
    return {
      startAlong:maneuver.emergency ? currentAlong : currentAlong + sign * maneuver.startDistance,
      endAlong:maneuver.emergency
        ? holdUntilAlong + sign * 30
        : currentAlong + sign * maneuver.endDistance,
      directionSign:sign,
      fromOffset:currentOffset,
      targetOffset:maneuver.targetOffset,
      emergency:maneuver.emergency,
      shiftProgress:0,
      holdUntilAlong
    };
  }

  function offsetAt(planState, along, elapsed = 0, { stationary = false } = {}) {
    if (planState.emergency) {
      const shiftProgress = Math.min(1, (planState.shiftProgress || 0) + elapsed / .35);
      if (shiftProgress < 1) {
        return {
          offset:planState.fromOffset + (planState.targetOffset - planState.fromOffset) * shiftProgress,
          shiftProgress,
          complete:false
        };
      }
      const passedDistance = (along - planState.holdUntilAlong) * planState.directionSign;
      if (passedDistance < 0) return { offset:planState.targetOffset, shiftProgress, complete:false };
      const returnProgress = Math.min(1, passedDistance / 30);
      return {
        offset:planState.targetOffset + (planState.fromOffset - planState.targetOffset) * returnProgress,
        shiftProgress,
        complete:returnProgress >= 1
      };
    }
    const progress = (along - planState.startAlong) * planState.directionSign;
    const total = Math.abs(planState.endAlong - planState.startAlong);
    if (progress < 0) return { offset:planState.fromOffset, complete:false };
    if (progress >= total) return { offset:planState.fromOffset, complete:true };
    const transition = Math.min(30, total / 3);
    let ratio = progress < transition
      ? progress / transition
      : progress > total - transition ? (total - progress) / transition : 1;
    if (progress < total - transition) {
      ratio = Math.max(ratio, planState.stationaryShiftProgress || 0);
    }
    if (stationary && progress >= 0 && progress < transition) {
      const stationaryShiftStart = planState.stationaryShiftStart ?? ratio;
      const stationaryShiftElapsed = Math.max(0, planState.stationaryShiftElapsed || 0) + Math.max(0, elapsed);
      const stationaryShiftProgress = stationaryShiftStart +
        (1 - stationaryShiftStart) * Math.min(1, stationaryShiftElapsed / .35);
      ratio = Math.max(ratio, stationaryShiftProgress);
      return {
        offset:planState.fromOffset + (planState.targetOffset - planState.fromOffset) * Math.max(0, Math.min(1, ratio)),
        stationaryShiftStart,
        stationaryShiftElapsed,
        stationaryShiftProgress,
        complete:false
      };
    }
    return {
      offset:planState.fromOffset + (planState.targetOffset - planState.fromOffset) * Math.max(0, Math.min(1, ratio)),
      complete:false
    };
  }

  function blocksLane({ carOffset, carHalfWidth, obstacleLateral, obstacleHalfWidth, clearance = 6 }) {
    return Math.abs(carOffset - obstacleLateral) < carHalfWidth + obstacleHalfWidth + clearance;
  }

  function signalFor(planState, timeMs = 0) {
    if (!planState) return null;
    const offsetChange = Number(planState.targetOffset) - Number(planState.fromOffset);
    if (!Number.isFinite(offsetChange) || Math.abs(offsetChange) < .01) return null;
    const phase = Math.floor(Math.max(0, Number(timeMs) || 0) / 450) % 2;
    return {
      side:offsetChange > 0 ? "left" : "right",
      lit:phase === 0
    };
  }

  function turnSignalForRoute({
    currentPoints,
    currentDirectionSign = 1,
    nextPoints,
    nextDirectionSign = 1,
    distanceToJunction,
    timeMs = 0,
    activationDistance = 240
  } = {}) {
    if (
      !Array.isArray(currentPoints) || currentPoints.length < 2 ||
      !Array.isArray(nextPoints) || nextPoints.length < 2 ||
      !Number.isFinite(distanceToJunction) ||
      distanceToJunction < 0 || distanceToJunction > activationDistance
    ) return null;

    const tangentAt = (points, atEnd, directionSign) => {
      let from;
      let to;
      if (atEnd) {
        to = points[points.length - 1];
        for (let i = points.length - 2; i >= 0; i -= 1) {
          if (Math.hypot(to.x - points[i].x, to.y - points[i].y) > .001) {
            from = points[i];
            break;
          }
        }
      } else {
        from = points[0];
        for (let i = 1; i < points.length; i += 1) {
          if (Math.hypot(points[i].x - from.x, points[i].y - from.y) > .001) {
            to = points[i];
            break;
          }
        }
      }
      if (!from || !to) return null;
      const sign = directionSign < 0 ? -1 : 1;
      return { x:(to.x - from.x) * sign, y:(to.y - from.y) * sign };
    };

    const incoming = tangentAt(currentPoints, currentDirectionSign > 0, currentDirectionSign);
    const outgoing = tangentAt(nextPoints, nextDirectionSign < 0, nextDirectionSign);
    if (!incoming || !outgoing) return null;

    const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    const turnDegrees = Math.atan2(Math.abs(cross), dot) * 180 / Math.PI;
    if (turnDegrees < 28 || turnDegrees > 152) return null;

    return {
      side:cross < 0 ? "left" : "right",
      lit:Math.floor(Math.max(0, Number(timeMs) || 0) / 450) % 2 === 0
    };
  }

  function drawSignal(ctx, length, width, signal) {
    if (!ctx || !signal) return;
    const side = signal.side === "left" ? -1 : 1;
    const lampY = side * (width / 2 - 3.5) - 2.5;
    ctx.fillStyle = signal.lit ? "#ffd06a" : "rgba(220,151,48,.38)";
    ctx.strokeStyle = signal.lit ? "rgba(255,239,184,.9)" : "rgba(84,54,21,.68)";
    ctx.lineWidth = 1;
    for (const lampX of [length / 2 - 8, -length / 2 + 2]) {
      ctx.fillRect(lampX, lampY, 6, 5);
      ctx.strokeRect(lampX, lampY, 6, 5);
    }
  }

  const api = Object.freeze({ plan, planForObstacle, minimumEmergencyDistance, offsetAt, blocksLane, signalFor, turnSignalForRoute, drawSignal });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysTrafficOvertake = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
