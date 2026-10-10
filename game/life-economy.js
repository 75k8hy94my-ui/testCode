(function initCityDaysLifeEconomy(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysLifeEconomy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLifeEconomy() {
  "use strict";

  const GRACE_DAYS = 14;

  function createProgress() {
    return { arrears:0, graceEndsDay:null };
  }

  function normalize(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return createProgress();
    const arrears = Number.isFinite(Number(value.arrears)) ? Math.max(0, Math.floor(Number(value.arrears))) : 0;
    const graceEndsDay = arrears > 0 && Number.isSafeInteger(value.graceEndsDay) && value.graceEndsDay >= 1
      ? value.graceEndsDay
      : arrears > 0 ? null : null;
    return { arrears, graceEndsDay };
  }

  function migrateLegacyCash(cash, day) {
    const balance = Number.isFinite(Number(cash)) ? Math.floor(Number(cash)) : 0;
    if (balance >= 0) return { cash:balance, progress:createProgress() };
    const currentDay = Number.isSafeInteger(day) && day >= 1 ? day : 1;
    return {
      cash:0,
      progress:{ arrears:Math.min(Number.MAX_SAFE_INTEGER, Math.abs(balance)), graceEndsDay:currentDay + GRACE_DAYS }
    };
  }

  function status(value, day) {
    const progress = normalize(value);
    if (progress.arrears <= 0) return "clear";
    const currentDay = Number.isSafeInteger(day) && day >= 1 ? day : 1;
    return progress.graceEndsDay == null || currentDay <= progress.graceEndsDay ? "grace" : "overdue";
  }

  function chargeRent(cash, rent, value, day) {
    const progress = normalize(value);
    const availableCash = Number.isFinite(Number(cash)) ? Math.max(0, Math.floor(Number(cash))) : 0;
    const currentRent = Number.isFinite(Number(rent)) ? Math.max(0, Math.floor(Number(rent))) : 0;
    const totalDue = currentRent + progress.arrears;
    const paid = Math.min(availableCash, totalDue);
    const arrears = totalDue - paid;
    const dueDay = Number.isSafeInteger(day) && day >= 1 ? day : 1;
    const graceEndsDay = arrears > 0
      ? progress.arrears > 0 ? progress.graceEndsDay : dueDay + GRACE_DAYS
      : null;
    const nextProgress = { arrears, graceEndsDay };
    return {
      cashRemaining:availableCash - paid,
      paid,
      progress:nextProgress,
      status:arrears > 0 ? status(nextProgress, dueDay) : "paid"
    };
  }

  function payArrears(value, cash, requestedAmount) {
    const progress = normalize(value);
    const availableCash = Number.isFinite(Number(cash)) ? Math.max(0, Math.floor(Number(cash))) : 0;
    if (progress.arrears <= 0) return { ok:false, reason:"no-arrears", paid:0, cashRemaining:availableCash, progress };
    if (availableCash <= 0) return { ok:false, reason:"insufficient-funds", paid:0, cashRemaining:availableCash, progress };
    const requested = requestedAmount == null
      ? progress.arrears
      : Number.isFinite(Number(requestedAmount)) ? Math.max(0, Math.floor(Number(requestedAmount))) : 0;
    const paid = Math.min(progress.arrears, availableCash, requested);
    if (paid <= 0) return { ok:false, reason:"invalid-amount", paid:0, cashRemaining:availableCash, progress };
    const arrears = progress.arrears - paid;
    return {
      ok:true,
      paid,
      cashRemaining:availableCash - paid,
      progress:{ arrears, graceEndsDay:arrears > 0 ? progress.graceEndsDay : null }
    };
  }

  return Object.freeze({ GRACE_DAYS, createProgress, normalize, migrateLegacyCash, status, chargeRent, payArrears });
});
