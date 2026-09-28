(function initCityDaysTrafficOvertakeSafety(global) {
  "use strict";

  function conflictsWithOncoming({
    startDistance,
    endDistance,
    planningSpeed,
    vehicleDistance,
    vehicleSpeed,
    vehicleCruiseSpeed,
    vehicleHalfLength = 0,
    clearanceMargin = 28
  } = {}) {
    const clearance = Math.max(0,vehicleHalfLength) + Math.max(0,clearanceMargin);
    if (!Number.isFinite(vehicleDistance) || vehicleDistance < -clearance) return false;
    const predictedVehicleSpeed = Number.isFinite(vehicleSpeed)
      ? Math.max(0,vehicleSpeed,Number.isFinite(vehicleCruiseSpeed) ? vehicleCruiseSpeed : 0)
      : 0;
    if (!Number.isFinite(planningSpeed) || planningSpeed <= 0 || predictedVehicleSpeed <= 0) {
      return vehicleDistance + clearance >= startDistance &&
        vehicleDistance - clearance <= endDistance;
    }

    const closingSpeed = planningSpeed + predictedVehicleSpeed;
    const gapAtStart = vehicleDistance - closingSpeed * startDistance / planningSpeed;
    const gapAtEnd = vehicleDistance - closingSpeed * endDistance / planningSpeed;
    return gapAtStart >= -clearance && gapAtEnd <= clearance;
  }

  const api = Object.freeze({ conflictsWithOncoming });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysTrafficOvertakeSafety = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
