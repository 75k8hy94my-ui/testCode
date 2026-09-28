(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ParkFishingModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BAIT_PACK_COST = 500;
  const BAIT_PACK_SIZE = 5;
  const CAST_DURATION = 25;
  const MAX_SKILL = 100;
  const MAX_CHANCE = 0.95;
  const WINDOWS = [
    { id:'dawn', start:300, end:540, fishType:'crucian', baseChance:0.72 },
    { id:'day', start:540, end:960, fishType:'bluegill', baseChance:0.52 },
    { id:'evening', start:960, end:1200, fishType:'carp', baseChance:0.74 },
    { id:'night', start:1200, end:1440, fishType:'catfish', baseChance:0.36 },
    { id:'night', start:0, end:300, fishType:'catfish', baseChance:0.36 }
  ];

  function safeCount(value) {
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

  function createProgress() {
    return { bait:0, fish:0, skill:0, casts:0, catches:0 };
  }

  function normalizeProgress(value) {
    const source = value && typeof value === 'object' ? value : {};
    const casts = safeCount(source.casts);
    const catches = Math.min(safeCount(source.catches), casts);
    return {
      bait:safeCount(source.bait),
      fish:Math.min(safeCount(source.fish), catches),
      skill:Math.min(MAX_SKILL, safeCount(source.skill)),
      casts,
      catches
    };
  }

  function getFishingWindow(minute) {
    if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) return null;
    const window = WINDOWS.find((candidate) => minute >= candidate.start && minute < candidate.end);
    if (!window) return null;
    return { id:window.id, fishType:window.fishType, baseChance:window.baseChance };
  }

  function biteChance(progress, minute) {
    const window = getFishingWindow(minute);
    if (!window) return null;
    const skill = normalizeProgress(progress).skill;
    return Math.min(MAX_CHANCE, Number((window.baseChance + Math.min(0.20, skill * 0.002)).toFixed(3)));
  }

  function buyBait(progress, cash) {
    const current = normalizeProgress(progress);
    if (!Number.isSafeInteger(cash) || cash < BAIT_PACK_COST) {
      return { ok:false, reason:'insufficient-funds', progress:current };
    }
    if (current.bait > Number.MAX_SAFE_INTEGER - BAIT_PACK_SIZE) {
      return { ok:false, reason:'bait-limit', progress:current };
    }
    return {
      ok:true,
      progress:{ ...current, bait:current.bait + BAIT_PACK_SIZE },
      cashRemaining:cash - BAIT_PACK_COST
    };
  }

  function cast(progress, day, minute, roll) {
    const current = normalizeProgress(progress);
    if (!Number.isSafeInteger(day) || day < 1 || !getFishingWindow(minute)) {
      return { ok:false, reason:'invalid-time', progress:current };
    }
    if (typeof roll !== 'number' || !Number.isFinite(roll) || roll < 0 || roll >= 1) {
      return { ok:false, reason:'invalid-roll', progress:current };
    }
    if (current.bait < 1) return { ok:false, reason:'no-bait', progress:current };

    const chance = biteChance(current, minute);
    const caught = roll < chance;
    const next = {
      ...current,
      bait:current.bait - 1,
      fish:current.fish + (caught ? 1 : 0),
      skill:Math.min(MAX_SKILL, current.skill + (caught ? 2 : 1)),
      casts:current.casts + 1,
      catches:current.catches + (caught ? 1 : 0)
    };
    return {
      ok:true,
      progress:normalizeProgress(next),
      caught,
      fishType:caught ? getFishingWindow(minute).fishType : null,
      chance,
      duration:CAST_DURATION
    };
  }

  return { BAIT_PACK_COST, BAIT_PACK_SIZE, CAST_DURATION, createProgress, normalizeProgress, getFishingWindow, biteChance, buyBait, cast };
});
