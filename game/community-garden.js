(function initCommunityGarden(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommunityGarden = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCommunityGarden() {
  'use strict';

  const PLOT_COUNT = 3;
  const SEED_PACK_COST = 600;
  const SEEDS_PER_PACK = 3;
  const MOISTURE_MINUTES = 120;
  const CROPS = Object.freeze({
    radish: Object.freeze({ id:'radish', name:'大根', growthMinutes:180, yield:3 }),
    tomato: Object.freeze({ id:'tomato', name:'トマト', growthMinutes:360, yield:5 }),
    'sweet-potato': Object.freeze({ id:'sweet-potato', name:'さつまいも', growthMinutes:540, yield:8 })
  });
  const safeMinute = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const emptyPlot = (id) => ({ id, cropId:null, growthMinutes:0, lastUpdatedAt:0, wateredUntil:0 });

  function createProgress() {
    return { seeds:0, plots:Array.from({ length:PLOT_COUNT }, (_, id) => emptyPlot(id)) };
  }

  function normalizeProgress(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return createProgress();
    const seeds = Number.isFinite(value.seeds) ? Math.min(999, Math.max(0, Math.floor(value.seeds))) : 0;
    const source = Array.isArray(value.plots) ? value.plots : [];
    const plots = Array.from({ length:PLOT_COUNT }, (_, id) => {
      const raw = source[id];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !CROPS[raw.cropId]) return emptyPlot(id);
      const crop = CROPS[raw.cropId];
      return {
        id,
        cropId:crop.id,
        growthMinutes:Math.min(crop.growthMinutes, safeMinute(raw.growthMinutes)),
        lastUpdatedAt:safeMinute(raw.lastUpdatedAt),
        wateredUntil:safeMinute(raw.wateredUntil)
      };
    });
    return { seeds, plots };
  }

  function absoluteMinute(day, minute) {
    if (!Number.isSafeInteger(day) || day < 1 || !Number.isSafeInteger(minute) || minute < 0 || minute >= 1440) return 0;
    return (day - 1) * 1440 + minute;
  }

  function advance(value, now) {
    const progress = normalizeProgress(value);
    const requestedNow = safeMinute(now);
    progress.plots = progress.plots.map((plot) => {
      if (!plot.cropId) return plot;
      const effectiveNow = Math.max(plot.lastUpdatedAt, requestedNow);
      const crop = CROPS[plot.cropId];
      const wetFrom = Math.max(plot.lastUpdatedAt, 0);
      const wetTo = Math.min(effectiveNow, plot.wateredUntil);
      const gained = Math.max(0, wetTo - wetFrom);
      return {
        ...plot,
        growthMinutes:Math.min(crop.growthMinutes, plot.growthMinutes + gained),
        lastUpdatedAt:effectiveNow
      };
    });
    return progress;
  }

  function actionFailure(reason, value) {
    return { ok:false, reason, progress:normalizeProgress(value) };
  }

  function buySeedPack(value, cash) {
    const progress = normalizeProgress(value);
    if (!Number.isFinite(cash) || cash < SEED_PACK_COST) return { ok:false, reason:'insufficient-funds', progress };
    progress.seeds = Math.min(999, progress.seeds + SEEDS_PER_PACK);
    return { ok:true, progress, cashRemaining:Math.floor(cash) - SEED_PACK_COST };
  }

  function plant(value, now, cropId) {
    const progress = normalizeProgress(value);
    const crop = CROPS[cropId];
    if (!crop) return { ok:false, reason:'unknown-crop', progress };
    if (progress.seeds < 1) return { ok:false, reason:'no-seeds', progress };
    const plot = progress.plots.find((entry) => entry.cropId === null);
    if (!plot) return { ok:false, reason:'no-empty-plot', progress };
    const timestamp = safeMinute(now);
    progress.seeds -= 1;
    progress.plots[plot.id] = {
      id:plot.id,
      cropId:crop.id,
      growthMinutes:0,
      lastUpdatedAt:timestamp,
      wateredUntil:timestamp + MOISTURE_MINUTES
    };
    return { ok:true, progress, plotId:plot.id };
  }

  function water(value, now, plotId) {
    const original = normalizeProgress(value);
    const plot = original.plots.find((entry) => entry.id === plotId);
    if (!plot || !plot.cropId) return actionFailure('empty-plot', original);
    const timestamp = Math.max(plot.lastUpdatedAt, safeMinute(now));
    if (timestamp < plot.wateredUntil && plot.growthMinutes < CROPS[plot.cropId].growthMinutes) return actionFailure('still-wet', original);
    const progress = advance(original, timestamp);
    const target = progress.plots[plotId];
    if (target.growthMinutes >= CROPS[target.cropId].growthMinutes) return actionFailure('already-ready', original);
    progress.plots[plotId] = { ...target, lastUpdatedAt:timestamp, wateredUntil:timestamp + MOISTURE_MINUTES };
    return { ok:true, progress, plotId };
  }

  function harvest(value, now, plotId) {
    const original = normalizeProgress(value);
    const plot = original.plots.find((entry) => entry.id === plotId);
    if (!plot || !plot.cropId) return actionFailure('empty-plot', original);
    const progress = advance(original, now);
    const target = progress.plots[plotId];
    const crop = CROPS[target.cropId];
    if (target.growthMinutes < crop.growthMinutes) return actionFailure('not-ready', original);
    progress.plots[plotId] = emptyPlot(plotId);
    return { ok:true, progress, cropId:crop.id, yield:crop.yield };
  }

  function listPlotStatuses(value, now) {
    const progress = advance(value, now);
    return progress.plots.map((plot) => {
      if (!plot.cropId) return { ...plot, status:'empty', remainingGrowth:0, wetRemaining:0, yield:0 };
      const crop = CROPS[plot.cropId];
      const ready = plot.growthMinutes >= crop.growthMinutes;
      return {
        ...plot,
        status:ready ? 'ready' : 'growing',
        remainingGrowth:Math.max(0, crop.growthMinutes - plot.growthMinutes),
        wetRemaining:Math.max(0, plot.wateredUntil - Math.max(plot.lastUpdatedAt, safeMinute(now))),
        yield:crop.yield
      };
    });
  }

  return Object.freeze({
    CROPS, PLOT_COUNT, SEED_PACK_COST, SEEDS_PER_PACK, MOISTURE_MINUTES,
    createProgress, normalizeProgress, absoluteMinute, advance, buySeedPack,
    plant, water, harvest, listPlotStatuses
  });
});
