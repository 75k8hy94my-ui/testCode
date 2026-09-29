import test from 'node:test';
import assert from 'node:assert/strict';
import socialNpcs from '../game/social-npc-system.js';
import crafting from '../game/home-crafting.js';

test('kit purchase charges the fixed pack price and refuses insufficient funds or kit overflow', () => {
  const empty = crafting.createProgress();
  const bought = crafting.buyKitPack(empty, 1000);
  assert.equal(bought.ok, true);
  assert.equal(bought.progress.kits, 3);
  assert.equal(bought.cashRemaining, 100);
  assert.equal(bought.duration, 10);
  assert.deepEqual(crafting.buyKitPack(empty, 899), { ok:false, reason:'insufficient-funds', progress:empty });
  const nearlyFull = { kits:29, items:{}, lastGiftDayByNpc:{} };
  assert.deepEqual(crafting.buyKitPack(nearlyFull, 1200), { ok:false, reason:'kit-capacity', progress:nearlyFull });
  assert.deepEqual(empty, { kits:0, items:{}, lastGiftDayByNpc:{} });
});

test('crafting enforces skill and kit costs and stores the authored item with bounded skill gain', () => {
  const purchased = crafting.buyKitPack(crafting.createProgress(), 2000).progress;
  assert.deepEqual(crafting.craft(purchased, 'knitted-scarf', 29), { ok:false, reason:'skill-required', progress:purchased });
  assert.deepEqual(crafting.craft(purchased, 'woven-coaster', 10), { ok:true, progress:{ kits:1, items:{ 'woven-coaster':1 }, lastGiftDayByNpc:{} }, recipe:crafting.RECIPES[1], craftSkill:12 });
  const scarce = { kits:1, items:{}, lastGiftDayByNpc:{} };
  assert.deepEqual(crafting.craft(scarce, 'woven-coaster', 10), { ok:false, reason:'insufficient-kits', progress:scarce });
  assert.deepEqual(crafting.craft(purchased, 'unknown-item', 80), { ok:false, reason:'unknown-recipe', progress:purchased });
  assert.deepEqual(purchased, { kits:3, items:{}, lastGiftDayByNpc:{} });
});

test('finished-item inventory caps at twelve and malformed progress cannot mint materials or gifts', () => {
  const full = { kits:4, items:{ 'origami-card':12 }, lastGiftDayByNpc:{} };
  assert.deepEqual(crafting.craft(full, 'origami-card', 100), { ok:false, reason:'item-capacity', progress:full });
  assert.deepEqual(crafting.normalizeProgress({ kits:999, items:{ 'origami-card':999, fake:4, 'woven-coaster':-1 }, lastGiftDayByNpc:{ ghost:999, aoi:0 } }), {
    kits:0, items:{}, lastGiftDayByNpc:{}
  });
  assert.equal(crafting.itemCount({ kits:0, items:{'origami-card':12,'woven-coaster':4} }), 12);
});

test('all authored NPCs have a valid favorite, and liked gifts strengthen their existing bond', () => {
  const ids = socialNpcs.catalog.map((npc) => npc.id).sort();
  assert.deepEqual(Object.keys(crafting.GIFT_PREFERENCES).sort(), ids);
  for (const favorite of Object.values(crafting.GIFT_PREFERENCES)) assert.ok(crafting.RECIPES.some((recipe) => recipe.id === favorite));
  const aoi = crafting.giveGift({ kits:0, items:{'knitted-scarf':1}, lastGiftDayByNpc:{} }, 'aoi', 'knitted-scarf', 4);
  assert.equal(aoi.ok, true);
  assert.equal(aoi.favorite, true);
  assert.equal(aoi.friendshipGain, 8);
  assert.equal(aoi.relationshipAffinityGain, 2);
  assert.equal(aoi.progress.items['knitted-scarf'], undefined);
  assert.equal(aoi.progress.lastGiftDayByNpc.aoi, 4);
  assert.match(aoi.response, /大事にする/);
  const neutral = crafting.giveGift({ kits:0, items:{'origami-card':1}, lastGiftDayByNpc:{} }, 'aoi', 'origami-card', 4);
  assert.equal(neutral.favorite, false);
  assert.equal(neutral.friendshipGain, 4);
  assert.equal(neutral.relationshipAffinityGain, 0);
});

test('a person accepts only one gift per game day and invalid gifts preserve progress', () => {
  const inventory = { kits:0, items:{'origami-card':1,'woven-coaster':1}, lastGiftDayByNpc:{ aoi:8 } };
  assert.deepEqual(crafting.giveGift(inventory, 'aoi', 'woven-coaster', 8), { ok:false, reason:'already-gifted', progress:inventory });
  assert.deepEqual(crafting.giveGift(inventory, 'not-a-person', 'origami-card', 9), { ok:false, reason:'unknown-recipient', progress:inventory });
  assert.deepEqual(crafting.giveGift(inventory, 'mei', 'knitted-scarf', 9), { ok:false, reason:'no-item', progress:inventory });
  assert.deepEqual(crafting.giveGift(inventory, 'mei', 'woven-coaster', 0), { ok:false, reason:'invalid-day', progress:inventory });
  assert.deepEqual(inventory, { kits:0, items:{'origami-card':1,'woven-coaster':1}, lastGiftDayByNpc:{ aoi:8 } });
});
