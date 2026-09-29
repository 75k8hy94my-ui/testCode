import test from 'node:test';
import assert from 'node:assert/strict';
import pets from '../game/pet-companion.js';

const ownedDog = () => ({
  pet:{ speciesId:'dog', name:'コロ', hunger:78, happiness:76, bond:10, energy:85 },
  food:0
});

test('new households have no pet and legacy or malformed values normalize safely', () => {
  assert.deepEqual(pets.createProgress(), { pet:null, food:0 });
  assert.deepEqual(pets.normalizeProgress({ pet:{ speciesId:'fox', name:'<img>', hunger:-3, happiness:120, bond:6.7, energy:NaN }, food:101 }), {
    pet:null,
    food:99
  });
  assert.deepEqual(pets.normalizeProgress({ pet:{ speciesId:'cat', name:'ミケ', hunger:40, happiness:30, bond:22, energy:70 }, food:-4 }), {
    pet:{ speciesId:'cat', name:'ミケ', hunger:40, happiness:30, bond:22, energy:70 },
    food:0
  });
});

test('the shelter is open from 09:00 inclusive to 19:00 exclusive', () => {
  assert.equal(pets.isShelterOpen(539), false);
  assert.equal(pets.isShelterOpen(540), true);
  assert.equal(pets.isShelterOpen(1139), true);
  assert.equal(pets.isShelterOpen(1140), false);
  assert.equal(pets.isShelterOpen(1440), false);
});

test('adopting a cat charges its fee, assigns its name and refuses a second pet', () => {
  const empty = pets.createProgress();
  const result = pets.adopt(empty, 4000, 'cat', 540);
  assert.equal(result.ok, true);
  assert.equal(result.cashRemaining, 0);
  assert.equal(result.duration, 20);
  assert.deepEqual(result.progress.pet, { speciesId:'cat', name:'ミケ', hunger:78, happiness:76, bond:10, energy:85 });
  assert.equal(empty.pet, null);
  assert.equal(pets.adopt(result.progress, 10000, 'dog', 600).reason, 'already-owned');
  assert.equal(pets.adopt(empty, 3999, 'cat', 600).reason, 'insufficient-funds');
  assert.equal(pets.adopt(empty, 6000, 'dog', 539).reason, 'closed');
  assert.equal(pets.adopt(empty, 6000, 'parrot', 600).reason, 'unknown-species');
});

test('a ¥450 pet-food pack provides three portions only while the shelter is open', () => {
  const empty = pets.createProgress();
  const purchase = pets.buyFoodPack(empty, 500, 540);
  assert.deepEqual(purchase, { ok:true, progress:{ pet:null, food:3 }, cashRemaining:50 });
  assert.equal(pets.buyFoodPack(empty, 449, 540).reason, 'insufficient-funds');
  assert.equal(pets.buyFoodPack(empty, 450, 1140).reason, 'closed');
  assert.equal(empty.food, 0);
  assert.equal(pets.buyFoodPack({ pet:null, food:98 }, 450, 600).reason, 'inventory-limit');
});

test('feeding consumes one portion and improves hunger, happiness and bond', () => {
  assert.deepEqual(pets.feed({ ...ownedDog(), food:2 }), {
    ok:true,
    progress:{ pet:{ speciesId:'dog', name:'コロ', hunger:100, happiness:79, bond:11, energy:85 }, food:1 },
    duration:5
  });
  const actual = pets.feed({ pet:{ ...ownedDog().pet, hunger:70, happiness:40, bond:9 }, food:1 });
  assert.deepEqual(actual.progress.pet, { speciesId:'dog', name:'コロ', hunger:100, happiness:43, bond:10, energy:85 });
  assert.equal(pets.feed(ownedDog()).reason, 'no-food');
  assert.equal(pets.feed({ pet:null, food:1 }).reason, 'no-pet');
});

test('playing builds happiness and bond but is refused below 20 energy', () => {
  const result = pets.play(ownedDog());
  assert.equal(result.ok, true);
  assert.equal(result.duration, 25);
  assert.deepEqual(result.progress.pet, { speciesId:'dog', name:'コロ', hunger:78, happiness:100, bond:15, energy:61 });
  assert.equal(pets.play({ pet:{ ...ownedDog().pet, energy:19 }, food:0 }).reason, 'too-tired');
  assert.equal(pets.play({ pet:null, food:0 }).reason, 'no-pet');
});

test('cuddling raises happiness and bond without spending food', () => {
  const result = pets.cuddle(ownedDog());
  assert.deepEqual(result, {
    ok:true,
    progress:{ pet:{ ...ownedDog().pet, happiness:86, bond:12 }, food:0 },
    duration:10
  });
});

test('elapsed game time changes pet needs exactly once and clamps at their bounds', () => {
  const result = pets.advance(ownedDog(), 60);
  assert.deepEqual(result.pet, { speciesId:'dog', name:'コロ', hunger:76.32, happiness:75.64, bond:10, energy:86.32 });
  assert.deepEqual(pets.getCondition(result), { id:'content', label:'元気です' });
  assert.deepEqual(pets.getCondition({ pet:{ ...ownedDog().pet, hunger:20 }, food:0 }), { id:'hungry', label:'お腹がすいています' });
  assert.deepEqual(pets.getCondition({ pet:{ ...ownedDog().pet, happiness:20 }, food:0 }), { id:'lonely', label:'遊びたがっています' });
  assert.deepEqual(pets.getCondition({ pet:{ ...ownedDog().pet, energy:10 }, food:0 }), { id:'tired', label:'休みたがっています' });
  assert.deepEqual(pets.advance({ pet:{ ...ownedDog().pet, hunger:1, happiness:1, energy:99.9 }, food:0 }, 1440).pet,
    { speciesId:'dog', name:'コロ', hunger:0, happiness:0, bond:10, energy:100 });
  assert.deepEqual(pets.advance(ownedDog(), -1), pets.normalizeProgress(ownedDog()));
});

test('all rejected pet actions preserve the caller progress and invalid commerce preserves cash', () => {
  const source = { pet:{ ...ownedDog().pet, energy:10 }, food:0 };
  const before = structuredClone(source);
  assert.equal(pets.play(source).ok, false);
  assert.deepEqual(source, before);
  assert.equal(pets.adopt(pets.createProgress(), Number.NaN, 'dog', 600).reason, 'insufficient-funds');
  assert.equal(pets.buyFoodPack(pets.createProgress(), -1, 600).reason, 'insufficient-funds');
});
