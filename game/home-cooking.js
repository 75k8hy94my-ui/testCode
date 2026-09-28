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
    }),
    Object.freeze({
      id:"grilled-fish",
      name:"焼き魚定食",
      minimumSkill:0,
      groceries:0,
      fish:1,
      duration:50,
      skillGain:1,
      effects:Object.freeze({ hunger:62, fun:10, hygiene:-2 })
    }),
    Object.freeze({
      id:"fish-rice",
      name:"鯛めし",
      minimumSkill:25,
      groceries:1,
      fish:1,
      duration:65,
      skillGain:2,
      effects:Object.freeze({ hunger:85, fun:16, energy:4 })
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

  function normalizedFish(value) {
    const count = Math.floor(Number(value));
    return Number.isFinite(count) ? Math.max(0, count) : 0;
  }

  function listRecipes(skill, groceries, fish) {
    const cookingSkill = normalizedSkill(skill);
    const availableGroceries = normalizedGroceries(groceries);
    const availableFish = normalizedFish(fish);
    const recipes = arguments.length >= 3 ? RECIPES : RECIPES.filter((recipe) => !recipe.fish);
    return recipes.map((recipe) => {
      const unlocked = cookingSkill >= recipe.minimumSkill;
      const enoughFish = availableFish >= (recipe.fish || 0);
      const enoughGroceries = availableGroceries >= recipe.groceries;
      const available = unlocked && enoughFish && enoughGroceries;
      const status = {
        recipe,
        unlocked,
        available,
        reason:!unlocked ? "skill-required" : !enoughFish ? "insufficient-fish" : !enoughGroceries ? "insufficient-groceries" : null
      };
      if (recipe.fish) status.fishRemaining = Math.max(0, availableFish - recipe.fish);
      return status;
    });
  }

  function cookMeal(skill, groceries, recipeId, fish) {
    const recipe = RECIPES.find((value) => value.id === recipeId);
    if (!recipe) return { ok:false, reason:"unknown-recipe" };
    const status = listRecipes(skill, groceries, fish).find((entry) => entry.recipe.id === recipeId);
    if (!status.unlocked) return { ok:false, reason:"skill-required" };
    if (recipe.fish && normalizedFish(fish) < recipe.fish) return { ok:false, reason:"insufficient-fish" };
    if (!status.available) return { ok:false, reason:"insufficient-groceries" };
    const result = {
      ok:true,
      recipe,
      groceriesRemaining:normalizedGroceries(groceries) - recipe.groceries,
      cookingSkill:Math.min(100, normalizedSkill(skill) + recipe.skillGain)
    };
    if (recipe.fish) result.fishRemaining = normalizedFish(fish) - recipe.fish;
    return result;
  }

  return Object.freeze({ RECIPES, listRecipes, cookMeal });
});
