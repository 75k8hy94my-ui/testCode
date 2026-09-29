(function initCityDaysPackedMeals(root, factory) {
  "use strict";

  const cooking = root?.CityDaysHomeCooking;
  const api = factory(cooking);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysPackedMeals = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPackedMealsApi(cooking) {
  "use strict";

  const MAX_PORTIONS = 6;
  const FRESHNESS_MINUTES = 1440;
  const recipes = new Map((Array.isArray(cooking?.RECIPES) ? cooking.RECIPES : []).map((recipe) => [recipe.id, recipe]));

  function createInventory() {
    return { batches:[] };
  }

  function normalizeInventory(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.batches)) return createInventory();
    const batches = [];
    const seen = new Set();
    let remaining = MAX_PORTIONS;
    for (const batch of value.batches) {
      if (!batch || typeof batch !== "object" || !recipes.has(batch.recipeId)) continue;
      const { recipeId, preparedAt, portions } = batch;
      if (!Number.isSafeInteger(preparedAt) || preparedAt < 0 || !Number.isSafeInteger(portions) || portions < 1 || portions > MAX_PORTIONS) continue;
      const key = `${recipeId}@${preparedAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const accepted = Math.min(portions, remaining);
      if (accepted < 1) break;
      batches.push({ recipeId, preparedAt, portions:accepted });
      remaining -= accepted;
      if (remaining === 0) break;
    }
    return { batches };
  }

  function portionCount(value) {
    return normalizeInventory(value).batches.reduce((total, batch) => total + batch.portions, 0);
  }

  function validTime(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function store(value, recipeId, preparedAt) {
    const inventory = normalizeInventory(value);
    if (!recipes.has(recipeId)) return { ok:false, reason:"unknown-recipe", inventory };
    if (!validTime(preparedAt)) return { ok:false, reason:"invalid-time", inventory };
    if (portionCount(inventory) >= MAX_PORTIONS) return { ok:false, reason:"capacity", inventory };
    const batches = inventory.batches.map((batch) => ({ ...batch }));
    const existing = batches.find((batch) => batch.recipeId === recipeId && batch.preparedAt === preparedAt);
    if (existing) existing.portions += 1;
    else batches.push({ recipeId, preparedAt, portions:1 });
    return { ok:true, inventory:{ batches }, mealId:`${recipeId}@${preparedAt}` };
  }

  function expire(value, now) {
    const inventory = normalizeInventory(value);
    if (!validTime(now)) return inventory;
    return { batches:inventory.batches.filter((batch) => batch.preparedAt <= now && now < batch.preparedAt + FRESHNESS_MINUTES).map((batch) => ({ ...batch })) };
  }

  function eat(value, mealId, now) {
    const inventory = expire(value, now);
    if (!validTime(now)) return { ok:false, reason:"invalid-time", inventory };
    const index = inventory.batches.findIndex((batch) => `${batch.recipeId}@${batch.preparedAt}` === mealId);
    if (index < 0) {
      const original = normalizeInventory(value);
      const wasExpired = original.batches.some((batch) => `${batch.recipeId}@${batch.preparedAt}` === mealId && now >= batch.preparedAt + FRESHNESS_MINUTES);
      return { ok:false, reason:wasExpired ? "expired" : "not-found", inventory };
    }
    const batches = inventory.batches.map((batch) => ({ ...batch }));
    batches[index].portions -= 1;
    const portionsRemaining = batches[index].portions;
    if (portionsRemaining === 0) batches.splice(index, 1);
    const batch = inventory.batches[index];
    return { ok:true, inventory:{ batches }, recipe:recipes.get(batch.recipeId), portionsRemaining };
  }

  return Object.freeze({ MAX_PORTIONS, FRESHNESS_MINUTES, createInventory, normalizeInventory, portionCount, store, expire, eat });
});
