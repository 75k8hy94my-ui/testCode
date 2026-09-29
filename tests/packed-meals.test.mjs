import test from 'node:test';
import assert from 'node:assert/strict';
import cooking from '../game/home-cooking.js';
import packedMeals from '../game/packed-meals.js';

test('stores authored recipes in immutable same-minute batches and enforces six portions', () => {
  const empty = packedMeals.createInventory();
  const first = packedMeals.store(empty, 'home-meal', 480);
  const second = packedMeals.store(first.inventory, 'home-meal', 480);
  assert.equal(first.ok, true);
  assert.equal(second.inventory.batches.length, 1);
  assert.deepEqual(second.inventory.batches[0], { recipeId:'home-meal', preparedAt:480, portions:2 });
  assert.equal(packedMeals.portionCount(second.inventory), 2);
  assert.deepEqual(empty, { batches:[] });

  let inventory = second.inventory;
  for (let index = 0; index < 4; index += 1) inventory = packedMeals.store(inventory, 'grilled-fish', 481 + index).inventory;
  const full = packedMeals.store(inventory, 'home-meal', 490);
  assert.equal(packedMeals.portionCount(inventory), 6);
  assert.deepEqual(full, { ok:false, reason:'capacity', inventory });
});

test('rejects unknown recipes and invalid preparation timestamps without changing inventory', () => {
  const inventory = { batches:[] };
  assert.deepEqual(packedMeals.store(inventory, 'invented-meal', 20), { ok:false, reason:'unknown-recipe', inventory });
  assert.deepEqual(packedMeals.store(inventory, 'home-meal', -1), { ok:false, reason:'invalid-time', inventory });
  assert.deepEqual(packedMeals.store(inventory, 'home-meal', 2.5), { ok:false, reason:'invalid-time', inventory });
});

test('normalizes malformed, future-dated, duplicate, and over-capacity data safely', () => {
  assert.deepEqual(packedMeals.normalizeInventory({ batches:[
    { recipeId:'home-meal', preparedAt:100, portions:3 },
    { recipeId:'home-meal', preparedAt:100, portions:4 },
    { recipeId:'invented-meal', preparedAt:100, portions:1 },
    { recipeId:'grilled-fish', preparedAt:-1, portions:1 },
    { recipeId:'grilled-fish', preparedAt:101, portions:0 }
  ] }), { batches:[{ recipeId:'home-meal', preparedAt:100, portions:3 }] });
  assert.deepEqual(packedMeals.normalizeInventory(null), { batches:[] });
  assert.equal(packedMeals.portionCount({ batches:[{ recipeId:'home-meal', preparedAt:1, portions:999 }] }), 6);
  assert.ok(cooking.RECIPES.some((recipe) => recipe.id === 'grilled-fish'));
});

test('expires portions exactly at 24 hours and preserves them one minute before', () => {
  const inventory = { batches:[{ recipeId:'home-meal', preparedAt:480, portions:2 }] };
  assert.deepEqual(packedMeals.expire(inventory, 1919), inventory);
  assert.deepEqual(packedMeals.expire(inventory, 1920), { batches:[] });
  assert.deepEqual(inventory.batches[0], { recipeId:'home-meal', preparedAt:480, portions:2 });
});

test('eats exactly one fresh portion and rejects stale or unknown batch actions', () => {
  const inventory = { batches:[{ recipeId:'home-meal', preparedAt:480, portions:2 }] };
  const meal = packedMeals.eat(inventory, 'home-meal@480', 500);
  assert.equal(meal.ok, true);
  assert.equal(meal.recipe, cooking.RECIPES[0]);
  assert.equal(meal.portionsRemaining, 1);
  assert.deepEqual(meal.inventory.batches, [{ recipeId:'home-meal', preparedAt:480, portions:1 }]);
  assert.deepEqual(inventory.batches, [{ recipeId:'home-meal', preparedAt:480, portions:2 }]);
  assert.deepEqual(packedMeals.eat(inventory, 'home-meal@480', 1920), { ok:false, reason:'expired', inventory:{ batches:[] } });
  assert.deepEqual(packedMeals.eat(inventory, 'home-meal@481', 500), { ok:false, reason:'not-found', inventory });
});
