import test from 'node:test';
import assert from 'node:assert/strict';
import furniture from '../game/home-furniture.js';

test('buying furniture charges the listed price once and leaves failed purchases unchanged', () => {
  const initial = furniture.createProgress();
  assert.deepEqual(initial, { inventory:{}, placements:[], nextPlacementNumber:1 });

  const bought = furniture.buyFurniture(initial, 2000, 'bookshelf');
  assert.equal(bought.ok, true);
  assert.deepEqual(bought.progress, { inventory:{ bookshelf:1 }, placements:[], nextPlacementNumber:1 });
  assert.equal(bought.cashRemaining, 500);
  assert.equal(bought.duration, 5);
  assert.deepEqual(initial, { inventory:{}, placements:[], nextPlacementNumber:1 });

  assert.deepEqual(furniture.buyFurniture(initial, 1499, 'bookshelf'), {
    ok:false, reason:'insufficient-funds', progress:initial
  });
  assert.deepEqual(furniture.buyFurniture(initial, 8000, 'unknown-chair'), {
    ok:false, reason:'unknown-furniture', progress:initial
  });
  assert.deepEqual(furniture.buyFurniture({ inventory:{ bookshelf:12 }, placements:[], nextPlacementNumber:1 }, 8000, 'bookshelf'), {
    ok:false, reason:'inventory-capacity', progress:{ inventory:{ bookshelf:12 }, placements:[], nextPlacementNumber:1 }
  });
});

test('normalization rejects malformed inventory and placements without accepting duplicate identities', () => {
  const normalized = furniture.normalizeProgress({
    inventory:{ bookshelf:99, kotatsu:-3, plant:'bad', ghost:4 },
    placements:[
      { placementId:'furniture-2', furnitureId:'bookshelf', gridX:4, gridY:5, rotation:0 },
      { placementId:'furniture-2', furnitureId:'kotatsu', gridX:7, gridY:5, rotation:90 },
      { placementId:'furniture-3', furnitureId:'ghost', gridX:2, gridY:2, rotation:0 },
      { placementId:'furniture-4', furnitureId:'plant', gridX:2.5, gridY:2, rotation:0 },
      { placementId:'furniture-5', furnitureId:'plant', gridX:2, gridY:2, rotation:45 }
    ],
    nextPlacementNumber:1
  });

  assert.deepEqual(normalized, {
    inventory:{ bookshelf:12, plant:2 },
    placements:[{ placementId:'furniture-2', furnitureId:'bookshelf', gridX:4, gridY:5, rotation:0 }],
    nextPlacementNumber:6
  });
  assert.equal(furniture.normalizeProgress(null).placements.length, 0);
});

test('placement consumes one owned item, movement and rotation preserve identity, and pickup restores it', () => {
  const boughtTwice = furniture.buyFurniture(furniture.createProgress(), 4000, 'bookshelf').progress;
  const boughtOnceMore = furniture.buyFurniture(boughtTwice, 2500, 'bookshelf').progress;
  const placed = furniture.placeFurniture(boughtOnceMore, 'bookshelf', 5, 6, 0);
  assert.equal(placed.ok, true);
  assert.deepEqual(placed.placement, {
    placementId:'furniture-1', furnitureId:'bookshelf', gridX:5, gridY:6, rotation:0
  });
  assert.deepEqual(placed.progress, {
    inventory:{ bookshelf:1 },
    placements:[{ placementId:'furniture-1', furnitureId:'bookshelf', gridX:5, gridY:6, rotation:0 }],
    nextPlacementNumber:2
  });

  const moved = furniture.moveFurniture(placed.progress, 'furniture-1', 7, 8, 180);
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.progress.placements[0], {
    placementId:'furniture-1', furnitureId:'bookshelf', gridX:7, gridY:8, rotation:180
  });
  const rotated = furniture.rotateFurniture(moved.progress, 'furniture-1');
  assert.equal(rotated.progress.placements[0].rotation, 270);
  const pickedUp = furniture.pickupFurniture(rotated.progress, 'furniture-1');
  assert.equal(pickedUp.ok, true);
  assert.deepEqual(pickedUp.progress, { inventory:{ bookshelf:2 }, placements:[], nextPlacementNumber:2 });
  assert.deepEqual(placed.progress.placements[0], {
    placementId:'furniture-1', furnitureId:'bookshelf', gridX:5, gridY:6, rotation:0
  });
});

test('placement and pickup reject missing items, malformed coordinates, capacity, and unknown placements', () => {
  const empty = furniture.createProgress();
  assert.equal(furniture.placeFurniture(empty, 'plant', 2, 2, 0).reason, 'not-owned');
  const onePlant = furniture.buyFurniture(empty, 1000, 'plant').progress;
  assert.equal(furniture.placeFurniture(onePlant, 'plant', 1.5, 2, 0).reason, 'invalid-placement');
  assert.equal(furniture.placeFurniture(onePlant, 'plant', 2, 2, 45).reason, 'invalid-placement');
  assert.equal(furniture.moveFurniture(onePlant, 'missing', 2, 2, 0).reason, 'unknown-placement');
  assert.equal(furniture.pickupFurniture(onePlant, 'missing').reason, 'unknown-placement');

  const full = {
    inventory:{},
    placements:Array.from({ length:12 }, (_, index) => ({
      placementId:'furniture-' + (index + 1), furnitureId:'plant', gridX:index + 2, gridY:2, rotation:0
    })),
    nextPlacementNumber:13
  };
  assert.equal(furniture.placeFurniture({ ...full, inventory:{ plant:1 } }, 'plant', 20, 2, 0).reason, 'placement-capacity');
  assert.equal(furniture.pickupFurniture({ ...full, inventory:{ plant:12 } }, 'furniture-1').reason, 'inventory-capacity');
});

test('furniture actions and footprints expose the authored household effects', () => {
  assert.deepEqual(furniture.getUseAction('bookshelf'), {
    id:'read', name:'読書', duration:35, needs:{ fun:12, energy:-7 }
  });
  assert.deepEqual(furniture.getUseAction('kotatsu'), {
    id:'rest', name:'こたつで休む', duration:30, needs:{ energy:14, fun:8 }
  });
  assert.deepEqual(furniture.getUseAction('plant'), {
    id:'care', name:'植物の手入れ', duration:10, needs:{ fun:4 }
  });
  assert.equal(furniture.getUseAction('missing'), null);
  assert.deepEqual(furniture.CATALOG.map(({ id, widthCells, heightCells, price, purchaseMinutes }) => ({ id, widthCells, heightCells, price, purchaseMinutes })), [
    { id:'bookshelf', widthCells:2, heightCells:2, price:1500, purchaseMinutes:5 },
    { id:'kotatsu', widthCells:3, heightCells:2, price:2400, purchaseMinutes:5 },
    { id:'plant', widthCells:1, heightCells:1, price:900, purchaseMinutes:5 }
  ]);
});

test('the furniture model loads before the game runtime', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../game/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('home-furniture.js') >= 0);
  assert.ok(html.indexOf('home-furniture.js') < html.indexOf('game.js'));
});
