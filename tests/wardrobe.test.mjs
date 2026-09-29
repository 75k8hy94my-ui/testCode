import test from 'node:test';
import assert from 'node:assert/strict';
import wardrobe from '../game/wardrobe.js';

test('a new wardrobe starts with only the everyday look owned and equipped', () => {
  assert.deepEqual(wardrobe.createWardrobe(), {
    ownedOutfitIds:['everyday'],
    equippedOutfitId:'everyday'
  });
});

test('wardrobe normalization removes unknown and repeated outfits and repairs an unowned selection', () => {
  assert.deepEqual(wardrobe.normalizeWardrobe({
    ownedOutfitIds:['linen-weekend','invented','linen-weekend','active-set',null],
    equippedOutfitId:'city-jacket'
  }), {
    ownedOutfitIds:['everyday','linen-weekend','active-set'],
    equippedOutfitId:'everyday'
  });
  assert.deepEqual(wardrobe.normalizeWardrobe({ ownedOutfitIds:[], equippedOutfitId:'everyday' }), {
    ownedOutfitIds:['everyday'], equippedOutfitId:'everyday'
  });
});

test('catalog contains the six specified outfits with stable prices and renderer-ready apparel fields', () => {
  assert.deepEqual(wardrobe.CATALOG.map(({ id, price }) => [id, price]), [
    ['everyday',0],
    ['indigo-denim',1200],
    ['linen-weekend',1400],
    ['active-set',1800],
    ['city-jacket',2200],
    ['sakura-knit',2600]
  ]);
  for (const outfit of wardrobe.CATALOG) {
    for (const key of ['top','bottom','accent','topStyle','bottomStyle','bottomGarment','accessory']) {
      assert.ok(Object.hasOwn(outfit, key), `${outfit.id} has ${key}`);
    }
  }
});

test('buying an outfit spends its listed cost and adds it without changing the equipped look', () => {
  const start = wardrobe.createWardrobe();
  const bought = wardrobe.buyOutfit(start, 2000, 'linen-weekend');
  assert.equal(bought.ok, true);
  assert.deepEqual(bought.wardrobe, {
    ownedOutfitIds:['everyday','linen-weekend'],
    equippedOutfitId:'everyday'
  });
  assert.equal(bought.cashRemaining, 600);
  assert.equal(bought.duration, 10);
  assert.equal(start.ownedOutfitIds.includes('linen-weekend'), false);
});

test('duplicate, unknown, and unaffordable purchases preserve normalized ownership and cash', () => {
  const start = { ownedOutfitIds:['everyday','active-set'], equippedOutfitId:'active-set' };
  const duplicate = wardrobe.buyOutfit(start, 5000, 'active-set');
  const unknown = wardrobe.buyOutfit(start, 5000, 'invented');
  const poor = wardrobe.buyOutfit(start, 2199, 'city-jacket');
  assert.deepEqual([duplicate.reason, unknown.reason, poor.reason], ['already-owned','unknown-outfit','insufficient-funds']);
  for (const result of [duplicate, unknown, poor]) {
    assert.equal(result.ok, false);
    assert.deepEqual(result.wardrobe, start);
    assert.equal(Object.hasOwn(result, 'cashRemaining'), false);
  }
  assert.deepEqual(start, { ownedOutfitIds:['everyday','active-set'], equippedOutfitId:'active-set' });
});

test('only owned catalog outfits can be equipped and successful changes take five minutes', () => {
  const start = { ownedOutfitIds:['everyday','city-jacket'], equippedOutfitId:'everyday' };
  const equipped = wardrobe.equipOutfit(start, 'city-jacket');
  assert.equal(equipped.ok, true);
  assert.deepEqual(equipped.wardrobe, { ownedOutfitIds:['everyday','city-jacket'], equippedOutfitId:'city-jacket' });
  assert.equal(equipped.duration, 5);
  assert.deepEqual(wardrobe.equipOutfit(start, 'sakura-knit'), { ok:false, reason:'not-owned', wardrobe:start });
  assert.deepEqual(wardrobe.equipOutfit(start, 'invented'), { ok:false, reason:'unknown-outfit', wardrobe:start });
  assert.deepEqual(wardrobe.equipOutfit(start, 'everyday'), { ok:false, reason:'already-equipped', wardrobe:start });
});

test('wardrobe transitions return copies instead of mutating an existing save object', () => {
  const start = { ownedOutfitIds:['everyday'], equippedOutfitId:'everyday' };
  const serialized = JSON.stringify(start);
  wardrobe.buyOutfit(start, 3000, 'sakura-knit');
  wardrobe.equipOutfit(start, 'active-set');
  wardrobe.normalizeWardrobe(start);
  assert.equal(JSON.stringify(start), serialized);
});

test('outfit lookup rejects unknown IDs without manufacturing visual data', () => {
  assert.equal(wardrobe.getOutfit('unknown'), null);
  assert.equal(wardrobe.getOutfit('indigo-denim').id, 'indigo-denim');
});
