(function initCityDaysVehicleProgression(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysVehicleProgression = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createVehicleProgression() {
  "use strict";

  const USED_CAR_PRICE = 10000;

  function createNewGame() {
    return { owned:false };
  }

  function normalize(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { owned:true };
    return { owned:typeof value.owned === "boolean" ? value.owned : true };
  }

  function purchase(value, cash) {
    const progress = normalize(value);
    const availableCash = Number(cash);
    if (progress.owned) return { ok:false, reason:"already-owned", progress, cashRemaining:Number.isFinite(availableCash) ? Math.floor(availableCash) : 0 };
    if (!Number.isFinite(availableCash) || availableCash < USED_CAR_PRICE) {
      return { ok:false, reason:"insufficient-funds", progress, cashRemaining:Number.isFinite(availableCash) ? Math.floor(availableCash) : 0 };
    }
    return { ok:true, progress:{ owned:true }, cashRemaining:Math.floor(availableCash - USED_CAR_PRICE) };
  }

  return Object.freeze({ USED_CAR_PRICE, createNewGame, normalize, purchase });
});
