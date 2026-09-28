(function initCityDaysHomeCooking(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysHomeCooking = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHomeCookingApi() {
  "use strict";

  const RECIPES = Object.freeze([
    Object.freeze({
      id:"home-meal",
      name:"家庭料理",
      minimumSkill:0,
      groceries:1,
      duration:45,
      skillGain:1,
      effects:Object.freeze({ hunger:52, fun:4, hygiene:-2 })
    }),
    Object.freeze({
      id:"hearty-set",
      name:"具だくさん定食",
      minimumSkill:20,
      groceries:2,
      duration:60,
      skillGain:2,
      effects:Object.freeze({ hunger:78, fun:12, energy:5, hygiene:-3 })
    }),
    Object.freeze({
      id:"hospitality-feast",
      name:"おもてなし御膳",
      minimumSkill:50,
      groceries:3,
      duration:90,
      skillGain:3,
      effects:Object.freeze({ hunger:100, fun:20, social:8, energy:8, hygiene:-5 })
    })
  ]);

  function normalizedSkill(value) {
    const skill = Number(value);
    return Number.isFinite(skill) ? Math.max(0, Math.min(100, skill)) : 0;
  }

  function normalizedGroceries(value) {
    const count = Math.floor(Number(value));
    return Number.isFinite(count) ? Math.max(0, count) : 0;
  }

  function listRecipes(skill, groceries) {
    const cookingSkill = normalizedSkill(skill);
    const availableGroceries = normalizedGroceries(groceries);
    return RECIPES.map((recipe) => {
      const unlocked = cookingSkill >= recipe.minimumSkill;
      const available = unlocked && availableGroceries >= recipe.groceries;
      return {
        recipe,
        unlocked,
        available,
        reason:!unlocked ? "skill-required" : available ? null : "insufficient-groceries"
      };
    });
  }

  function cookMeal(skill, groceries, recipeId) {
    const recipe = RECIPES.find((value) => value.id === recipeId);
    if (!recipe) return { ok:false, reason:"unknown-recipe" };
    const status = listRecipes(skill, groceries).find((entry) => entry.recipe.id === recipeId);
    if (!status.unlocked) return { ok:false, reason:"skill-required" };
    if (!status.available) return { ok:false, reason:"insufficient-groceries" };
    return {
      ok:true,
      recipe,
      groceriesRemaining:normalizedGroceries(groceries) - recipe.groceries,
      cookingSkill:Math.min(100, normalizedSkill(skill) + recipe.skillGain)
    };
  }

  return Object.freeze({ RECIPES, listRecipes, cookMeal });
});
