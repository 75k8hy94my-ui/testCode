import test from 'node:test';
import assert from 'node:assert/strict';
import cooking from '../game/home-cooking.js';
import store from '../game/store-prepared-food.js';
import packedMeals from '../game/packed-meals.js';

void cooking;

test('daily prepared-food stock is stable within a day and replenishes the next day', () => {
  assert.deepEqual(store.MENU.map(({ id, price }) => [id, price]), [
    ['onigiri-set', 280], ['seasonal-bento', 680], ['pasta-salad', 420]
  ]);
  assert.deepEqual(store.listMenu(store.createInventory(), 1).map(({ remaining }) => remaining), [8, 5, 4]);
  const bought = store.purchase(store.createInventory(), 1, 1000, packedMeals.createInventory(), 'onigiri-set', 480, packedMeals);
  assert.equal(bought.ok, true);
  assert.equal(store.listMenu(bought.inventory, 1)[0].remaining, 7);
  assert.equal(store.listMenu(bought.inventory, 2)[0].remaining, 8);
});

test('successful purchase atomically charges cash and stores the prepared meal', () => {
  const result = store.purchase(store.createInventory(), 2, 1000, packedMeals.createInventory(), 'seasonal-bento', 1920, packedMeals);
  assert.equal(result.ok, true);
  assert.equal(result.cashRemaining, 320);
  assert.equal(result.cost, 680);
  assert.equal(result.duration, 5);
  assert.equal(result.mealId, 'seasonal-bento@1920');
  assert.equal(packedMeals.portionCount(result.mealInventory), 1);
  assert.equal(packedMeals.eat(result.mealInventory, result.mealId, 1921).recipe.name, '日替わり幕の内弁当');
});

test('failed purchases preserve stock and packed meals for invalid item, time, funds, sold-out, and capacity', () => {
  const initial = store.createInventory();
  const emptyMeals = packedMeals.createInventory();
  for (const [itemId, cash, now, reason] of [
    ['unknown', 1000, 0, 'unknown-item'], ['onigiri-set', 1000, -1, 'invalid-time'],
    ['onigiri-set', 279, 0, 'insufficient-funds']
  ]) {
    const result = store.purchase(initial, 1, cash, emptyMeals, itemId, now, packedMeals);
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.deepEqual(result.inventory, initial);
    assert.deepEqual(result.mealInventory, emptyMeals);
  }

  let soldOut = initial;
  for (let count = 0; count < 8; count += 1) {
    soldOut = store.purchase(soldOut, 1, 10000, emptyMeals, 'onigiri-set', count, packedMeals).inventory;
  }
  const sold = store.purchase(soldOut, 1, 10000, emptyMeals, 'onigiri-set', 9, packedMeals);
  assert.equal(sold.reason, 'sold-out');
  assert.equal(sold.inventory.remaining['onigiri-set'], 0);

  const fullMeals = { batches:[{ recipeId:'home-meal', preparedAt:1, portions:6 }] };
  const full = store.purchase(initial, 1, 1000, fullMeals, 'onigiri-set', 2, packedMeals);
  assert.equal(full.reason, 'meal-capacity');
  assert.deepEqual(full.inventory, initial);
  assert.equal(packedMeals.portionCount(full.mealInventory), 6);
});

test('legacy, corrupt, and cross-day store inventory normalize without inventing spent stock', () => {
  assert.deepEqual(store.normalizeInventory(null, 4), { day:4, remaining:{ 'onigiri-set':8, 'seasonal-bento':5, 'pasta-salad':4 } });
  const normalized = store.normalizeInventory({ day:4, remaining:{ 'onigiri-set':100, 'seasonal-bento':-3, unknown:99 } }, 4);
  assert.deepEqual(normalized, { day:4, remaining:{ 'onigiri-set':8, 'seasonal-bento':0, 'pasta-salad':4 } });
  assert.deepEqual(store.normalizeInventory(normalized, 5), { day:5, remaining:{ 'onigiri-set':8, 'seasonal-bento':5, 'pasta-salad':4 } });
});
