import test from 'node:test';
import assert from 'node:assert/strict';
import wardrobe from '../game/wardrobe.js';

test('a new wardrobe starts with only the everyday look owned and equipped', () => {
  assert.deepEqual(wardrobe.createWardrobe(), {
    ownedOutfitIds:['everyday'],
    equippedOutfitId:'everyday',
    cleanlinessByOutfitId:{ everyday:100 }
  });
});

test('wardrobe normalization removes unknown and repeated outfits and repairs an unowned selection', () => {
  assert.deepEqual(wardrobe.normalizeWardrobe({
    ownedOutfitIds:['linen-weekend','invented','linen-weekend','active-set',null],
    equippedOutfitId:'city-jacket'
  }), {
    ownedOutfitIds:['everyday','linen-weekend','active-set'],
    equippedOutfitId:'everyday',
    cleanlinessByOutfitId:{ everyday:100, 'linen-weekend':100, 'active-set':100 }
  });
  assert.deepEqual(wardrobe.normalizeWardrobe({ ownedOutfitIds:[], equippedOutfitId:'everyday' }), {
    ownedOutfitIds:['everyday'], equippedOutfitId:'everyday', cleanlinessByOutfitId:{ everyday:100 }
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
    equippedOutfitId:'everyday',
    cleanlinessByOutfitId:{ everyday:100, 'linen-weekend':100 }
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
    assert.deepEqual(result.wardrobe, wardrobe.normalizeWardrobe(start));
    assert.equal(Object.hasOwn(result, 'cashRemaining'), false);
  }
  assert.deepEqual(start, { ownedOutfitIds:['everyday','active-set'], equippedOutfitId:'active-set' });
});

test('only owned catalog outfits can be equipped and successful changes take five minutes', () => {
  const start = { ownedOutfitIds:['everyday','city-jacket'], equippedOutfitId:'everyday' };
  const equipped = wardrobe.equipOutfit(start, 'city-jacket');
  assert.equal(equipped.ok, true);
  assert.deepEqual(equipped.wardrobe, { ownedOutfitIds:['everyday','city-jacket'], equippedOutfitId:'city-jacket', cleanlinessByOutfitId:{ everyday:100, 'city-jacket':100 } });
  assert.equal(equipped.duration, 5);
  assert.deepEqual(wardrobe.equipOutfit(start, 'sakura-knit'), { ok:false, reason:'not-owned', wardrobe:wardrobe.normalizeWardrobe(start) });
  assert.deepEqual(wardrobe.equipOutfit(start, 'invented'), { ok:false, reason:'unknown-outfit', wardrobe:wardrobe.normalizeWardrobe(start) });
  assert.deepEqual(wardrobe.equipOutfit(start, 'everyday'), { ok:false, reason:'already-equipped', wardrobe:wardrobe.normalizeWardrobe(start) });
});

test('elapsed wear soils only the equipped outfit and clamps at zero without mutation', () => {
  const start = wardrobe.normalizeWardrobe({
    ownedOutfitIds:['everyday','city-jacket'], equippedOutfitId:'city-jacket',
    cleanlinessByOutfitId:{ everyday:63, 'city-jacket':50 }
  });
  const worn = wardrobe.advanceWear(start, 125);
  assert.deepEqual(worn.cleanlinessByOutfitId, { everyday:63, 'city-jacket':40 });
  assert.equal(wardrobe.advanceWear(start, 10000).cleanlinessByOutfitId['city-jacket'], 0);
  assert.equal(start.cleanlinessByOutfitId['city-jacket'], 50);
  assert.deepEqual(wardrobe.advanceWear(start, Infinity), start);
});

test('cleanliness normalization defaults legacy outfits and rejects invalid, unknown and unowned records', () => {
  assert.deepEqual(wardrobe.normalizeWardrobe({
    ownedOutfitIds:['everyday','active-set','linen-weekend'], equippedOutfitId:'active-set',
    cleanlinessByOutfitId:{ everyday:Infinity, 'active-set':-4, 'linen-weekend':130, intruder:2 }
  }), {
    ownedOutfitIds:['everyday','linen-weekend','active-set'], equippedOutfitId:'active-set',
    cleanlinessByOutfitId:{ everyday:100, 'linen-weekend':100, 'active-set':0 }
  });
});

test('laundering validates business hours, closing time, balance and already-clean outfits', () => {
  const dirty = wardrobe.normalizeWardrobe({ cleanlinessByOutfitId:{ everyday:72.25 } });
  const success = wardrobe.launder(dirty, 500, 22 * 60 + 30);
  assert.deepEqual(success, {
    ok:true, wardrobe:{ ...dirty, cleanlinessByOutfitId:{ everyday:100 } }, cashRemaining:200, duration:30, cost:300
  });
  assert.equal(wardrobe.launder(dirty, 500, 22 * 60 + 31).reason, 'closing-time');
  assert.equal(wardrobe.launder(dirty, 500, 5 * 60 + 59).reason, 'not-open');
  assert.equal(wardrobe.launder(dirty, 299, 12 * 60).reason, 'insufficient-funds');
  assert.equal(wardrobe.launder(wardrobe.createWardrobe(), 500, 12 * 60).reason, 'already-clean');
  assert.equal(dirty.cleanlinessByOutfitId.everyday, 72.25);
});

test('cleanliness labels use readable text thresholds and reject corrupted values safely', () => {
  assert.deepEqual([100,89.9,60,59.9,0,NaN].map((value) => wardrobe.getCleanlinessLabel(value)), [
    '清潔','少し汚れています','少し汚れています','洗濯推奨','洗濯推奨','清潔'
  ]);
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
