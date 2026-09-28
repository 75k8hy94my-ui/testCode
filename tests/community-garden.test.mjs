import test from 'node:test';
import assert from 'node:assert/strict';
import garden from '../game/community-garden.js';

test('a ¥600 seed pack adds three seeds and cannot be bought without funds', () => {
  assert.deepEqual(garden.buySeedPack(garden.createProgress(), 600), {
    ok:true,
    progress:{ seeds:3, plots:garden.createProgress().plots },
    cashRemaining:0
  });
  const original = garden.createProgress();
  assert.deepEqual(garden.buySeedPack(original, 599), { ok:false, reason:'insufficient-funds', progress:original });
  assert.equal(original.seeds, 0);
});

test('seed pack award does not silently stop at an arbitrary inventory cap', () => {
  const starting = { seeds:998, plots:garden.createProgress().plots };
  const result = garden.buySeedPack(starting, 600);
  assert.equal(result.ok, true);
  assert.equal(result.progress.seeds, 1001);
  assert.equal(result.cashRemaining, 0);
});

test('seed pack is rejected without charge if the safe integer limit would be exceeded', () => {
  const starting = { seeds:Number.MAX_SAFE_INTEGER - 2, plots:garden.createProgress().plots };
  const result = garden.buySeedPack(starting, 600);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'seed-limit');
  assert.equal(result.progress.seeds, Number.MAX_SAFE_INTEGER - 2);
});

test('radish, tomato, and sweet potato mature at their moist-time thresholds and yield groceries', () => {
  const cases = [
    ['radish', 180, 3],
    ['tomato', 360, 5],
    ['sweet-potato', 540, 8]
  ];
  for (const [cropId, minutes, yieldCount] of cases) {
    let progress = { seeds:1, plots:garden.createProgress().plots };
    let now = 100;
    progress = garden.plant(progress, now, cropId).progress;
    while (garden.advance(progress, now).plots[0].growthMinutes + (progress.plots[0].wateredUntil - now) < minutes) {
      now = progress.plots[0].wateredUntil;
      progress = garden.water(progress, now, 0).progress;
    }
    const finalWetMinute = now + (minutes - garden.advance(progress, now).plots[0].growthMinutes);
    assert.equal(garden.listPlotStatuses(progress, finalWetMinute - 1)[0].status, 'growing');
    assert.equal(garden.listPlotStatuses(progress, finalWetMinute)[0].status, 'ready');
    const harvested = garden.harvest(progress, finalWetMinute, 0);
    assert.equal(harvested.ok, true);
    assert.equal(harvested.yield, yieldCount);
    assert.equal(harvested.cropId, cropId);
    assert.equal(harvested.progress.plots[0].cropId, null);
  }
});

test('growth stops exactly when moisture expires and resumes after watering', () => {
  let progress = garden.plant({ seeds:1, plots:garden.createProgress().plots }, 0, 'radish').progress;
  progress = garden.advance(progress, 120);
  assert.equal(progress.plots[0].growthMinutes, 120);
  progress = garden.advance(progress, 240);
  assert.equal(progress.plots[0].growthMinutes, 120);
  const watered = garden.water(progress, 240, 0);
  assert.equal(watered.ok, true);
  progress = garden.advance(watered.progress, 300);
  assert.equal(progress.plots[0].growthMinutes, 180);
  assert.equal(garden.listPlotStatuses(progress, 300)[0].status, 'ready');
});

test('cannot harvest an immature crop or water a bed that is still wet', () => {
  const progress = garden.plant({ seeds:1, plots:garden.createProgress().plots }, 50, 'tomato').progress;
  assert.deepEqual(garden.harvest(progress, 100, 0), { ok:false, reason:'not-ready', progress });
  assert.deepEqual(garden.water(progress, 100, 0), { ok:false, reason:'still-wet', progress });
});

test('absolute time is continuous across midnight and week boundaries', () => {
  assert.equal(garden.absoluteMinute(2, 0), 1440);
  assert.equal(garden.absoluteMinute(8, 15), 10095);
});

test('malformed progress normalizes to exactly three safe plots and bounded seeds', () => {
  const progress = garden.normalizeProgress({
    seeds:-20,
    plots:[{ id:'bad', cropId:'intruder', growthMinutes:Infinity, wateredUntil:-1 }]
  });
  assert.equal(progress.seeds, 0);
  assert.equal(progress.plots.length, 3);
  assert.deepEqual(progress.plots.map((plot) => plot.cropId), [null, null, null]);
  assert.deepEqual(garden.normalizeProgress(null), garden.createProgress());
});

test('backward time cannot subtract growth or extend moisture', () => {
  let progress = garden.plant({ seeds:1, plots:garden.createProgress().plots }, 200, 'radish').progress;
  progress = garden.advance(progress, 230);
  const rolledBack = garden.advance(progress, 210);
  assert.equal(rolledBack.plots[0].growthMinutes, 30);
  assert.equal(rolledBack.plots[0].lastUpdatedAt, 230);
  assert.equal(garden.listPlotStatuses(rolledBack, 210)[0].wetRemaining, 90);
});

test('rejected planting, watering, harvesting, and purchases preserve normalized progress', () => {
  const progress = garden.createProgress();
  assert.deepEqual(garden.plant(progress, 0, 'radish'), { ok:false, reason:'no-seeds', progress });
  assert.deepEqual(garden.plant(progress, 0, 'unknown'), { ok:false, reason:'unknown-crop', progress });
  assert.deepEqual(garden.water(progress, 0, 99), { ok:false, reason:'empty-plot', progress });
  assert.deepEqual(garden.harvest(progress, 0, 99), { ok:false, reason:'empty-plot', progress });
  assert.deepEqual(garden.buySeedPack(progress, 0), { ok:false, reason:'insufficient-funds', progress });
});
