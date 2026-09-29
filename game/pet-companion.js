(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PetCompanion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FOOD_PACK_PRICE = 450;
  const FOOD_PACK_SIZE = 3;
  const MAX_FOOD = 99;
  const SPECIES = Object.freeze({
    dog:Object.freeze({ id:'dog', label:'犬', name:'コロ', adoptionCost:6000, playLabel:'おもちゃで遊ぶ', color:'#c99466' }),
    cat:Object.freeze({ id:'cat', label:'猫', name:'ミケ', adoptionCost:4000, playLabel:'ねこじゃらしで遊ぶ', color:'#d18b73' })
  });

  function bounded(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number * 100) / 100)) : fallback;
  }

  function createProgress() {
    return { pet:null, food:0 };
  }

  function normalizeProgress(value) {
    const source = value && typeof value === 'object' ? value : {};
    const rawPet = source.pet && typeof source.pet === 'object' ? source.pet : null;
    const species = rawPet ? SPECIES[rawPet.speciesId] : null;
    let pet = null;
    if (species) {
      const name = typeof rawPet.name === 'string' ? rawPet.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16) : '';
      pet = {
        speciesId:species.id,
        name:name || species.name,
        hunger:bounded(rawPet.hunger, 78),
        happiness:bounded(rawPet.happiness, 76),
        bond:bounded(rawPet.bond, 10),
        energy:bounded(rawPet.energy, 85)
      };
    }
    const food = Number.isFinite(source.food) ? Math.max(0, Math.min(MAX_FOOD, Math.floor(source.food))) : 0;
    return { pet, food };
  }

  function isShelterOpen(minute) {
    return Number.isInteger(minute) && minute >= 540 && minute < 1140;
  }

  function getCondition(progress) {
    const pet = normalizeProgress(progress).pet;
    if (!pet) return { id:'no-pet', label:'ペットはいません' };
    if (pet.hunger < 25) return { id:'hungry', label:'お腹がすいています' };
    if (pet.happiness < 30) return { id:'lonely', label:'遊びたがっています' };
    if (pet.energy < 20) return { id:'tired', label:'休みたがっています' };
    return { id:'content', label:'元気です' };
  }

  function failed(progress, reason) {
    return { ok:false, reason, progress:normalizeProgress(progress) };
  }

  function adopt(progress, cash, speciesId, minute) {
    const current = normalizeProgress(progress);
    const species = SPECIES[speciesId];
    if (!isShelterOpen(minute)) return failed(current, 'closed');
    if (!species) return failed(current, 'unknown-species');
    if (current.pet) return failed(current, 'already-owned');
    if (!Number.isSafeInteger(cash) || cash < species.adoptionCost) return failed(current, 'insufficient-funds');
    return {
      ok:true,
      progress:{ ...current, pet:{ speciesId:species.id, name:species.name, hunger:78, happiness:76, bond:10, energy:85 } },
      cashRemaining:cash - species.adoptionCost,
      duration:20
    };
  }

  function buyFoodPack(progress, cash, minute) {
    const current = normalizeProgress(progress);
    if (!isShelterOpen(minute)) return failed(current, 'closed');
    if (!Number.isSafeInteger(cash) || cash < FOOD_PACK_PRICE) return failed(current, 'insufficient-funds');
    if (current.food > MAX_FOOD - FOOD_PACK_SIZE) return failed(current, 'inventory-limit');
    return {
      ok:true,
      progress:{ ...current, food:current.food + FOOD_PACK_SIZE },
      cashRemaining:cash - FOOD_PACK_PRICE
    };
  }

  function advance(progress, minutes) {
    const current = normalizeProgress(progress);
    if (!current.pet || !Number.isFinite(minutes) || minutes <= 0) return current;
    return normalizeProgress({
      ...current,
      pet:{
        ...current.pet,
        hunger:current.pet.hunger - minutes * 0.028,
        happiness:current.pet.happiness - minutes * 0.006,
        energy:current.pet.energy + minutes * 0.022
      }
    });
  }

  function feed(progress) {
    const current = normalizeProgress(progress);
    if (!current.pet) return failed(current, 'no-pet');
    if (current.food < 1) return failed(current, 'no-food');
    return {
      ok:true,
      progress:normalizeProgress({
        ...current,
        food:current.food - 1,
        pet:{
          ...current.pet,
          hunger:current.pet.hunger + 40,
          happiness:current.pet.happiness + 3,
          bond:current.pet.bond + 1
        }
      }),
      duration:5
    };
  }

  function play(progress) {
    const current = normalizeProgress(progress);
    if (!current.pet) return failed(current, 'no-pet');
    if (current.pet.energy < 20) return failed(current, 'too-tired');
    return {
      ok:true,
      progress:normalizeProgress({
        ...current,
        pet:{ ...current.pet, happiness:current.pet.happiness + 26, bond:current.pet.bond + 5, energy:current.pet.energy - 24 }
      }),
      duration:25
    };
  }

  function cuddle(progress) {
    const current = normalizeProgress(progress);
    if (!current.pet) return failed(current, 'no-pet');
    return {
      ok:true,
      progress:normalizeProgress({
        ...current,
        pet:{ ...current.pet, happiness:current.pet.happiness + 10, bond:current.pet.bond + 2 }
      }),
      duration:10
    };
  }

  return { FOOD_PACK_PRICE, FOOD_PACK_SIZE, SPECIES, createProgress, normalizeProgress, isShelterOpen, getCondition, adopt, buyFoodPack, advance, feed, play, cuddle };
});
