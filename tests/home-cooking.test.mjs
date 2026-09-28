import test from 'node:test';
import assert from 'node:assert/strict';
import cooking from '../game/home-cooking.js';

test('cooking skill unlocks progressively richer meals', () => {
  assert.deepEqual(cooking.listRecipes(0, 3).map((entry) => ({
    id:entry.recipe.id,
    unlocked:entry.unlocked,
    available:entry.available,
    reason:entry.reason
  })), [
    { id:'home-meal', unlocked:true, available:true, reason:null },
    { id:'hearty-set', unlocked:false, available:false, reason:'skill-required' },
    { id:'hospitality-feast', unlocked:false, available:false, reason:'skill-required' }
  ]);

  assert.equal(cooking.listRecipes(20, 3)[1].available, true);
  assert.equal(cooking.listRecipes(50, 3)[2].available, true);
});

test('meal preparation consumes only its ingredients and advances cooking skill with bounded effects', () => {
  const result = cooking.cookMeal(50, 3, 'hospitality-feast');

  assert.deepEqual(result, {
    ok:true,
    recipe:{
      id:'hospitality-feast',
      name:'おもてなし御膳',
      minimumSkill:50,
      groceries:3,
      duration:90,
      skillGain:3,
      effects:{ hunger:100, fun:20, social:8, energy:8, hygiene:-5 }
    },
    groceriesRemaining:0,
    cookingSkill:53
  });
});

test('meal preparation rejects unknown, locked, and under-stocked recipes without consuming anything', () => {
  assert.deepEqual(cooking.cookMeal(0, 3, 'hearty-set'), { ok:false, reason:'skill-required' });
  assert.deepEqual(cooking.cookMeal(50, 2, 'hospitality-feast'), { ok:false, reason:'insufficient-groceries' });
  assert.deepEqual(cooking.cookMeal(50, 3, 'unknown'), { ok:false, reason:'unknown-recipe' });
});

test('meal preparation normalizes invalid inventory and clamps cooking skill at one hundred', () => {
  const meal = cooking.cookMeal(101, -4, 'home-meal');
  assert.equal(meal.ok, false);
  assert.deepEqual(cooking.cookMeal(100, 1, 'home-meal'), {
    ok:true,
    recipe:{
      id:'home-meal',
      name:'家庭料理',
      minimumSkill:0,
      groceries:1,
      duration:45,
      skillGain:1,
      effects:{ hunger:52, fun:4, hygiene:-2 }
    },
    groceriesRemaining:0,
    cookingSkill:100
  });
});
