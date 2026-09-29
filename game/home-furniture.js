(function initCityDaysHomeFurniture(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysHomeFurniture = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHomeFurnitureApi() {
  "use strict";

  const MAX_ITEM_COUNT = 12;
  const MAX_PLACEMENTS = 12;
  const MAX_GRID_X = 38;
  const MAX_GRID_Y = 24;
  const ROTATIONS = new Set([0, 90, 180, 270]);
  const CATALOG = Object.freeze([
    Object.freeze({
      id:"bookshelf", name:"本棚", price:1500, purchaseMinutes:5, widthCells:2, heightCells:2,
      action:Object.freeze({ id:"read", name:"読書", duration:35, needs:Object.freeze({ fun:12, energy:-7 }) })
    }),
    Object.freeze({
      id:"kotatsu", name:"こたつ", price:2400, purchaseMinutes:5, widthCells:3, heightCells:2,
      action:Object.freeze({ id:"rest", name:"こたつで休む", duration:30, needs:Object.freeze({ energy:14, fun:8 }) })
    }),
    Object.freeze({
      id:"plant", name:"観葉植物", price:900, purchaseMinutes:5, widthCells:1, heightCells:1,
      action:Object.freeze({ id:"care", name:"植物の手入れ", duration:10, needs:Object.freeze({ fun:4 }) })
    })
  ]);
  const catalogById = new Map(CATALOG.map((item) => [item.id, item]));

  function createProgress() {
    return { inventory:{}, placements:[], nextPlacementNumber:1 };
  }

  function validRotation(value) {
    return Number.isSafeInteger(value) && ROTATIONS.has(value);
  }

  function placementNumber(value) {
    if (typeof value !== "string") return 0;
    const match = /^furniture-(\d+)$/.exec(value);
    if (!match) return 0;
    const number = Number(match[1]);
    return Number.isSafeInteger(number) && number > 0 ? number : 0;
  }

  function normalizeProgress(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const inventory = {};
    const rawInventory = source.inventory && typeof source.inventory === "object" && !Array.isArray(source.inventory)
      ? source.inventory
      : {};

    for (const item of CATALOG) {
      const count = Number(rawInventory[item.id]);
      if (Number.isSafeInteger(count) && count > 0) inventory[item.id] = Math.min(MAX_ITEM_COUNT, count);
    }

    const placements = [];
    const seenIds = new Set();
    let greatestId = 0;
    const rawPlacements = Array.isArray(source.placements) ? source.placements : [];
    for (const raw of rawPlacements) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const idNumber = placementNumber(raw.placementId);
      if (idNumber) greatestId = Math.max(greatestId, idNumber);
      const item = catalogById.get(raw.furnitureId);
      if (!item || !idNumber || seenIds.has(raw.placementId)) continue;
      seenIds.add(raw.placementId);
      const validCoordinates = Number.isSafeInteger(raw.gridX) && raw.gridX >= 0 && raw.gridX <= MAX_GRID_X &&
        Number.isSafeInteger(raw.gridY) && raw.gridY >= 0 && raw.gridY <= MAX_GRID_Y && validRotation(raw.rotation);
      if (!validCoordinates || placements.length >= MAX_PLACEMENTS) {
        const count = inventory[item.id] || 0;
        if (count < MAX_ITEM_COUNT) inventory[item.id] = count + 1;
        continue;
      }
      placements.push({
        placementId:raw.placementId,
        furnitureId:item.id,
        gridX:raw.gridX,
        gridY:raw.gridY,
        rotation:raw.rotation
      });
    }

    const requestedNext = Number(source.nextPlacementNumber);
    const nextPlacementNumber = Math.max(
      1,
      Number.isSafeInteger(requestedNext) && requestedNext > 0 ? requestedNext : 1,
      greatestId >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : greatestId + 1
    );
    return { inventory, placements, nextPlacementNumber:Math.min(Number.MAX_SAFE_INTEGER, nextPlacementNumber) };
  }

  function actionFailure(reason, progress) {
    return { ok:false, reason, progress:normalizeProgress(progress) };
  }

  function validGridPosition(gridX, gridY, rotation) {
    return Number.isSafeInteger(gridX) && gridX >= 0 && gridX <= MAX_GRID_X &&
      Number.isSafeInteger(gridY) && gridY >= 0 && gridY <= MAX_GRID_Y && validRotation(rotation);
  }

  function buyFurniture(value, cash, furnitureId) {
    const progress = normalizeProgress(value);
    const item = catalogById.get(furnitureId);
    if (!item) return actionFailure("unknown-furniture", progress);
    if (!Number.isFinite(Number(cash)) || Number(cash) < item.price) return actionFailure("insufficient-funds", progress);
    if ((progress.inventory[item.id] || 0) >= MAX_ITEM_COUNT) return actionFailure("inventory-capacity", progress);
    return {
      ok:true,
      progress:{ ...progress, inventory:{ ...progress.inventory, [item.id]:(progress.inventory[item.id] || 0) + 1 } },
      cashRemaining:Math.floor(Number(cash) - item.price),
      duration:item.purchaseMinutes
    };
  }

  function placeFurniture(value, furnitureId, gridX, gridY, rotation = 0) {
    const progress = normalizeProgress(value);
    const item = catalogById.get(furnitureId);
    if (!item) return actionFailure("unknown-furniture", progress);
    if (!(progress.inventory[item.id] > 0)) return actionFailure("not-owned", progress);
    if (progress.placements.length >= MAX_PLACEMENTS) return actionFailure("placement-capacity", progress);
    if (!validGridPosition(gridX, gridY, rotation) || progress.nextPlacementNumber >= Number.MAX_SAFE_INTEGER) {
      return actionFailure("invalid-placement", progress);
    }
    const placement = {
      placementId:"furniture-" + progress.nextPlacementNumber,
      furnitureId:item.id,
      gridX,
      gridY,
      rotation
    };
    const inventory = { ...progress.inventory };
    inventory[item.id] -= 1;
    if (!inventory[item.id]) delete inventory[item.id];
    return {
      ok:true,
      placement,
      progress:{
        ...progress,
        inventory,
        placements:[...progress.placements, placement],
        nextPlacementNumber:progress.nextPlacementNumber + 1
      }
    };
  }

  function moveFurniture(value, placementId, gridX, gridY, rotation) {
    const progress = normalizeProgress(value);
    const index = progress.placements.findIndex((placement) => placement.placementId === placementId);
    if (index < 0) return actionFailure("unknown-placement", progress);
    if (!validGridPosition(gridX, gridY, rotation)) return actionFailure("invalid-placement", progress);
    const placements = progress.placements.map((placement, currentIndex) => currentIndex === index
      ? { ...placement, gridX, gridY, rotation }
      : placement);
    return { ok:true, progress:{ ...progress, placements } };
  }

  function rotateFurniture(value, placementId) {
    const progress = normalizeProgress(value);
    const placement = progress.placements.find((entry) => entry.placementId === placementId);
    if (!placement) return actionFailure("unknown-placement", progress);
    return moveFurniture(progress, placementId, placement.gridX, placement.gridY, (placement.rotation + 90) % 360);
  }

  function pickupFurniture(value, placementId) {
    const progress = normalizeProgress(value);
    const placement = progress.placements.find((entry) => entry.placementId === placementId);
    if (!placement) return actionFailure("unknown-placement", progress);
    if ((progress.inventory[placement.furnitureId] || 0) >= MAX_ITEM_COUNT) return actionFailure("inventory-capacity", progress);
    const placements = progress.placements.filter((entry) => entry.placementId !== placementId);
    const inventory = { ...progress.inventory, [placement.furnitureId]:(progress.inventory[placement.furnitureId] || 0) + 1 };
    return { ok:true, progress:{ ...progress, inventory, placements } };
  }

  function getUseAction(furnitureId) {
    const action = catalogById.get(furnitureId)?.action;
    return action ? { ...action, needs:{ ...action.needs } } : null;
  }

  return Object.freeze({
    MAX_ITEM_COUNT, MAX_PLACEMENTS, CATALOG, createProgress, normalizeProgress,
    buyFurniture, placeFurniture, moveFurniture, rotateFurniture, pickupFurniture, getUseAction
  });
});
