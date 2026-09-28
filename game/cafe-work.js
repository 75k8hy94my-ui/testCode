(function initCityDaysCafeWork(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysCafeWork = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCafeWorkApi() {
  "use strict";

  const OPEN_MINUTE = 7 * 60;
  const CLOSE_MINUTE = 18 * 60;
  const SHIFTS = Object.freeze([
    Object.freeze({ id:"short", name:"短時間シフト", duration:120, minimumExperience:0 }),
    Object.freeze({ id:"regular", name:"通常シフト", duration:240, minimumExperience:0 }),
    Object.freeze({ id:"long", name:"ロングシフト", duration:360, minimumExperience:5 })
  ]);

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function normalizedContext(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      day:Math.max(1, Math.floor(numberOrZero(source.day)) || 1),
      minute:Math.max(0, Math.min(1439.99, numberOrZero(source.minute))),
      lastShiftDay:Math.max(0, Math.floor(numberOrZero(source.lastShiftDay))),
      shiftsWorked:Math.max(0, Math.floor(numberOrZero(source.shiftsWorked))),
      energy:numberOrZero(source.energy),
      hunger:numberOrZero(source.hunger)
    };
  }

  function careerLevel(shiftsWorked) {
    if (shiftsWorked >= 12) return "ベテラン";
    if (shiftsWorked >= 5) return "一人前";
    return "新人";
  }

  function hourlyWage(shiftsWorked) {
    if (shiftsWorked >= 12) return 1400;
    if (shiftsWorked >= 5) return 1300;
    return 1200;
  }

  function reasonFor(shift, context) {
    if (context.lastShiftDay === context.day) return "already-worked";
    if (context.shiftsWorked < shift.minimumExperience) return "experience-required";
    if (context.minute < OPEN_MINUTE) return "too-early";
    if (context.minute + shift.duration > CLOSE_MINUTE) return "closing-time";
    if (context.energy < 20) return "too-tired";
    if (context.hunger < 20) return "too-hungry";
    return null;
  }

  function listShifts(value) {
    const context = normalizedContext(value);
    const rate = hourlyWage(context.shiftsWorked);
    return SHIFTS.map((shift) => {
      const reason = reasonFor(shift, context);
      return {
        shift,
        available:reason === null,
        reason,
        pay:rate * shift.duration / 60
      };
    });
  }

  function completeShift(value, shiftId) {
    const shift = SHIFTS.find((candidate) => candidate.id === shiftId);
    if (!shift) return { ok:false, reason:"unknown-shift" };
    const context = normalizedContext(value);
    const reason = reasonFor(shift, context);
    if (reason) return { ok:false, reason };
    const nextShiftsWorked = context.shiftsWorked + 1;
    return {
      ok:true,
      pay:hourlyWage(context.shiftsWorked) * shift.duration / 60,
      shiftsWorked:nextShiftsWorked,
      careerLevel:careerLevel(nextShiftsWorked)
    };
  }

  return Object.freeze({ SHIFTS, listShifts, completeShift, careerLevel, hourlyWage });
});
