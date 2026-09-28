(function initCityDaysCarFuel(global) {
  "use strict";

  const CAPACITY_LITERS = 40;
  const PRICE_PER_LITER = 150;
  const INITIAL_FUEL_LITERS = 12;
  const CAN_CAPACITY_LITERS = 5;
  const CAN_PRICE = 1200;
  const roundLiters = (value) => Math.round(value * 1000000) / 1000000;

  function normalizeFuel(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return INITIAL_FUEL_LITERS;
    return roundLiters(Math.max(0, Math.min(CAPACITY_LITERS, numeric)));
  }

  function consumeFuel(fuel, distance) {
    const current = normalizeFuel(fuel);
    const traveled = Number.isFinite(Number(distance)) ? Math.max(0, Number(distance)) : 0;
    const consumed = roundLiters(Math.min(current, traveled / 1000));
    return { fuel:roundLiters(Math.max(0, current - consumed)), consumed };
  }

  function refuel(fuel, amount, cash) {
    const current = normalizeFuel(fuel);
    const requested = Number(amount);
    const availableCash = Number(cash);
    if (!Number.isFinite(requested) || requested <= 0) return { ok:false, reason:"invalid-amount" };
    if (current >= CAPACITY_LITERS) return { ok:false, reason:"tank-full" };
    const liters = roundLiters(Math.min(requested, CAPACITY_LITERS - current));
    const cost = Math.ceil(liters * PRICE_PER_LITER);
    if (!Number.isFinite(availableCash) || availableCash < cost) return { ok:false, reason:"insufficient-funds" };
    return {
      ok:true,
      fuel:roundLiters(current + liters),
      liters,
      cost,
      cashRemaining:Math.floor(availableCash - cost)
    };
  }

  function buyCan(count, cash) {
    const owned = Math.max(0, Math.floor(Number(count) || 0));
    const availableCash = Number(cash);
    if (owned >= 1) return { ok:false, reason:"can-already-owned" };
    if (!Number.isFinite(availableCash) || availableCash < CAN_PRICE) return { ok:false, reason:"insufficient-funds" };
    return { ok:true, count:1, cashRemaining:Math.floor(availableCash - CAN_PRICE) };
  }

  function useCan(fuel, count) {
    const current = normalizeFuel(fuel);
    if (Math.floor(Number(count) || 0) < 1) return { ok:false, reason:"no-can" };
    if (current >= CAPACITY_LITERS) return { ok:false, reason:"tank-full" };
    const liters = roundLiters(Math.min(CAN_CAPACITY_LITERS, CAPACITY_LITERS - current));
    return { ok:true, fuel:roundLiters(current + liters), liters, count:0 };
  }

  const api = Object.freeze({
    CAPACITY_LITERS,
    PRICE_PER_LITER,
    INITIAL_FUEL_LITERS,
    CAN_CAPACITY_LITERS,
    CAN_PRICE,
    normalizeFuel,
    consumeFuel,
    refuel,
    buyCan,
    useCan
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysCarFuel = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
