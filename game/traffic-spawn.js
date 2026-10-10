(function initCityDaysTrafficSpawn(global) {
  "use strict";

  function positionAlong(edgeLength, ratio, startClearance, endClearance) {
    const length = Number(edgeLength);
    const from = Math.max(0, Number(startClearance) || 0);
    const to = Math.max(0, Number(endClearance) || 0);
    if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(from) || !Number.isFinite(to)) return null;
    const low = from;
    const high = length - to;
    if (high <= low) return null;
    const unit = Number.isFinite(Number(ratio)) ? Math.max(0, Math.min(1, Number(ratio))) : .5;
    return low + (high - low) * unit;
  }

  function laneOffset(edgeWidth, secondaryLane = false, primaryOffset = 38) {
    const width = Number(edgeWidth);
    if (!Number.isFinite(width) || width <= 0) return 0;
    const maxOffset = Math.max(18, width / 2 - 20);
    const primary = Math.min(Math.max(0, Number(primaryOffset) || 0), maxOffset);
    // Four lanes need about 42 units between same-direction lane centers so
    // the widest traffic cars have a visible collision-free gap.
    const extra = secondaryLane && width >= 200
      ? Math.min(42, Math.max(0, maxOffset - primary))
      : 0;
    return primary + extra;
  }

  function blockedByOpposingTraffic(edge, directionSign, vehicles = []) {
    if (!edge || Number(edge.width) >= 96) return false;
    const direction = Number(directionSign) < 0 ? -1 : 1;
    return vehicles.some((vehicle) =>
      vehicle?.edgeId === edge.id && (Number(vehicle.directionSign) < 0 ? -1 : 1) !== direction
    );
  }

  const api = Object.freeze({ positionAlong, laneOffset, blockedByOpposingTraffic });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysTrafficSpawn = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
