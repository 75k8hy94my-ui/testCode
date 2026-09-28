(function initCityDaysPublicBath(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysPublicBath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPublicBathApi() {
  "use strict";

  const OPEN_MINUTE = 360;
  const CLOSE_MINUTE = 1380;
  const OPTIONS = Object.freeze([
    Object.freeze({ id:"bath", name:"お風呂に入る", duration:45, cost:520, effects:Object.freeze({ hygiene:100, energy:6, fun:16, social:6, hunger:0 }) }),
    Object.freeze({ id:"sauna", name:"お風呂とサウナ", duration:60, cost:800, minimumEnergy:35, minimumHunger:20, effects:Object.freeze({ hygiene:100, energy:2, fun:24, social:10, hunger:-5 }) })
  ]);

  function availability(optionId, context) {
    const option = OPTIONS.find((value) => value.id === optionId);
    if (!option) return { option:null, available:false, reason:"unknown-option" };
    const minute = Number(context?.minute);
    if (!Number.isFinite(minute) || minute < OPEN_MINUTE || minute >= CLOSE_MINUTE) {
      return { option, available:false, reason:"not-open" };
    }
    if (minute + option.duration > CLOSE_MINUTE) return { option, available:false, reason:"closing-time" };
    if (!Number.isFinite(Number(context?.cash)) || Number(context.cash) < option.cost) {
      return { option, available:false, reason:"insufficient-funds" };
    }
    if (option.minimumEnergy !== undefined && (!Number.isFinite(Number(context?.energy)) || Number(context.energy) < option.minimumEnergy)) {
      return { option, available:false, reason:"too-tired" };
    }
    if (option.minimumHunger !== undefined && (!Number.isFinite(Number(context?.hunger)) || Number(context.hunger) < option.minimumHunger)) {
      return { option, available:false, reason:"too-hungry" };
    }
    return { option, available:true, reason:null };
  }

  function listOptions(context) {
    return OPTIONS.map((option) => {
      const status = availability(option.id, context);
      return { ...option, effects:{ ...option.effects }, available:status.available, reason:status.reason };
    });
  }

  function completeBath(context, optionId) {
    const status = availability(optionId, context);
    if (!status.available) return { ok:false, reason:status.reason };
    return {
      ok:true,
      optionId,
      duration:status.option.duration,
      cost:status.option.cost,
      effects:{ ...status.option.effects }
    };
  }

  return Object.freeze({ OPTIONS, listOptions, completeBath });
});
