(function initHomeTelevision(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysHomeTelevision = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHomeTelevisionApi() {
  "use strict";

  function makeProgram(id, title, screenTitle, intervals, duration, effects, cookingSkillGain = 0) {
    const frozenIntervals = Object.freeze(intervals.map((interval) => Object.freeze(interval)));
    return Object.freeze({
      id,
      title,
      screenTitle,
      intervals:frozenIntervals,
      duration,
      effects:Object.freeze(effects),
      cookingSkillGain
    });
  }

  const PROGRAMS = Object.freeze([
    makeProgram("overnight-nature", "深夜の自然紀行", "自然紀行", [[0, 300], [1380, 1440]], 50, { fun:14, energy:-5 }),
    makeProgram("morning-news", "朝のニュース", "朝ニュース", [[300, 600]], 35, { fun:8, social:2, energy:-1 }),
    makeProgram("travel-variety", "日本各地の旅", "旅番組", [[600, 960]], 45, { fun:17, energy:-2 }),
    makeProgram("cooking-show", "夕方の料理番組", "料理番組", [[960, 1200]], 40, { fun:12 }, 1),
    makeProgram("prime-time-drama", "夜の連続ドラマ", "連続ドラマ", [[1200, 1380]], 60, { fun:25, energy:-4 })
  ]);

  function getProgram(minute) {
    if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) return null;
    return PROGRAMS.find((program) => program.intervals.some(([start, end]) => minute >= start && minute < end)) || null;
  }

  function watch(minute) {
    const program = getProgram(minute);
    if (!program) return { ok:false, reason:"invalid-time" };
    return {
      ok:true,
      program,
      duration:program.duration,
      effects:{ ...program.effects },
      cookingSkillGain:program.cookingSkillGain
    };
  }

  return Object.freeze({ PROGRAMS, getProgram, watch });
});
