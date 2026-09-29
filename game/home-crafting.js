(function initCityDaysHomeCrafting(root, factory) {
  "use strict";

  const api = factory(root?.CityDaysSocialNpcSystem);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysHomeCrafting = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHomeCraftingApi(socialNpcSystem) {
  "use strict";

  const KIT_PACK_SIZE = 3;
  const KIT_PACK_COST = 900;
  const KIT_PACK_MINUTES = 10;
  const MAX_KITS = 30;
  const MAX_FINISHED_ITEMS = 12;
  const RECIPES = Object.freeze([
    Object.freeze({ id:"origami-card", name:"折り紙カード", minimumSkill:0, kits:1, duration:30, skillGain:1 }),
    Object.freeze({ id:"woven-coaster", name:"織りコースター", minimumSkill:10, kits:2, duration:60, skillGain:2 }),
    Object.freeze({ id:"knitted-scarf", name:"編みマフラー", minimumSkill:30, kits:3, duration:90, skillGain:3 })
  ]);
  const giftPreferences = Object.freeze({
    aoi:"knitted-scarf",
    sora:"woven-coaster",
    mei:"origami-card",
    ren:"woven-coaster",
    yui:"knitted-scarf",
    haru:"origami-card",
    kaori:"woven-coaster",
    daichi:"knitted-scarf",
    nana:"origami-card",
    toma:"woven-coaster"
  });
  const recipeById = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));
  const recipientIds = new Set((Array.isArray(socialNpcSystem?.catalog) ? socialNpcSystem.catalog : []).map((npc) => npc.id));
  const relationshipIds = new Set((Array.isArray(socialNpcSystem?.relationships) ? socialNpcSystem.relationships : []).flatMap((relation) => [relation.aId, relation.bId]));

  function createProgress() {
    return { kits:0, items:{}, lastGiftDayByNpc:{} };
  }

  function normalizeProgress(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawKits = Number(source.kits);
    const kits = Number.isSafeInteger(rawKits) && rawKits >= 0 && rawKits <= MAX_KITS ? rawKits : 0;
    const rawItems = source.items && typeof source.items === "object" ? source.items : {};
    const items = {};
    let remaining = MAX_FINISHED_ITEMS;
    for (const recipe of RECIPES) {
      const count = Number(rawItems[recipe.id]);
      if (!Number.isSafeInteger(count) || count < 0 || count > MAX_FINISHED_ITEMS || count === 0) continue;
      const accepted = Math.min(remaining, count);
      if (accepted) items[recipe.id] = accepted;
      remaining -= accepted;
      if (!remaining) break;
    }
    const rawGiftDays = source.lastGiftDayByNpc && typeof source.lastGiftDayByNpc === "object" ? source.lastGiftDayByNpc : {};
    const lastGiftDayByNpc = {};
    for (const [npcId, valueDay] of Object.entries(rawGiftDays)) {
      const day = Number(valueDay);
      if (recipientIds.has(npcId) && Number.isSafeInteger(day) && day >= 1) lastGiftDayByNpc[npcId] = day;
    }
    return { kits, items, lastGiftDayByNpc };
  }

  function itemCount(value) {
    return Object.values(normalizeProgress(value).items).reduce((sum, count) => sum + count, 0);
  }

  function buyKitPack(value, cash) {
    const progress = normalizeProgress(value);
    if (!Number.isFinite(Number(cash)) || Number(cash) < KIT_PACK_COST) return { ok:false, reason:"insufficient-funds", progress };
    if (progress.kits + KIT_PACK_SIZE > MAX_KITS) return { ok:false, reason:"kit-capacity", progress };
    return {
      ok:true,
      progress:{ ...progress, kits:progress.kits + KIT_PACK_SIZE },
      cashRemaining:Math.floor(Number(cash) - KIT_PACK_COST),
      duration:KIT_PACK_MINUTES
    };
  }

  function craft(value, recipeId, craftSkill) {
    const progress = normalizeProgress(value);
    const recipe = recipeById.get(recipeId);
    if (!recipe) return { ok:false, reason:"unknown-recipe", progress };
    const skill = Number(craftSkill);
    const level = Number.isFinite(skill) ? Math.max(0, Math.min(100, skill)) : 0;
    if (level < recipe.minimumSkill) return { ok:false, reason:"skill-required", progress };
    if (progress.kits < recipe.kits) return { ok:false, reason:"insufficient-kits", progress };
    if (itemCount(progress) >= MAX_FINISHED_ITEMS) return { ok:false, reason:"item-capacity", progress };
    const items = { ...progress.items, [recipe.id]:(progress.items[recipe.id] || 0) + 1 };
    return {
      ok:true,
      progress:{ ...progress, kits:progress.kits - recipe.kits, items },
      recipe,
      craftSkill:Math.min(100, level + recipe.skillGain)
    };
  }

  function giveGift(value, npcId, itemId, day) {
    const progress = normalizeProgress(value);
    const currentDay = Number(day);
    if (!Number.isSafeInteger(currentDay) || currentDay < 1) return { ok:false, reason:"invalid-day", progress };
    if (!recipientIds.has(npcId) || !Object.hasOwn(giftPreferences, npcId)) return { ok:false, reason:"unknown-recipient", progress };
    if (!recipeById.has(itemId)) return { ok:false, reason:"unknown-item", progress };
    if (!progress.items[itemId]) return { ok:false, reason:"no-item", progress };
    if (progress.lastGiftDayByNpc[npcId] === currentDay) return { ok:false, reason:"already-gifted", progress };
    const favorite = giftPreferences[npcId] === itemId;
    const items = { ...progress.items };
    items[itemId] -= 1;
    if (!items[itemId]) delete items[itemId];
    return {
      ok:true,
      progress:{ ...progress, items, lastGiftDayByNpc:{ ...progress.lastGiftDayByNpc, [npcId]:currentDay } },
      favorite,
      friendshipGain:favorite ? 8 : 4,
      relationshipAffinityGain:favorite && relationshipIds.has(npcId) ? 2 : 0,
      response:favorite ? "「これ、前から好きなんだ。大事にするね。」" : "「手作りなんだね。ありがとう、大切にするよ。」"
    };
  }

  return Object.freeze({ KIT_PACK_SIZE, KIT_PACK_COST, KIT_PACK_MINUTES, MAX_KITS, MAX_FINISHED_ITEMS, RECIPES, GIFT_PREFERENCES:giftPreferences, createProgress, normalizeProgress, itemCount, buyKitPack, craft, giveGift });
});
