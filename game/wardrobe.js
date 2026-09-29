(function initCityDaysWardrobe(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysWardrobe = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCityDaysWardrobe() {
  "use strict";

  const DEFAULT_OUTFIT_ID = "everyday";
  const SOIL_PER_MINUTE = 0.08;
  const LAUNDRY_COST = 300;
  const LAUNDRY_DURATION = 30;
  const CATALOG = Object.freeze([
    Object.freeze({ id:"everyday", name:"いつもの服", price:0, purchaseDuration:10, equipDuration:5, top:"#405c50", bottom:"#313b42", accent:"#2a463a", topStyle:3, bottomStyle:0, bottomGarment:"pants", accessory:"none" }),
    Object.freeze({ id:"indigo-denim", name:"藍染めデニム", price:1200, purchaseDuration:10, equipDuration:5, top:"#3f5f82", bottom:"#37414b", accent:"#7895b7", topStyle:5, bottomStyle:1, bottomGarment:"pants", accessory:"none" }),
    Object.freeze({ id:"linen-weekend", name:"リネンの休日", price:1400, purchaseDuration:10, equipDuration:5, top:"#c5ad88", bottom:"#66584a", accent:"#ead9b9", topStyle:1, bottomStyle:3, bottomGarment:"pants", accessory:"tote" }),
    Object.freeze({ id:"active-set", name:"アクティブセット", price:1800, purchaseDuration:10, equipDuration:5, top:"#54866d", bottom:"#35483f", accent:"#91bda2", topStyle:2, bottomStyle:3, bottomGarment:"pants", accessory:"backpack" }),
    Object.freeze({ id:"city-jacket", name:"街歩きジャケット", price:2200, purchaseDuration:10, equipDuration:5, top:"#76566f", bottom:"#373c49", accent:"#b28aa7", topStyle:6, bottomStyle:4, bottomGarment:"pants", accessory:"none" }),
    Object.freeze({ id:"sakura-knit", name:"桜色ニット", price:2600, purchaseDuration:10, equipDuration:5, top:"#b86f83", bottom:"#50434a", accent:"#e7a8b5", topStyle:8, bottomStyle:2, bottomGarment:"pants", accessory:"shoulder" })
  ]);
  const outfitById = new Map(CATALOG.map((outfit) => [outfit.id, outfit]));

  function createWardrobe() {
    return {
      ownedOutfitIds:[DEFAULT_OUTFIT_ID],
      equippedOutfitId:DEFAULT_OUTFIT_ID,
      cleanlinessByOutfitId:{ [DEFAULT_OUTFIT_ID]:100 }
    };
  }

  function normalizeWardrobe(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawIds = Array.isArray(source.ownedOutfitIds) ? new Set(source.ownedOutfitIds) : new Set();
    const ownedOutfitIds = CATALOG.filter((outfit) => outfit.id === DEFAULT_OUTFIT_ID || rawIds.has(outfit.id)).map((outfit) => outfit.id);
    const equippedOutfitId = ownedOutfitIds.includes(source.equippedOutfitId) ? source.equippedOutfitId : DEFAULT_OUTFIT_ID;
    const rawCleanliness = source.cleanlinessByOutfitId && typeof source.cleanlinessByOutfitId === "object"
      ? source.cleanlinessByOutfitId : {};
    const cleanlinessByOutfitId = Object.fromEntries(ownedOutfitIds.map((outfitId) => {
      const value = rawCleanliness[outfitId];
      return [outfitId, Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 100];
    }));
    return { ownedOutfitIds, equippedOutfitId, cleanlinessByOutfitId };
  }

  function getOutfit(outfitId) {
    return outfitById.get(outfitId) || null;
  }

  function buyOutfit(value, cash, outfitId) {
    const wardrobe = normalizeWardrobe(value);
    const outfit = getOutfit(outfitId);
    if (!outfit) return { ok:false, reason:"unknown-outfit", wardrobe };
    if (wardrobe.ownedOutfitIds.includes(outfitId)) return { ok:false, reason:"already-owned", wardrobe };
    const availableCash = Number(cash);
    if (!Number.isFinite(availableCash) || availableCash < outfit.price) return { ok:false, reason:"insufficient-funds", wardrobe };
    return {
      ok:true,
      wardrobe:{
        ...wardrobe,
        ownedOutfitIds:[...wardrobe.ownedOutfitIds, outfitId],
        cleanlinessByOutfitId:{ ...wardrobe.cleanlinessByOutfitId, [outfitId]:100 }
      },
      cashRemaining:Math.floor(availableCash - outfit.price),
      duration:outfit.purchaseDuration,
      outfit
    };
  }

  function equipOutfit(value, outfitId) {
    const wardrobe = normalizeWardrobe(value);
    const outfit = getOutfit(outfitId);
    if (!outfit) return { ok:false, reason:"unknown-outfit", wardrobe };
    if (!wardrobe.ownedOutfitIds.includes(outfitId)) return { ok:false, reason:"not-owned", wardrobe };
    if (wardrobe.equippedOutfitId === outfitId) return { ok:false, reason:"already-equipped", wardrobe };
    return {
      ok:true,
      wardrobe:{ ...wardrobe, equippedOutfitId:outfitId },
      duration:outfit.equipDuration,
      outfit
    };
  }

  function advanceWear(value, minutes) {
    const wardrobe = normalizeWardrobe(value);
    const elapsed = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
    if (!elapsed) return wardrobe;
    const outfitId = wardrobe.equippedOutfitId;
    return normalizeWardrobe({
      ...wardrobe,
      cleanlinessByOutfitId:{
        ...wardrobe.cleanlinessByOutfitId,
        [outfitId]:wardrobe.cleanlinessByOutfitId[outfitId] - elapsed * SOIL_PER_MINUTE
      }
    });
  }

  function launder(value, cash, minute) {
    const wardrobe = normalizeWardrobe(value);
    const availableCash = Number(cash);
    const startMinute = Number(minute);
    const finishMinute = startMinute + LAUNDRY_DURATION;
    const cleanliness = wardrobe.cleanlinessByOutfitId[wardrobe.equippedOutfitId];
    if (!Number.isFinite(startMinute) || startMinute < 0 || startMinute >= 1440) {
      return { ok:false, reason:"not-open", wardrobe };
    }
    if (startMinute < 360 || startMinute >= 1380) return { ok:false, reason:"not-open", wardrobe };
    if (finishMinute > 1380) return { ok:false, reason:"closing-time", wardrobe };
    if (cleanliness >= 100) return { ok:false, reason:"already-clean", wardrobe };
    if (!Number.isFinite(availableCash) || availableCash < LAUNDRY_COST) {
      return { ok:false, reason:"insufficient-funds", wardrobe };
    }
    return {
      ok:true,
      wardrobe:{
        ...wardrobe,
        cleanlinessByOutfitId:{ ...wardrobe.cleanlinessByOutfitId, [wardrobe.equippedOutfitId]:100 }
      },
      cashRemaining:Math.floor(availableCash - LAUNDRY_COST),
      duration:LAUNDRY_DURATION,
      cost:LAUNDRY_COST
    };
  }

  return Object.freeze({ DEFAULT_OUTFIT_ID, CATALOG, createWardrobe, normalizeWardrobe, getOutfit, buyOutfit, equipOutfit, advanceWear, launder });
});
