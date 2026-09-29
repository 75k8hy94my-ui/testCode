(function initCityDaysStorePreparedFood(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysStorePreparedFood = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createStorePreparedFoodApi() {
  "use strict";

  const MENU = Object.freeze([
    Object.freeze({ id:"onigiri-set", name:"おにぎりセット", price:280, duration:5, freshnessMinutes:720, effects:Object.freeze({ hunger:28, fun:3 }) }),
    Object.freeze({ id:"seasonal-bento", name:"日替わり幕の内弁当", price:680, duration:5, freshnessMinutes:1440, effects:Object.freeze({ hunger:66, fun:9, energy:3 }) }),
    Object.freeze({ id:"pasta-salad", name:"パスタサラダ", price:420, duration:5, freshnessMinutes:720, effects:Object.freeze({ hunger:38, fun:6 }) })
  ]);
  const INITIAL_STOCK = Object.freeze({ "onigiri-set":8, "seasonal-bento":5, "pasta-salad":4 });

  function createInventory() {
    return { day:1, remaining:{ ...INITIAL_STOCK } };
  }

  function validDay(value) {
    return Number.isSafeInteger(value) && value >= 1;
  }

  function normalizeInventory(value, day = 1) {
    const currentDay = validDay(day) ? day : 1;
    if (!value || typeof value !== "object" || !validDay(value.day) || !value.remaining || typeof value.remaining !== "object" || Array.isArray(value.remaining)) {
      return { day:currentDay, remaining:{ ...INITIAL_STOCK } };
    }
    if (value.day !== currentDay) return { day:currentDay, remaining:{ ...INITIAL_STOCK } };
    const remaining = {};
    for (const item of MENU) {
      const count = Number(value.remaining[item.id]);
      remaining[item.id] = Number.isSafeInteger(count) ? Math.max(0, Math.min(INITIAL_STOCK[item.id], count)) : INITIAL_STOCK[item.id];
    }
    return { day:currentDay, remaining };
  }

  function listMenu(inventory, day) {
    const current = normalizeInventory(inventory, day);
    return MENU.map((item) => ({ ...item, remaining:current.remaining[item.id] }));
  }

  function purchase(inventory, day, cash, mealInventory, itemId, now, packedMeals) {
    const current = normalizeInventory(inventory, day);
    const item = MENU.find((entry) => entry.id === itemId);
    if (!item) return { ok:false, reason:"unknown-item", inventory:current, mealInventory };
    if (typeof packedMeals?.registerPreparedMeals === "function") packedMeals.registerPreparedMeals(MENU);
    if (!Number.isSafeInteger(now) || now < 0) return { ok:false, reason:"invalid-time", inventory:current, mealInventory:packedMeals?.normalizeInventory?.(mealInventory) ?? mealInventory };
    const meals = packedMeals?.normalizeInventory?.(mealInventory);
    if (!meals || typeof packedMeals.registerPreparedMeals !== "function" || typeof packedMeals.store !== "function") {
      return { ok:false, reason:"invalid-meal-inventory", inventory:current, mealInventory:mealInventory };
    }
    if (current.remaining[item.id] <= 0) return { ok:false, reason:"sold-out", inventory:current, mealInventory:meals };
    if (!Number.isFinite(cash) || cash < item.price) return { ok:false, reason:"insufficient-funds", inventory:current, mealInventory:meals };
    const stored = packedMeals.store(meals, item.id, now);
    if (!stored.ok) return { ok:false, reason:stored.reason === "capacity" ? "meal-capacity" : stored.reason, inventory:current, mealInventory:stored.inventory };
    return {
      ok:true,
      item,
      cost:item.price,
      duration:item.duration,
      cashRemaining:cash - item.price,
      inventory:{ day:current.day, remaining:{ ...current.remaining, [item.id]:current.remaining[item.id] - 1 } },
      mealInventory:stored.inventory,
      mealId:stored.mealId
    };
  }

  function getItem(itemId) {
    return MENU.find((item) => item.id === itemId) || null;
  }

  return Object.freeze({ MENU, INITIAL_STOCK, createInventory, normalizeInventory, listMenu, purchase, getItem });
});
