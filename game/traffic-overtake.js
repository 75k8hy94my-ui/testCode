(function initCityDaysTrafficOvertake(global) {
  "use strict";

  function plan({ roadWidth, carHalfWidth, currentOffset, obstacleDistance, obstacleLateral, obstacleHalfWidth, opposingVehicles }) {
    const laneOffset = Math.abs(currentOffset || 0);
    const minimumWidth = carHalfWidth * 2 + laneOffset * 2 + 6;
    if (roadWidth < minimumWidth || obstacleDistance < 130 || currentOffset <= 0) return null;

    const startDistance = obstacleDistance - 120;
    const endDistance = obstacleDistance + 100;
    const targetOffset = -laneOffset;
    if (Number.isFinite(obstacleLateral) &&
      Math.abs(targetOffset - obstacleLateral) < carHalfWidth + Math.max(0, obstacleHalfWidth || 0) + 4) return null;
    const blocked = (opposingVehicles || []).some((vehicle) => {
      const halfLength = Math.max(0, vehicle.halfLength || 0);
      return vehicle.distance + halfLength + 28 >= startDistance &&
        vehicle.distance - halfLength - 28 <= endDistance;
    });
    if (blocked) return null;

    return { targetOffset, startDistance, endDistance };
  }

  function offsetAt(planState, along) {
    const progress = (along - planState.startAlong) * planState.directionSign;
    const total = Math.abs(planState.endAlong - planState.startAlong);
    if (progress < 0) return { offset:planState.fromOffset, complete:false };
    if (progress >= total) return { offset:planState.fromOffset, complete:true };
    const transition = Math.min(30, total / 3);
    const ratio = progress < transition
      ? progress / transition
      : progress > total - transition ? (total - progress) / transition : 1;
    return {
      offset:planState.fromOffset + (planState.targetOffset - planState.fromOffset) * Math.max(0, Math.min(1, ratio)),
      complete:false
    };
  }

  function blocksLane({ carOffset, carHalfWidth, obstacleLateral, obstacleHalfWidth, clearance = 6 }) {
    return Math.abs(carOffset - obstacleLateral) < carHalfWidth + obstacleHalfWidth + clearance;
  }

  const api = Object.freeze({ plan, offsetAt, blocksLane });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysTrafficOvertake = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
