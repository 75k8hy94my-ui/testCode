import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'game', 'game.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'game', 'game.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'game', 'index.html'), 'utf8');
const mapSource = fs.readFileSync(path.join(root, 'game', 'map-model.js'), 'utf8');
const overtakeSource = fs.readFileSync(path.join(root, 'game', 'traffic-overtake.js'), 'utf8');
const overtakeSafetySource = fs.readFileSync(path.join(root, 'game', 'traffic-overtake-safety.js'), 'utf8');
const homeFixtureSource = fs.readFileSync(path.join(root, 'game', 'home-fixtures.js'), 'utf8');

test('game keeps a timer fallback when requestAnimationFrame is unavailable', () => {
  assert.match(source, /const requestFrame = typeof window\.requestAnimationFrame === "function"/);
  assert.match(source, /window\.setTimeout\(\(\) => callback\(performance\.now\(\)\), 16\)/);
  assert.match(source, /requestFrame\(frame\)/);
});

test('game reports an unavailable canvas context instead of failing silently', () => {
  assert.match(source, /typeof canvas\.getContext === "function"/);
  assert.match(source, /Canvas API を利用できません/);
});

test('persistent HUD information is consolidated in the lower-left corner', () => {
  assert.match(html, /class="hud-info-stack"/);
  assert.match(css, /\.hud-info-stack\{[\s\S]*left:max\(12px,env\(safe-area-inset-left\)\)/);
  assert.match(css, /\.hud-info-stack\{[\s\S]*bottom:max\(14px,env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.hud-info-stack \.hud-card\{[\s\S]*position:relative/);
  assert.match(css, /\.hud-info-stack \.hud-card\{[\s\S]*top:auto/);
  assert.match(css, /\.hud-info-stack \.hud-card\{[\s\S]*transform:none/);
});

test('minimap remains independent in the upper-right and driving HUD no longer occupies top-center', () => {
  assert.match(css, /\.minimap-card\{[\s\S]*right:max\(12px,env\(safe-area-inset-right\)\)[\s\S]*top:max\(12px,env\(safe-area-inset-top\)\)/);
  assert.match(css, /\.hud-info-stack \.drive-card\{[\s\S]*text-align:left/);
  const finalLayout = css.slice(css.indexOf('Persistent HUD consolidation'));
  assert.doesNotMatch(finalLayout, /\.drive-card\{[^}]*left:50%/);
  assert.doesNotMatch(finalLayout, /\.day-card\{[^}]*left:50%/);
});

test('game defines the traffic signal state helper used by rendering and updates', () => {
  assert.match(source, /function signalStateAt\(worldX, worldY, orientation\)/);
  assert.match(source, /signalStateAt\(signal\.x, signal\.y, signal\.orientation\)/);
  assert.match(source, /signalStateAt\(wx, wy, "h"\)/);
  assert.match(source, /const hasHorizontal = incidentEdges\.some/);
  assert.match(source, /const hasVertical = incidentEdges\.some/);
  assert.match(source, /drawPedestrianSignal\(/);
});

test('game defines the ambient prop drawing helpers used by the city renderer', () => {
  assert.match(source, /function drawTree\(x, y, scale = 1\)/);
  assert.match(source, /function drawLamp\(x, y\)/);
  assert.match(source, /const normal = \{ x:-pose\.tangent\.y, y:pose\.tangent\.x \}/);
});

test('elevated rail becomes translucent only for the controlled actor below it', () => {
  assert.match(source, /const controlledActor = state\.player\.inVehicle \? personalCar : state\.player/);
  assert.match(source, /controlledActor\.y >= RAIL_Y - RAIL_CORRIDOR_HALF/);
  assert.match(source, /ctx\.globalAlpha = underRail \? 0\.46 : 1/);
});

test('game defines the saved-car road migration helper', () => {
  assert.match(source, /function migrateCarToCurrentRoadIfNeeded\(\)/);
  assert.match(source, /mapModel\.nearestRoad\(personalCar\.x, personalCar\.y, \{ vehicleOnly: true \}\)/);
});

test('citizen navigation uses typed map segments and persists a validated current segment', () => {
  assert.match(source, /pedestrianNavigation\?\.findRoute\(mapModel\.pedestrianNavigation/);
  assert.match(source, /routeSegmentIds:Array\.isArray\(ped\.routeSegmentIds\)/);
  assert.match(source, /segmentId:ped\.segmentId/);
  assert.match(source, /pedestrianSegmentPose\([\s\S]*pedestrianSegmentLaneOffset\(ped, segment\)/);
  assert.match(source, /mapModel\.pedestrianNavigation\.segmentsById\.get\(stored\.segmentId\)/);
});

test('pedestrians, vehicles, and rendering consume the same map crosswalk records', () => {
  assert.match(html, /crossing-control\.js\?v=/);
  assert.ok(html.indexOf('crossing-control.js') < html.indexOf('game.js'));
  assert.match(source, /for \(const crosswalk of mapModel\.crosswalks\)/);
  assert.match(source, /crossingControl\.assessPedestrian\(crosswalk/);
  assert.match(source, /crossingControl\.vehicleYieldDecision\(crosswalk/);
  assert.match(source, /crosswalk\.stopLines \|\| \[\]/);
  assert.match(source, /updateCrossingClaims\(\);\s*updateTraffic\(dt\)/);
});

test('NPC junction trajectory keeps the actual incoming edge after the route index advances', () => {
  assert.match(source, /car\.previousEdgeId = current\.id/);
  assert.match(source, /car\.previousDirectionSign = car\.directionSign/);
  assert.match(source, /distanceFromStart <= window && car\.previousEdgeId/);
  assert.match(source, /mapModel\.getEdge\(car\.previousEdgeId\)/);
});

test('typed sidewalk pedestrians keep following gaps and can sidestep instead of deadlocking', () => {
  assert.match(source, /other\.segmentId !== ped\.segmentId/);
  assert.match(source, /other\.segmentDirection !== ped\.segmentDirection/);
  assert.match(source, /ped\.segmentAvoidanceTarget/);
  assert.match(source, /pedestrianSegmentLaneOffset\(ped, segment\)/);
});

test('home interaction selection ignores decorative fixtures and reads the shared interaction geometry', () => {
  const interaction = source.slice(source.indexOf('function nearestHomeInteraction()'), source.indexOf('function preparePackedMeal('));
  assert.match(interaction, /const interaction = fixture\.interaction/);
  assert.match(interaction, /if \(!interaction\) continue/);
});

test('NPC cars commit physical junction curves and collision poses from one trajectory function', () => {
  assert.match(html, /vehicle-trajectory\.js/);
  assert.match(source, /function trafficTurnCurve\(car, along\)/);
  assert.match(source, /vehicleTrajectory\.createJunctionCurve\(incomingTangent, outgoingTangent, window\)/);
  assert.match(source, /vehicleTrajectory\.withLateralVelocity/);
  assert.match(source, /car\.lateralVelocity = result\.complete \|\| dt <= 0 \? 0 : \(car\.laneOffset - previousOffset\) \/ dt/);
  assert.match(source, /const turnPose = trafficTurnCurve\(car, along\)/);
  assert.match(source, /car\.x = steeredPose\.x;[\s\S]{0,100}car\.y = steeredPose\.y/);
  assert.match(source, /const hitVehicle = vehicleIntersectsAnyVehicle\(car\)/);
});

test('action and help panels lock only player input while the world update continues', () => {
  const update = source.slice(source.indexOf('function update(dt)'), source.indexOf('function frame('));
  assert.match(update, /if \(state\.paused\) return/);
  assert.doesNotMatch(update, /state\.paused \|\| !actionSheet\.hidden \|\| !helpPanel\.hidden/);
  assert.match(update, /const playerInputLocked = !actionSheet\.hidden \|\| !helpPanel\.hidden/);
  assert.match(update, /updateTraffic\(dt\);[\s\S]*advanceTime\(gameMinutes, true, false\);[\s\S]*updatePedestrians\(dt, gameMinutes\)/);
});

test('home walk and run use the requested two-times multiplier without changing street speeds', () => {
  assert.match(source, /const HOME_MOVEMENT_SPEED_MULTIPLIER = 2/);
  const homeMovement = source.slice(source.indexOf('function updatePlayerAtHome('), source.indexOf('function nearestHomeInteraction('));
  assert.match(homeMovement, /\(running \? RUN_SPEED : WALK_SPEED\) \* HOME_MOVEMENT_SPEED_MULTIPLIER/);
  const streetMovement = source.slice(source.indexOf('function updatePlayerOnFoot('), source.indexOf('function updatePlayerInVehicle('));
  assert.match(streetMovement, /running \? RUN_SPEED : WALK_SPEED/);
  assert.doesNotMatch(streetMovement, /HOME_MOVEMENT_SPEED_MULTIPLIER/);
});

test('conversation freezes only its citizen and always releases the lock when the sheet closes', () => {
  assert.match(source, /let conversationCitizenId = null/);
  assert.match(source, /conversationCitizenId = ped\?\.id \|\| null/);
  assert.match(source, /conversationCitizenId = citizen\?\.id \|\| null/);
  assert.match(source, /function closeActionSheet\(\)[\s\S]*conversationCitizenId = null/);
  assert.match(source, /if \(ped\.id === conversationCitizenId\) continue/);
  assert.match(source, /if \(ped\.id === conversationCitizenId\) continue/);
});

test('empty interaction is silent and player animation follows actual displacement', () => {
  const action = source.slice(source.indexOf('function performAction()'), source.indexOf('function enterCar()'));
  assert.doesNotMatch(action, /近くに利用できるものはありません/);
  assert.match(source, /state\.player\.motion\?\.moving/);
  assert.match(source, /moving \? "walk" : "idle"/);
});

test('game surfaces uncaught runtime errors on the game surface', () => {
  assert.match(source, /window\.addEventListener\("error"/);
  assert.match(source, /window\.addEventListener\("unhandledrejection"/);
  assert.match(source, /ゲームの実行中にエラーが発生しました/);
});

test('game loads and validates the shared Japanese map model before runtime start', () => {
  assert.match(html, /<script src="\.\/map-model\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('map-model.js') < html.indexOf('game.js'));
  assert.match(source, /CityDaysMapModel\?\.createMapModel\?\.\(\)/);
  assert.match(source, /mapModel\.validate\(\)/);
});

test('world weather follows the deterministic game clock and rain exposure respects shelter', () => {
  const weatherIndex = html.indexOf('weather-system.js');
  assert.notEqual(weatherIndex, -1);
  assert.ok(weatherIndex < html.indexOf('game.js'));
  assert.match(source, /function syncWeather\(announce = false\)/);
  assert.match(source, /weatherSystem\.getWeatherAt\(state\.day, state\.minute\)/);
  assert.match(source, /weatherSystem\.getOutdoorHygienePenalty\(/);
  assert.match(source, /umbrellaOwned:\s*state\.umbrellaOwned/);
  assert.match(source, /syncWeather\(\);/);
  assert.doesNotMatch(source, /Math\.floor\(performance\.now\(\) \/ 1000\)/);
});

test('wardrobe model is loaded before runtime and is normalized in snapshots', () => {
  const wardrobeScript = html.indexOf('wardrobe.js');
  assert.notEqual(wardrobeScript, -1);
  assert.ok(wardrobeScript < html.indexOf('game.js'));
  assert.match(source, /const wardrobeModel = globalThis\.CityDaysWardrobe/);
  assert.match(source, /wardrobe:wardrobeModel\.createWardrobe\(\)/);
  assert.match(source, /wardrobe:wardrobeModel\.normalizeWardrobe\(state\.wardrobe\)/);
  assert.match(source, /state\.wardrobe = wardrobeModel\.normalizeWardrobe\(saved\.wardrobe\)/);
  assert.match(html, /game\.js\?v=20260930-pedestrian-vehicle-deadlock-1/);
});

test('arcade progress is loaded before the game and migrates safely through snapshots', () => {
  const arcadeScript = html.indexOf('arcade-games.js');
  assert.notEqual(arcadeScript, -1);
  assert.ok(arcadeScript < html.indexOf('game.js'));
  assert.match(source, /const arcadeGamesModel = globalThis\.CityDaysArcadeGames/);
  assert.match(source, /arcade:arcadeGamesModel\.createProgress\(\)/);
  assert.match(source, /arcade:arcadeGamesModel\.normalizeProgress\(state\.arcade\)/);
  assert.match(source, /state\.arcade = arcadeGamesModel\.normalizeProgress\(\{ \.\.\.saved\.arcade, activePlay:false \}\)/);
  assert.match(source, /place\.id === "arcade"/);
  assert.match(source, /arcadeGamesModel\.startPlay\(state\.arcade, state\.cash\)/);
});

test('arcade play uses an accessible responsive dialog and freezes normal world simulation', () => {
  const arcade = html.slice(html.indexOf('id="arcadePanel"'), html.indexOf('id="helpPanel"'));
  assert.match(arcade, /aria-modal="true"[\s\S]*role="dialog"/);
  for (const control of ['arcadeLeft','arcadeRight','arcadeGrab','arcadeReturn']) assert.match(arcade, new RegExp('id="' + control + '"'));
  assert.match(source, /if \(!arcadePanel\.hidden\) return;\s*if \(state\.paused/);
  assert.match(source, /arcadeGame\.mode === "aiming" && \["arrowleft", "a"\]/);
  assert.match(source, /arcadeGame\.mode === "aiming" && \["arrowright", "d"\]/);
  assert.match(source, /arcadeGame\.mode === "aiming" && \["enter", " "\]/);
  assert.match(css, /\.arcade-header button,\.arcade-controls button[^}]*min-height:46px/);
  assert.match(css, /\.arcade-prizes\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
});

test('supermarket clothing purchases revalidate ownership and funds before charging or advancing time', () => {
  const storeStart=source.indexOf('if (place.id === "store")');
  const storeEnd=source.indexOf('if (place.id === "fuel-station")',storeStart);
  const store=source.slice(storeStart,storeEnd);
  const purchaseStart=store.indexOf('for (const outfit of wardrobeModel.CATALOG');
  const purchaseEnd=store.indexOf('addChoice("釣り餌を買う"',purchaseStart);
  const outfitPurchase=store.slice(purchaseStart,purchaseEnd);
  assert.notEqual(purchaseStart,-1);
  assert.match(outfitPurchase, /wardrobeModel\.buyOutfit\(/);
  assert.ok(outfitPurchase.indexOf('if (!result.ok)') < outfitPurchase.indexOf('state.cash = result.cashRemaining'));
  assert.ok(outfitPurchase.indexOf('state.cash = result.cashRemaining') < outfitPurchase.indexOf('advanceTime(result.duration)'));
  assert.match(outfitPurchase, /購入済み/);
});

test('home closet equips only owned outfits at home and both player scenes use the same active appearance', () => {
  assert.match(homeFixtureSource, /id:"closet", label:"クローゼット"/);
  assert.match(source, /for \(const fixture of HOME_FIXTURES\)/);
  assert.match(source, /homeFixturesModel\.collidesCircle\(x, y, radius\)/);
  const closetStart=source.indexOf('fixture.id === "closet"');
  const closetEnd=source.indexOf('fixture.id === "pet"',closetStart);
  const closet=source.slice(closetStart,closetEnd);
  assert.match(closet, /wardrobeModel\.CATALOG/);
  assert.match(closet, /wardrobe\.ownedOutfitIds\.includes\(item\.id\)/);
  assert.match(closet, /equipPlayerOutfit\(outfit\.id\)/);
  const equipStart=source.indexOf('function equipPlayerOutfit(');
  const equipEnd=source.indexOf('function openHomeFixture(',equipStart);
  const equip=source.slice(equipStart,equipEnd);
  assert.match(equip, /state\.player\.inHome/);
  assert.match(equip, /nearestHomeInteraction\(\)\?\.target\?\.id !== "closet"/);
  assert.match(equip, /wardrobeModel\.equipOutfit\(/);
  assert.ok(equip.indexOf('if (!result.ok)') < equip.indexOf('advanceTime(result.duration)'));
  assert.ok(equip.indexOf('advanceTime(result.duration)') < equip.indexOf('openHomeFixture(HOME_FIXTURES.find((fixture) => fixture.id === "closet"))'));
  const storeStart=source.indexOf('for (const outfit of wardrobeModel.CATALOG.filter((item) => item.id !== wardrobeModel.DEFAULT_OUTFIT_ID))');
  const storeEnd=source.indexOf('addChoice("釣り餌を買う"',storeStart);
  const purchase=source.slice(storeStart,storeEnd);
  assert.ok(purchase.indexOf('advanceTime(result.duration)') < purchase.indexOf('openPlace(PLACES.find((place) => place.id === "store"))'));
  assert.match(source, /function playerAppearance\(\)/);
  const street=source.slice(source.indexOf('function drawPlayer()'),source.indexOf('function drawPlayerUmbrella()'));
  const home=source.slice(source.indexOf('function drawHomePlayer()'),source.indexOf('function drawStreetLightsGlow()'));
  assert.match(street, /playerAppearance\(\)/);
  assert.match(home, /playerAppearance\(\)/);
  assert.doesNotMatch(street, /PLAYER_APPEARANCE/);
  assert.doesNotMatch(home, /PLAYER_APPEARANCE/);
  const npc=source.slice(source.indexOf('function drawNpc('),source.indexOf('function drawPedestrians('));
  const pedestrians=source.slice(source.indexOf('function drawPedestrians('),source.indexOf('function drawPlayer('));
  assert.match(npc, /npc\.appearance/);
  assert.match(pedestrians, /ped\.appearance/);
  assert.doesNotMatch(npc + pedestrians, /playerAppearance\(/);
});

test('umbrella purchase is one-time, snapshot-safe, and only protects an outdoor pedestrian', () => {
  assert.match(source, /umbrellaOwned:false/);
  assert.match(source, /state\.umbrellaOwned = saved\.umbrellaOwned === true/);
  assert.match(source, /umbrellaOwned:state\.umbrellaOwned === true/);
  assert.match(source, /function buyUmbrella\(\)/);
  const purchase = source.slice(source.indexOf('function buyUmbrella()'), source.indexOf('function chargeRentIfNeeded()'));
  assert.match(purchase, /state\.cash < 600/);
  assert.match(purchase, /already-owned/);
  assert.match(purchase, /state\.cash -= 600/);
  assert.match(purchase, /advanceTime\(5\)/);
  assert.match(source, /function isPlayerUsingUmbrella\(\)/);
  assert.match(source, /!state\.player\.inHome && !state\.player\.inVehicle && !state\.player\.inTrain/);
  assert.match(source, /if \(isPlayerUsingUmbrella\(\)\) drawPlayerUmbrella\(\)/);
  assert.match(source, /const screen = worldToScreen\(state\.player\.x, state\.player\.y\)/);
  assert.match(source, /buyUmbrellaForTest\(\)/);
  assert.match(source, /decayNeedsForTest\(minutes\)/);
});

test('phone snapshot receives shared forecast rows and only claims active umbrella protection outdoors', () => {
  const snapshot = source.slice(source.indexOf('function phoneModelSnapshot()'), source.indexOf('function updateSmartphone()'));
  assert.match(snapshot, /forecast:weatherSystem\.getForecast\(state\.day, state\.minute\)/);
  assert.match(snapshot, /umbrellaProtecting:isPlayerUsingUmbrella\(\)/);
  assert.match(snapshot, /umbrellaOwned:state\.umbrellaOwned === true/);
  const phoneSource = fs.readFileSync(path.join(root, 'game', 'phone-system.js'), 'utf8');
  assert.match(phoneSource, /model\.forecast/);
  assert.doesNotMatch(phoneSource, /\+3時間[\s\S]*☀ 晴れ/);
});

test('snapshot clock restoration preserves midnight and debug restoration can exercise legacy ownership', () => {
  assert.match(source, /saved\.minute != null && Number\.isFinite\(savedMinute\) \? clamp\(savedMinute, 0, 1439\.99\) : 480/);
  const hook = source.slice(source.indexOf('function installSocialNpcTestHook()'), source.indexOf('function togglePause()'));
  assert.match(hook, /applyGameSnapshotForTest\(saved\)/);
});


test('game loads the sprite character renderer before the game runtime', () => {
  assert.match(html, /<script src="\.\/character-renderer\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('map-model.js') < html.indexOf('character-renderer.js'));
  assert.ok(html.indexOf('character-renderer.js') < html.indexOf('game.js'));
  assert.match(source, /const characterRenderer = globalThis\.CityDaysCharacterRenderer/);
  assert.match(source, /characterRenderer\.createAppearance\(index \+ 41, profile\)/);
  assert.match(source, /characterRenderer\.draw\(ctx,/);
  assert.doesNotMatch(source, /function drawPersonSpriteAtScreen\(/);
  assert.doesNotMatch(source, /function drawHumanSegment\(/);
});

test('all person categories share the same character renderer', () => {
  assert.match(source, /ped\.appearance,[\s\S]*ped\.state/);
  assert.match(source, /PLAYER_APPEARANCE,[\s\S]*moving \? "walk" : "idle"/);
  assert.match(source, /npc\.appearance,[\s\S]*npc\.state \|\| "idle"/);
  assert.match(source, /npc\.phase = citizen\.phase/);
  assert.match(source, /npc\.state = citizen\.state/);
});

test('packed meals expire with game time and survive snapshot migration without trusting saved data', () => {
  assert.match(source, /packedMeals:packedMealsModel\.createInventory\(\)/);
  assert.match(source, /packedMealsModel\.expire\(state\.packedMeals,\s*communityGardenModel\.absoluteMinute\(state\.day, Math\.floor\(state\.minute\)\)\)/);
  assert.match(source, /packedMeals:packedMealsModel\.normalizeInventory\(state\.packedMeals\)/);
  assert.match(source, /state\.packedMeals\s*=\s*packedMealsModel\.normalizeInventory\(saved\.packedMeals\)/);
});

test('kitchen preparation revalidates recipe resources and capacity without granting meal effects early', () => {
  const kitchen = source.slice(source.indexOf('if (fixture.id === "kitchen")'), source.indexOf('} else if (fixture.id === "pet")'));
  assert.match(kitchen, /弁当を作る/);
  assert.match(kitchen, /弁当を作る/);
  assert.match(source, /function preparePackedMeal\(recipeId\)/);
  assert.match(source, /function consumePackedMeal\(mealId\)/);
  assert.match(source, /advanceTimeForTest\(minutes\)/);
  const prepare = source.slice(source.indexOf('function preparePackedMeal('), source.indexOf('function consumePackedMeal('));
  assert.doesNotMatch(prepare, /state\.needs\[[^\]]+\]\s*\+/);
});

test('packed meal consumption is restricted to walking and applies authored effects after ordinary time decay', () => {
  const consume = source.slice(source.indexOf('function consumePackedMeal('), source.indexOf('function applyLibraryRead('));
  assert.match(consume, /state\.player\.inVehicle\s*\|\|\s*state\.player\.inTrain/);
  assert.match(consume, /packedMealsModel\.eat/);
  assert.ok(consume.indexOf('advanceTime(15)') < consume.indexOf('Object.entries(result.recipe.effects)'));
  assert.match(consume, /updateSmartphone\(\)/);
});

test('home handcraft progress defaults safely, persists in snapshots, and loads its model before runtime', () => {
  assert.match(html, /home-crafting\.js\?v=[^"]+/);
  assert.ok(html.indexOf('social-npc-system.js') < html.indexOf('home-crafting.js'));
  assert.ok(html.indexOf('home-crafting.js') < html.indexOf('game.js'));
  assert.match(source, /homeCrafting:homeCraftingModel\.createProgress\(\)/);
  assert.match(source, /homeCrafting:homeCraftingModel\.normalizeProgress\(state\.homeCrafting\)/);
  assert.match(source, /state\.homeCrafting\s*=\s*homeCraftingModel\.normalizeProgress\(saved\.homeCrafting\)/);
});

test('supermarket sells validated handcraft kits and the new home worktable consumes recipes without applying needs', () => {
  assert.match(homeFixtureSource, /id:"worktable",\s*label:"作業机"/);
  const storeStart=source.indexOf('if (place.id === "store")');
  const storeEnd=source.indexOf('if (place.id === "fuel-station")',storeStart);
  assert.match(source.slice(storeStart,storeEnd), /手芸キットを買う/);
  assert.match(source.slice(storeStart,storeEnd), /homeCraftingModel\.buyKitPack/);
  const fixtureStart=source.indexOf('function openHomeFixture(');
  const fixtureEnd=source.indexOf('function openPlace(',fixtureStart);
  const fixtureSource=source.slice(fixtureStart,fixtureEnd);
  assert.match(fixtureSource, /fixture\.id === "worktable"/);
  assert.match(fixtureSource, /craftHomeItem\(recipe\.id\)/);
  assert.match(source, /function craftHomeItem\(recipeId\)/);
  const craft=source.slice(source.indexOf('function craftHomeItem('),source.indexOf('function applyHomeMeal('));
  assert.match(craft, /homeCraftingModel\.craft/);
  assert.doesNotMatch(craft, /state\.needs\[[^\]]+\]\s*[+\-]=/);
});

test('named NPC conversations offer owned handmade gifts and commit only validated same-day gifts', () => {
  const npcStart=source.indexOf('function openNpc(npc)');
  const npcEnd=source.indexOf('function nearestInteraction()',npcStart);
  const npcFlow=source.slice(npcStart,npcEnd);
  assert.match(npcFlow, /homeCraftingModel\.normalizeProgress\(state\.homeCrafting\)/);
  assert.match(npcFlow, /贈る/);
  assert.match(source, /function performNpcGift\(npcId, itemId\)/);
  const gift=source.slice(source.indexOf('function performNpcGift('),npcStart);
  assert.match(gift, /homeCraftingModel\.giveGift/);
  assert.match(gift, /state\.player\.inVehicle\s*\|\|\s*state\.player\.inTrain\s*\|\|\s*state\.player\.inHome/);
  assert.ok(gift.indexOf('homeCraftingModel.giveGift') < gift.indexOf('advanceTime(10)'));
  assert.match(gift, /relationshipAffinityGain/);
  assert.match(gift, /npc\.friendship = clamp/);
  const rejected=gift.slice(gift.indexOf('if (!result.ok)'),gift.indexOf('state.homeCrafting = result.progress'));
  assert.doesNotMatch(rejected, /advanceTime\(10\)/);
});

test('localhost-only test hook exposes crafted inventory, relationship outcomes, and validated repeat-gift action', () => {
  const hook=source.slice(source.indexOf('function installSocialNpcTestHook()'),source.indexOf('function togglePause()'));
  assert.match(hook, /homeCrafting:homeCraftingModel\.normalizeProgress\(state\.homeCrafting\)/);
  assert.match(hook, /npcFriendship:\{ \.\.\.socialNpcState\.friendship \}/);
  assert.match(hook, /relationships:\{ \.\.\.socialNpcState\.relationships \}/);
  assert.match(hook, /giveGiftForTest\(npcId, itemId\)/);
  assert.match(hook, /return performNpcGift\(npcId, itemId\)/);
});

test('localhost-only test hook can advance game time together with citizen schedules', () => {
  const hook=source.slice(source.indexOf('function installSocialNpcTestHook()'),source.indexOf('function togglePause()'));
  assert.match(hook, /advanceWorldTimeForTest\(minutes\)/);
  assert.match(hook, /advanceTime\(minutes, false, true\)/);
});

test('localhost-only NPC positioning leaves room for moving pedestrians before interaction input', () => {
  const hook=source.slice(source.indexOf('movePlayerNear(npcId)'),source.indexOf('giveGiftForTest',source.indexOf('movePlayerNear(npcId)')));
  assert.match(hook, /for \(const radius of \[18, 24, 32, 40\]\)/);
  assert.match(hook, /citizen\.state === "inside"\) return false/);
});

test('the authored catalog, not generated defaults, supplies the first ten citizen identities', () => {
  assert.match(source, /const socialNpcSystem = globalThis\.CityDaysSocialNpcSystem/);
  assert.match(source, /const socialProfile = index < socialNpcSystem\.catalog\.length \? socialNpcSystem\.catalog\[index\] : null/);
  assert.match(source, /const specialNpcId = socialProfile\?\.id \|\| null/);
  assert.match(source, /const gender = socialProfile\?\.gender \|\|/);
  assert.match(source, /let age = socialProfile\?\.age \|\|/);
  assert.match(source, /let jobType = socialProfile\?\.jobType \|\| null/);
  assert.match(source, /const CITIZEN_COUNT = 76/);
});

test('all ten social NPC runtime records retain their citizen links and original three map anchors', () => {
  assert.match(source, /const NPCS = socialNpcSystem\.catalog\.map\(\(profile, index\) =>/);
  assert.match(source, /citizenId: "citizen-" \+ String\(index \+ 1\)\.padStart\(3, "0"\)/);
  assert.match(source, /aoi: \{ x:PARK\.x - 60, y:PARK\.y \}/);
  assert.match(source, /sora: \{ x:CAFE\.x \+ 72, y:CAFE\.y - 58 \}/);
  assert.match(source, /mei: \{ x:LIBRARY\.x, y:LIBRARY\.y - 45 \}/);
});

test('social candidate bias is applied after ordinary choices and invitations use pedestrian routes', () => {
  assert.match(source, /socialNpcSystem\.getSocialActionBias\(/);
  assert.match(source, /action:"social:" \+ candidate\.id/);
  assert.match(source, /function requestCitizenSocialActivity\(/);
  assert.match(source, /ped\.socialActivityRequest = \{ \.\.\.request \}/);
  assert.match(source, /buildPedestrianPlan\(ped, startNodeId, targetNodeId\)/);
  assert.match(source, /expiresAt/);
  assert.match(source, /ped\.socialActivityRequest = null/);
});

test('special NPC conversations resolve through the shared policy and affect their linked citizen', () => {
  assert.match(source, /socialNpcSystem\.getConversation\(/);
  assert.match(source, /socialNpcSystem\.resolveConversation\(/);
  assert.match(source, /requestCitizenSocialActivity\(citizen, result\.activityRequest\)/);
  assert.match(source, /const friendshipDelta = result\.activityRequest && !accepted \? 0 : result\.friendshipDelta/);
  assert.match(source, /npc\.friendship = clamp\(npc\.friendship \+ friendshipDelta, 0, 100\)/);
  assert.match(source, /socialNpcState\.recentTopics\[npc\.id\] = result\.topic/);
});

test('game snapshots persist canonical social state and still read legacy friendship data', () => {
  assert.match(source, /socialNpc:\s*\{/);
  assert.match(source, /friendship:\s*\{ \.\.\.socialNpcState\.friendship \}/);
  assert.match(source, /relationships:\s*\{ \.\.\.socialNpcState\.relationships \}/);
  assert.match(source, /recentTopics:\s*\{ \.\.\.socialNpcState\.recentTopics \}/);
  assert.match(source, /socialNpcSystem\.normalizeState\(saved\.socialNpc, saved\.friends\)/);
  assert.match(source, /npc\.friendship = socialNpcState\.friendship\[npc\.id\]/);
});

test('headless gameplay instrumentation is local-only and exposes test-only actor controls', () => {
  assert.match(source, /function installSocialNpcTestHook\(\)/);
  assert.match(source, /location\.hostname !== "localhost" && location\.hostname !== "127\.0\.0\.1"/);
  assert.match(source, /searchParams\.has\("socialNpcDebug"\)/);
  assert.match(source, /__CityDaysSocialNpcTest/);
  assert.match(source, /minute:state\.minute/);
  assert.match(source, /skills:\{ \.\.\.state\.communityCenter\.skills \}/);
  assert.match(source, /movePlayerNear\(npcId\)/);
  assert.match(source, /movePlayerNearPlace\(placeId, avoidNearbyActors = false\)/);
  assert.match(source, /movePlayerToHomeFixture\(fixtureId\)/);
  assert.match(source, /setMinuteForTest\(minute\)/);
  assert.match(source, /routeEdgeIds:Array\.isArray\(citizen\.routeEdgeIds\)/);
});

test('pet companion model loads before runtime and survives time and save migration', () => {
  assert.match(html, /<script src="\.\/pet-companion\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('pet-companion.js') < html.indexOf('game.js'));
  assert.match(source, /petCompanionModel\.advance\(state\.petCompanion, minutes\)/);
  assert.match(source, /petCompanion:s*petCompanionModel\.normalizeProgress\(state\.petCompanion\)/);
  assert.match(source, /state\.petCompanion\s*=\s*petCompanionModel\.normalizeProgress\(saved\.petCompanion\)/);
  assert.match(source, /petCompanion:petCompanionModel\.createProgress\(\)/);
});

test('animal shelter actions revalidate hours and atomic adoption or food results', () => {
  const shelter = source.slice(source.indexOf('if (place.id === "pet-shelter")'), source.indexOf('if (place.id === "public-bath")'));
  assert.match(shelter, /petCompanionModel\.isShelterOpen\(Math\.floor\(state\.minute\)\)/);
  assert.match(shelter, /petCompanionModel\.adopt\(state\.petCompanion, state\.cash, species\.id, Math\.floor\(state\.minute\)\)/);
  assert.match(shelter, /petCompanionModel\.buyFoodPack\(state\.petCompanion, state\.cash, Math\.floor\(state\.minute\)\)/);
  assert.match(shelter, /state\.cash\s*=\s*result\.cashRemaining/);
  assert.match(shelter, /state\.petCompanion\s*=\s*result\.progress/);
  assert.match(shelter, /advanceTime\(result\.duration\)/);
});

test('home pet care is available only to an owner and uses validated model transitions', () => {
  assert.match(source, /if \(fixture\.id === "pet" && !state\.petCompanion\.pet\) continue/);
  const care = source.slice(source.indexOf('fixture.id === "pet"'), source.indexOf('fixture.id === "tv"'));
  assert.match(care, /petCompanionModel\.feed\(state\.petCompanion\)/);
  assert.match(care, /petCompanionModel\.play\(state\.petCompanion\)/);
  assert.match(care, /petCompanionModel\.cuddle\(state\.petCompanion\)/);
  assert.match(care, /空腹|お腹/);
});

test('pet is drawn in the home interior only and its read-only phone projection is connected', () => {
  const interior = source.slice(source.indexOf('function drawHomeInterior()'), source.indexOf('function drawHomePlayer()'));
  const cityRenderer = source.slice(source.indexOf('function render()'), source.indexOf('function frame('));
  assert.match(interior, /drawHomePet\(state\.petCompanion\.pet\)/);
  assert.match(source, /function drawHomePet\(pet\)/);
  assert.doesNotMatch(cityRenderer, /drawHomePet\(/);
  const phoneSnapshot = source.slice(source.indexOf('function phoneModelSnapshot()'), source.indexOf('function setPhoneWaypoint('));
  assert.match(phoneSnapshot, /petCompanion\s*:/);
  assert.match(phoneSnapshot, /petCompanionModel\.getCondition\(state\.petCompanion\)/);
});

test('supermarket prepared meals load, persist daily stock, and join the existing carry-meal flow', () => {
  assert.ok(html.indexOf('store-prepared-food.js') < html.indexOf('game.js'));
  assert.match(source, /const storePreparedFoodModel = globalThis\.CityDaysStorePreparedFood/);
  assert.match(source, /storePreparedFood:storePreparedFoodModel\.createInventory\(\)/);
  assert.match(source, /storePreparedFood:storePreparedFoodModel\.normalizeInventory\(state\.storePreparedFood, state\.day\)/);
  assert.match(source, /state\.storePreparedFood = storePreparedFoodModel\.normalizeInventory\(saved\.storePreparedFood, state\.day\)/);
  const storeStart=source.indexOf('if (place.id === "store")');
  const storeEnd=source.indexOf('if (place.id === "fuel-station")',storeStart);
  assert.match(source.slice(storeStart,storeEnd), /storePreparedFoodModel\.listMenu/);
  assert.match(source, /function buyPreparedFood\(itemId\)/);
  assert.match(source, /buyPreparedFoodForTest\(itemId\)/);
});

test('rail fares load before the game, migrate snapshots, and gate station boarding through ticket machines', () => {
  assert.ok(html.indexOf('rail-transit.js') < html.indexOf('game.js'));
  assert.match(source, /const railTransitModel = globalThis\.CityDaysRailTransit/);
  assert.match(source, /railTransit:railTransitModel\.createProgress\(\)/);
  assert.match(source, /railTransit:railTransitModel\.normalizeProgress\(state\.railTransit, state\.day\)/);
  assert.match(source, /state\.railTransit = railTransitModel\.normalizeProgress\(saved\.railTransit, state\.day\)/);
  assert.match(source, /function openStation\(station, train\)/);
  assert.match(source, /function buyRailFare\(kind\)/);
  assert.match(source, /const fare = railTransitModel\.board\(state\.railTransit, state\.day\)/);
  assert.match(source, /type:"station"/);
  assert.match(source, /openStationForTest\(stationId\)/);
  assert.match(source, /setTrainAtStationForTest\(stationId\)/);
});

test('dog walking is persisted, follows the outdoor trail, and has guarded start and home completion', () => {
  assert.match(html, /<script src="\.\/pet-walk\.js\?v=20260929-pet-walk-2"><\/script>/);
  assert.ok(html.indexOf('pet-walk.js') < html.indexOf('game.js'));
  assert.match(source, /petWalkModel\.normalizeWalkState\(saved\.petWalk/);
  assert.match(source, /playerPosition:\{ x:state\.player\.x, y:state\.player\.y \}/);
  assert.match(source, /petWalk:petWalkModel\.normalizeWalkState\(state\.petWalk/);
  assert.match(source, /addChoice\("犬の散歩へ出る"/);
  assert.match(source, /function startDogWalk\(/);
  assert.match(source, /petCompanionModel\.completeWalk\(state\.petCompanion/);
  assert.match(source, /distance\(state\.player\.x, state\.player\.y, state\.petWalk\.petX, state\.petWalk\.petY\) > 90/);
  assert.match(source, /function updatePetWalk\(/);
  assert.match(source, /petWalkModel\.recordPlayerPosition\(/);
  assert.match(source, /petWalkModel\.advanceFollower\(/);
  assert.match(source, /function enterCar\(\) \{[\s\S]*?if \(state\.petWalk\.active\)/);
  assert.match(source, /function boardTrain\(train, station\) \{[\s\S]*?if \(state\.petWalk\.active\)/);
  assert.match(source, /function drawPetFollower\(\)[\s\S]*?worldToScreen\(state\.petWalk\.petX, state\.petWalk\.petY\)/);
  assert.match(source, /drawPetFollower\(\);\s*drawPlayer\(\);/);
  assert.match(source, /__CityDaysSocialNpcTest/);
  assert.match(source, /petWalk:/);
});

test('game loads the community center schedule model before the runtime', () => {
  assert.match(html, /<script src="\.\/community-center\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('community-center.js') < html.indexOf('game.js'));
});

test('library reading model loads before runtime and legacy saves receive an empty shelf', () => {
  assert.match(html,/ <script src="\.\/library-reading\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('library-reading.js') < html.indexOf('game.js'));
  assert.match(source,/const libraryReadingModel = globalThis\.CityDaysLibraryReading/);
  assert.match(source,/libraryReading:libraryReadingModel\.createProgress\(\)/);
  assert.match(source,/libraryReading:libraryReadingModel\.normalizeProgress\(state\.libraryReading\)/);
  assert.match(source,/state\.libraryReading = libraryReadingModel\.normalizeProgress\(saved\.libraryReading\)/);
});

test('library loans can be borrowed and returned while chapter reads are revalidated at the point of action', () => {
  const libraryStart=source.indexOf('if (place.id === "library")');
  const libraryEnd=source.indexOf('if (place.id === "community-center")',libraryStart);
  const libraryActions=source.slice(libraryStart,libraryEnd);
  assert.match(libraryActions,/libraryReadingModel\.borrow\(state\.libraryReading,\s*book\.id\)/);
  assert.match(libraryActions,/libraryReadingModel\.returnBook\(state\.libraryReading,\s*book\.id\)/);
  assert.match(libraryActions,/applyLibraryRead\(book\.id,\s*true\)/);
  const read=source.slice(source.indexOf('function applyLibraryRead('),source.indexOf('function homeShower(',source.indexOf('function applyLibraryRead(')));
  assert.match(read,/libraryReadingModel\.readChapter\(state\.libraryReading,\s*bookId\)/);
  assert.ok(read.indexOf('if (!result.ok)') < read.indexOf('advanceTime(45)'));
  assert.match(read,/state\.needs\.fun \+= 7/);
  assert.match(read,/const reward = result\.completionReward/);
  assert.match(read,/reward\.skill/);
  assert.match(read,/reward\.fun/);
  assert.match(read,/state\.communityCenter\.skills\[reward\.skill\]/);
});

test('home sofa adds borrowed-book reading without removing normal rest', () => {
  const sofaStart=source.indexOf('} else if (fixture.id === "sofa")');
  const sofaEnd=source.indexOf('} else if (fixture.id === "tv")',sofaStart);
  const sofa=source.slice(sofaStart,sofaEnd);
  assert.match(sofa,/libraryReadingModel\.normalizeProgress\(state\.libraryReading\)/);
  assert.match(sofa,/applyLibraryRead\(book\.id,\s*false\)/);
  assert.match(sofa,/addChoice\("のんびりする"/);
});

test('community garden model loads before game runtime and progresses with absolute game time', () => {
  assert.match(html, /<script src="\.\/community-garden\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('community-garden.js') < html.indexOf('game.js'));
  assert.match(html, /<script src="\.\/game\.js\?v=[^"]+"><\/script>/);
  assert.match(source, /const communityGardenModel = globalThis\.CommunityGarden/);
  assert.match(source, /communityGardenModel\.advance\([\s\S]{0,100}communityGardenModel\.absoluteMinute\(state\.day, Math\.floor\(state\.minute\)\)\s*\)/);
});

test('store and park expose validated garden actions and snapshots preserve legacy defaults and garden state', () => {
  assert.match(source, /communityGardenModel\.buySeedPack\(state\.garden, state\.cash\)/);
  assert.match(source, /communityGardenModel\.plant\(state\.garden, communityGardenModel\.absoluteMinute/);
  assert.match(source, /communityGardenModel\.water\(state\.garden, communityGardenModel\.absoluteMinute/);
  assert.match(source, /communityGardenModel\.harvest\(state\.garden, communityGardenModel\.absoluteMinute/);
  assert.match(source, /state\.groceries\s*\+=\s*result\.yield/);
  assert.match(source, /communityGarden:\s*communityGardenModel\.normalizeProgress\(state\.garden\)/);
  assert.match(source, /state\.garden\s*=\s*communityGardenModel\.normalizeProgress\(saved\.communityGarden\)/);
});

test('central park renderer draws three garden beds with empty, growing, and ripe visual states', () => {
  assert.match(source, /function drawCommunityGardenBeds\(parkPosition\)/);
  assert.match(source, /drawCommunityGardenBeds\(p\)/);
  assert.match(source, /status === "empty"/);
  assert.match(source, /status === "ready"/);
  assert.match(source, /plot\.status !== "empty"/);
});

test('garden actions expose crop progress and mobile action choices stay scrollable', () => {
  assert.match(source, /菜園の種 " \+ state\.garden\.seeds/);
  assert.match(source, /plot\.remainingGrowth/);
  assert.match(source, /plot\.wetRemaining/);
  assert.match(source, /収穫" \+ plot\.yield/);
  assert.match(css, /\.action-sheet\{[^}]*max-height:\s*min\(72dvh,560px\)[^}]*overflow-y:\s*auto/);
});

test('disabled garden actions explain missing seeds, full beds, and insufficient purchase funds', () => {
  assert.match(source, /種がありません · スーパーで購入/);
  assert.match(source, /畝が満杯です · 収穫して空ける/);
  assert.match(source, /資金不足/);
});

test('park fishing model loads before runtime and state is included in snapshot migration', () => {
  assert.match(html, /<script src="\.\/park-fishing\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('park-fishing.js') < html.indexOf('game.js'));
  assert.match(source, /const parkFishingModel = globalThis\.ParkFishingModel/);
  assert.match(source, /fishing:parkFishingModel\.normalizeProgress\(state\.fishing\)/);
  assert.match(source, /state\.fishing\s*=\s*parkFishingModel\.normalizeProgress\(saved\.fishing\)/);
});

test('bait purchase, park casting, and fish cooking validate and apply model results', () => {
  assert.match(source, /parkFishingModel\.buyBait\(state\.fishing, state\.cash\)/);
  assert.match(source, /parkFishingModel\.cast\(state\.fishing, state\.day, Math\.floor\(state\.minute\), Math\.random\(\)\)/);
  assert.match(source, /homeCookingModel\.listRecipes\(state\.communityCenter\.skills\.cooking, state\.groceries, state\.fishing\.fish\)/);
  assert.match(source, /fishRemaining/);
  assert.match(source, /advanceTime\(result\.duration\)/);
  assert.match(source, /advanceTime\(result\.recipe\.duration\)/);
});

test('central park rendering identifies a pond and fishing spot separately from the garden beds', () => {
  assert.match(source, /function drawParkFishingPond\(parkPosition\)/);
  assert.match(source, /drawParkFishingPond\(p\)/);
  assert.match(source, /池で釣りをする/);
  assert.match(source, /成功率 " \+ Math\.round\(currentChance \* 100\) \+ "%"/);
  assert.match(source, /今は魚が食いつきにくい時間です/);
  assert.match(source, /釣り餌がありません/);
});

test('home television model loads before runtime and the TV is an enterable home fixture', () => {
  assert.match(html, /<script src="\.\/home-television\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('home-television.js') < html.indexOf('game.js'));
  assert.match(source, /const homeTelevisionModel = globalThis\.CityDaysHomeTelevision/);
  assert.match(homeFixtureSource, /id:"tv", label:"テレビ", x:520, y:392, w:155, h:70, interactX:475, interactY:425/);
  assert.match(source, /fixture\.id === "tv"[\s\S]{0,500}homeTelevisionModel\.getProgram\(Math\.floor\(state\.minute\)\)/);
  assert.match(source, /homeTelevisionModel\.watch\(Math\.floor\(state\.minute\)\)/);
});

test('watching TV uses normal time advancement and applies broadcast effects with a capped cooking skill', () => {
  const fixture = source.slice(source.indexOf('fixture.id === "tv"'), source.indexOf('fixture.id === "shower"'));
  assert.match(fixture, /advanceTime\(result\.duration\)/);
  assert.match(fixture, /for \(const \[need, amount\] of Object\.entries\(result\.effects\)\)/);
  assert.match(fixture, /state\.communityCenter\.skills\.cooking\s*=\s*Math\.min\(100/);
  assert.match(fixture, /clampNeeds\(\)/);
  assert.match(source, /fixture\.id === "sofa"[\s\S]*homeRelax/);
  assert.match(source, /fixture\.id === "bed"[\s\S]*homeSleep/);
});

test('home TV screen reflects the active broadcast title without changing existing room rendering', () => {
  const homeRenderer = source.slice(source.indexOf('function drawHomeFixtureVisual('), source.indexOf('function drawHomeInterior()'));
  assert.match(homeRenderer, /homeTelevisionModel\.getProgram\(Math\.floor\(state\.minute\)\)/);
  assert.match(homeRenderer, /program\.screenTitle/);
  assert.match(source, /for \(const visual of fixture\.visuals\) drawHomeFixtureVisual\(visual\)/);
  assert.match(css, /\.action-sheet\{[^}]*max-height:\s*min\(72dvh,560px\)[^}]*overflow-y:\s*auto/);
});

test('open TV action sheet refreshes its program description when the broadcast changes', () => {
  assert.match(source, /function refreshHomeTelevisionAction\(\)/);
  const renderer = source.slice(source.indexOf('function render()'), source.indexOf('function frame('));
  assert.match(renderer, /refreshHomeTelevisionAction\(\)/);
});

test('fuel model loads before runtime and the personal car starts with its migration-safe tank level', () => {
  assert.match(html, /<script src="\.\/car-fuel\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('car-fuel.js') < html.indexOf('game.js'));
  assert.match(source, /const carFuelModel = globalThis\.CityDaysCarFuel/);
  assert.match(source, /fuelLiters:\s*carFuelModel\.INITIAL_FUEL_LITERS/);
  assert.match(source, /portableCanCount:\s*0/);
});

test('car fuel and emergency can round-trip while legacy saves receive safe defaults', () => {
  assert.match(source, /fuelLiters:\s*personalCar\.fuelLiters/);
  assert.match(source, /portableCanCount:\s*personalCar\.portableCanCount/);
  assert.match(source, /personalCar\.fuelLiters\s*=\s*carFuelModel\.normalizeFuel\(saved\.car\.fuelLiters\)/);
  assert.match(source, /personalCar\.portableCanCount\s*=\s*saved\.car\.portableCanCount\s*===\s*1\s*\?\s*1\s*:\s*0/);
});

test('car fuel is consumed only for accepted movement and an empty tank cannot accelerate', () => {
  const update = source.slice(source.indexOf('function updateCar(dt)'), source.indexOf('function nextTrafficSignal'));
  assert.match(update, /accelerating\s*=\s*\(touch\.driveAccel\s*\|\|\s*keys\.has\("w"\)\s*\|\|\s*keys\.has\("arrowup"\)\)\s*&&\s*personalCar\.fuelLiters\s*>\s*0/);
  assert.match(update, /carFuelModel\.consumeFuel\(/);
  assert.match(update, /Math\.hypot\(personalCar\.x\s*-\s*motionBefore\.x,\s*personalCar\.y\s*-\s*motionBefore\.y\)/);
  const exhausted = source.slice(source.indexOf('function handleFuelExhaustion()'), source.indexOf('function performAction()'));
  assert.match(exhausted, /personalCar\.fuelLiters\s*>\s*0[\s\S]*personalCar\.speed\s*>\s*8/);
  assert.match(exhausted, /exitCar\(\)/);
});

test('an empty vehicle rejects boarding with recovery guidance instead of immediately ejecting the player', () => {
  const enter = source.slice(source.indexOf('function enterCar()'), source.indexOf('function exitCar()'));
  assert.match(enter, /personalCar\.fuelLiters\s*<=\s*0/);
  assert.match(enter, /燃料切れ/);
  assert.match(enter, /return/);
});

test('fuel HUD exposes a readable fuel level and a labeled visual meter', () => {
  assert.match(html, /id="driveFuelText"/);
  assert.match(html, /id="driveFuelBar"/);
  assert.match(html, /aria-label="燃料残量"/);
  assert.match(css, /\.drive-fuel-meter/);
  assert.match(source, /driveFuelBar\.style\.width\s*=\s*\(personalCar\.fuelLiters\s*\/\s*carFuelModel\.CAPACITY_LITERS\s*\*\s*100\)\s*\+\s*"%"/);
});

test('fuel station offers safe refueling and one-can purchase, with a nearby-car emergency interaction', () => {
  const station = source.slice(source.indexOf('if (place.id === "fuel-station")'), source.indexOf('if (place.id === "cafe")'));
  assert.match(station, /addChoice\("10 L給油"/);
  assert.match(station, /addChoice\("満タンまで給油"/);
  assert.match(station, /addChoice\("携行缶を購入"/);
  assert.match(source, /function refuelAtStation\(/);
  assert.match(source, /function usePortableCan\(/);
  const interaction = source.slice(source.indexOf('function nearestInteraction()'), source.indexOf('function enterCar()'));
  assert.match(interaction, /type:\s*"car-refuel"/);
  assert.match(source, /item\.type === "car-refuel"/);
});

test('fuel station has a distinct illustrated pump canopy and Japanese signage', () => {
  const renderer = source.slice(source.indexOf('function drawPlace(place)'), source.indexOf('function characterLodAtScreen'));
  assert.match(renderer, /place\.id === "fuel-station"/);
  assert.match(renderer, /若葉石油/);
  assert.match(renderer, /給油/);
});

test('delivery-work model loads before the game and progress survives snapshot round trips', () => {
  assert.match(html, /delivery-work\.js[^\n]*<\/script>[\s\S]*game\.js/);
  assert.match(source, /deliveryWork:\s*deliveryWorkModel\.normalizeProgress\(state\.deliveryWork\)/);
  assert.match(source, /state\.deliveryWork\s*=\s*deliveryWorkModel\.normalizeProgress\(saved\.deliveryWork\)/);
});

test('public bath rules load before runtime and the sento interaction applies its validated effects', () => {
  assert.match(html, /<script src="\.\/public-bath\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('public-bath.js') < html.indexOf('game.js'));
  assert.match(source, /CityDaysPublicBath/);
  const start = source.indexOf('if (place.id === "public-bath")');
  const end = source.indexOf('if (place.id === "home")', start);
  assert.ok(start >= 0 && end > start);
  const action = source.slice(start, end);
  assert.match(action, /publicBathModel\.listOptions\(/);
  assert.match(action, /publicBathModel\.completeBath\(/);
  assert.match(action, /state\.cash\s*-?=\s*result\.cost/);
  assert.match(action, /advanceTime\(result\.duration\)/);
  assert.match(action, /result\.effects/);
  assert.match(action, /clampNeeds\(\)/);
});

test('clinic map and runtime changes request fresh browser assets', () => {
  assert.match(html, /map-model\.js\?v=20260930-pedestrian-vehicle-deadlock-1/);
  assert.match(html, /game\.js\?v=20260930-pedestrian-vehicle-deadlock-1/);
});

test('health model loads before runtime and has a visible sixth needs meter', () => {
  assert.match(html, /player-health\.js\?v=[^\"]+/);
  assert.ok(html.indexOf('player-health.js') < html.indexOf('game.js'));
  assert.match(html, /id="healthBar"/);
  assert.match(html, /id="healthText"/);
  assert.match(source, /CityDaysPlayerHealth/);
  assert.match(source, /health:\s*100/);
  assert.match(source, /health:\s*\[document\.getElementById\("healthBar"\),\s*document\.getElementById\("healthText"\)\]/);
});

test('health affects on-foot movement and health drift follows basic-care conditions', () => {
  const walking = source.slice(source.indexOf('function updatePlayerOnFoot('), source.indexOf('function updateCar('));
  assert.match(walking, /state\.needs\.health\s*<\s*30/);
  assert.match(source, /state\.needs\.health\s*=\s*playerHealthModel\.advanceHealth\(/);
});

test('clinic choices revalidate treatment before changing money, time, and health', () => {
  const start = source.indexOf('if (place.id === "clinic")');
  const end = source.indexOf('if (place.id === "home")', start);
  assert.ok(start >= 0 && end > start);
  const clinic = source.slice(start, end);
  assert.match(clinic, /playerHealthModel\.listTreatments\(/);
  assert.match(clinic, /playerHealthModel\.completeTreatment\(/);
  assert.match(clinic, /minute:\s*state\.minute/);
  assert.match(clinic, /Math\.round\(option\.healthAfter\)/);
  assert.match(clinic, /state\.cash\s*-=?\s*result\.cost/);
  assert.match(clinic, /advanceTime\(result\.duration\)/);
  assert.match(clinic, /state\.needs\.health\s*=\s*result\.health/);
});

test('old snapshots without health keep the safe initialized value and clinic has readable signage', () => {
  assert.match(source, /health:\s*100/);
  assert.match(source, /saved\.needs\[key\] != null && Number\.isFinite\(Number\(saved\.needs\[key\]\)\)/);
  const renderer = source.slice(source.indexOf('function drawPlace(place)'), source.indexOf('function characterLodAtScreen'));
  assert.match(renderer, /place\.id === "clinic"/);
  assert.match(renderer, /若葉診療所/);
  assert.match(renderer, /\+|十字|診/);
});

test('public bath has a distinct Japanese sign, noren, and bathhouse roof in the city rendering', () => {
  const renderer = source.slice(source.indexOf('function drawPlace(place)'), source.indexOf('function characterLodAtScreen'));
  const start = renderer.indexOf('} else if (place.id === "public-bath")');
  const end = renderer.indexOf('ctx.fillText(place.name', start);
  assert.ok(start >= 0 && end > start);
  const bathhouse = renderer.slice(start, end);
  assert.match(bathhouse, /若葉湯/);
  assert.match(bathhouse, /のれん|暖簾/);
  assert.match(bathhouse, /ゆ/);
});

test('delivery depot lists daily offers and can accept, navigate, and cancel an active job', () => {
  const depotStart = source.indexOf('if (place.id === "delivery-depot")');
  const depotEnd = source.indexOf('if (place.id === "cafe")', depotStart);
  const depotAction = source.slice(depotStart, depotEnd);
  assert.ok(depotStart >= 0 && depotEnd > depotStart);
  assert.match(depotAction, /deliveryWorkModel\.listOffers\(state\.day, state\.deliveryWork\)/);
  assert.match(depotAction, /deliveryWorkModel\.acceptDelivery\(/);
  assert.match(depotAction, /deliveryWorkModel\.cancelDelivery\(/);
  assert.match(depotAction, /state\.phone\.waypoint\s*=\s*offer\.destinationPlaceId/);
});

test('matching destination has a one-time parcel handoff with on-time and late payouts', () => {
  assert.match(source, /deliveryWorkModel\.completeDelivery\(state\.deliveryWork, state\.day, Math\.floor\(state\.minute\), place\.id\)/);
  assert.match(source, /state\.cash\s*\+=\s*result\.payout/);
  assert.match(source, /state\.phone\.waypoint === result\.offer\.destinationPlaceId/);
  assert.match(source, /result\.late\s*\?\s*"遅延配達/);
});

test('active delivery destination interaction outranks nearby NPC and parked-car prompts', () => {
  const interaction = source.slice(source.indexOf('function nearestInteraction()'), source.indexOf('function enterCar()'));
  const destinationPriority = interaction.indexOf('const deliveryDestination');
  const depotPriority = interaction.indexOf('const deliveryDepot');
  const carPriority = interaction.indexOf('if (distance(p.x, p.y, personalCar.x, personalCar.y) < 70)');
  const npcPriority = interaction.indexOf('let nearestNpc = null');
  assert.ok(destinationPriority >= 0 && destinationPriority < depotPriority && depotPriority < carPriority && carPriority < npcPriority);
  assert.match(interaction, /target:deliveryDestination, label:"荷物を届ける"/);
  assert.match(interaction, /target:deliveryDepot, label:"若葉便 配達受付所を利用"/);
});

test('delivery HUD shows the target and absolute-deadline countdown including overdue status', () => {
  assert.match(source, /納品先/);
  assert.match(source, /遅延中/);
  assert.match(source, /deadlineAbsoluteMinute/);
});

test('player course progress is present in snapshots and older saves receive safe defaults', () => {
  assert.match(source, /communityCenter:\s*communityCenterModel\.normalizeProgress\(state\.communityCenter\)/);
  assert.match(source, /state\.communityCenter\s*=\s*communityCenterModel\.normalizeProgress\(saved\.communityCenter\)/);
});

test('community center actions revalidate entry, charge once, and award completion effects', () => {
  const start = source.indexOf('if (place.id === "community-center")');
  const end = source.indexOf('actionSheet.hidden = false;', start);
  const action = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(action, /getCourseAvailability\(/);
  assert.match(action, /state\.cash\s*-=\s*course\.cost/);
  assert.match(action, /advanceTime\(course\.duration\)/);
  assert.match(action, /completeCourse\(/);
  assert.match(action, /clampNeeds\(\)/);
  assert.match(action, /getClubs\(\)/);
  assert.match(action, /getClubAvailability\(/);
  assert.match(action, /attendClub\(/);
  assert.match(action, /state\.needs\.social\s*\+=\s*12/);
  assert.match(action, /state\.needs\.fun\s*\+=\s*12/);
  assert.match(action, /state\.needs\.energy\s*-=?\s*4/);
  assert.match(action, /socialNpcState\.friendship\[memberId\]/);
  assert.match(action, /socialNpcState\.relationships\[pairId\]/);
});

test('home closet shows cleanliness percentage, a text condition and the equipped outfit', () => {
  const closetStart = source.indexOf('} else if (fixture.id === "closet")');
  const closetEnd = source.indexOf('fixture.id === "pet"', closetStart);
  const closet = source.slice(closetStart, closetEnd);
  assert.match(closet, /wardrobe\.cleanlinessByOutfitId\[outfit\.id\]/);
  assert.match(closet, /wardrobeModel\.getCleanlinessLabel\(/);
  assert.match(closet, /清潔度/);
  assert.match(closet, /着用中/);
});

test('the outfit worn before changing clothes receives wear during dressing time', () => {
  const equipStart = source.indexOf('function equipPlayerOutfit(');
  const equipEnd = source.indexOf('\n  function ', equipStart + 10);
  const equip = source.slice(equipStart, equipEnd);
  assert.notEqual(equipStart, -1);
  assert.ok(equip.indexOf('advanceTime(result.duration)') < equip.indexOf('state.wardrobe = wardrobeModel.normalizeWardrobe'));
  assert.match(equip, /wardrobeModel\.normalizeWardrobe\(\{\s*\.\.\.state\.wardrobe,\s*equippedOutfitId:\s*result\.wardrobe\.equippedOutfitId\s*\}\)/);
  assert.doesNotMatch(equip, /state\.wardrobe\s*=\s*result\.wardrobe\s*;/);
});

test('outfit cleanliness advances with game time and survives purchases, dressing and snapshots', () => {
  assert.match(html, /wardrobe\.js\?v=[^\"]+/);
  const advanceStart = source.indexOf('function advanceTime(');
  const advanceEnd = source.indexOf('function ', advanceStart + 20);
  const advanceTime = source.slice(advanceStart, advanceEnd);
  assert.match(advanceTime, /state\.wardrobe\s*=\s*wardrobeModel\.advanceWear\(state\.wardrobe,\s*minutes\)/);
  assert.match(source, /wardrobe:wardrobeModel\.normalizeWardrobe\(state\.wardrobe\)/);
  assert.match(source, /state\.wardrobe = wardrobeModel\.normalizeWardrobe\(saved\.wardrobe\)/);
  assert.match(source, /wardrobeModel\.normalizeWardrobe\(state\.wardrobe\)/);
});

test('laundromat is a loaded city facility and its action validates before changing cash or time', () => {
  assert.match(html, /laundromat|wardrobe\.js/);
  assert.match(source, /place\.id === "laundromat"/);
  const actionStart = source.indexOf('function launderCurrentOutfit(');
  const actionEnd = source.indexOf('\n  function ', actionStart + 10);
  const action = source.slice(actionStart, actionEnd);
  assert.notEqual(actionStart, -1);
  assert.match(action, /wardrobeModel\.launder\(state\.wardrobe,\s*state\.cash,\s*Math\.floor\(state\.minute\)\)/);
  assert.ok(action.indexOf('if (!result.ok)') < action.indexOf('state.cash = result.cashRemaining'));
  assert.ok(action.indexOf('state.cash = result.cashRemaining') < action.indexOf('advanceTime(result.duration)'));
  assert.match(action, /state\.wardrobe = result\.wardrobe/);
  const placeStart = source.indexOf('if (place.id === "laundromat")');
  const placeEnd = source.indexOf('if (place.id === "clinic")', placeStart);
  assert.notEqual(placeStart, -1);
  assert.match(source.slice(placeStart, placeEnd), /wardrobeModel\.launder/);
  assert.match(source.slice(placeStart, placeEnd), /現在の服を洗う/);
});

test('citizens plan community classes through their normal pedestrian activity lifecycle', () => {
  const candidates = source.slice(source.indexOf('function citizenActionCandidates('), source.indexOf('function chooseCitizenAction('));
  const completion = source.slice(source.indexOf('function completeCitizenActivity('), source.indexOf('function planCitizenAction('));
  assert.match(candidates, /getCitizenCourseOpportunity\(state\.day,\s*minute,/);
  assert.match(candidates, /add\("community_class"/);
  assert.match(candidates, /placeId:"community-center"/);
  assert.match(completion, /case "community_class":/);
  assert.match(source, /sessionStartAbsoluteMinute:options\.sessionStartAbsoluteMinute/);
  assert.match(source, /currentPlaceId:ped\.currentPlaceId/);
  const begin = source.slice(source.indexOf('function beginCitizenActivity('), source.indexOf('function completeCitizenActivity('));
  assert.match(begin, /isCitizenCourseArrivalValid\(/);
});

test('club members travel through normal pedestrian routes and revalidate the session at arrival', () => {
  const candidates = source.slice(source.indexOf('function citizenActionCandidates('), source.indexOf('function chooseCitizenAction('));
  const begin = source.slice(source.indexOf('function beginCitizenActivity('), source.indexOf('function completeCitizenActivity('));
  assert.match(candidates, /getCitizenClubOpportunity\(state\.day,\s*minute,/);
  assert.match(candidates, /add\("community_club"/);
  assert.match(begin, /isCitizenClubArrivalValid\(/);
  assert.match(begin, /ped\.money\s*-=?\s*club\.cost/);
  assert.match(begin, /sessionStart\s*\+\s*club\.duration\s*-\s*now/);
  assert.match(begin, /isCitizenClubArrivalValid\([\s\S]*onShift, lateNight, needs:ped\.needs/);
  assert.match(source, /replanCitizenForTest\(npcId\)/);
});

test('club runtime modules have fresh browser cache keys', () => {
  assert.match(html, /community-center\.js\?v=20260929-community-clubs-1/);
  assert.match(html, /social-npc-system\.js\?v=20260929-community-clubs-1/);
  assert.match(html, /game\.js\?v=20260930-pedestrian-vehicle-deadlock-1/);
});

test('game loads overtake safety before the overtake planner and runtime', () => {
  assert.match(html, /<script src="\.\/traffic-overtake-safety\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('traffic-overtake-safety.js') < html.indexOf('traffic-overtake.js'));
  assert.ok(html.indexOf('traffic-overtake.js') < html.indexOf('game.js'));
  assert.match(overtakeSource, /conflictsWithOncoming/);
  assert.match(overtakeSafetySource, /function conflictsWithOncoming\(/);
});

test('home interior player uses the shared character renderer', () => {
  const start = source.indexOf('function drawHomePlayer()');
  const end = source.indexOf('function drawStreetLightsGlow()',start);
  const homePlayerDraw = source.slice(start,end);
  assert.ok(start >= 0 && end > start);
  assert.match(homePlayerDraw,/characterRenderer\.draw\(ctx,\s*\{/);
  assert.doesNotMatch(homePlayerDraw,/drawPersonSpriteAtScreen/);
});

test('enterable home uses the same residential renderer and scale language as neighborhood houses', () => {
  const homeDrawStart = source.indexOf('} else if (place.id === "home") {');
  const cafeDrawStart = source.indexOf('} else if (place.id === "cafe") {', homeDrawStart);
  const homeDraw = source.slice(homeDrawStart, cafeDrawStart);

  assert.match(homeDraw, /const homeW = building\?\.w \|\| 118/);
  assert.match(homeDraw, /const homeH = building\?\.h \|\| 96/);
  assert.match(homeDraw, /drawResidentialBuilding\(/);
  assert.doesNotMatch(homeDraw, /drawFacilityBuilding\(/);
  assert.doesNotMatch(homeDraw, /\|\| 300/);
  assert.doesNotMatch(homeDraw, /\|\| 270/);
});

test('game keeps all existing place and station identifiers from the map model', () => {
  for (const id of ['home', 'cafe', 'store', 'park', 'gym', 'library', 'west', 'central', 'east']) {
    assert.match(mapSource, new RegExp(`['\"]${id}['\"]`));
  }
});

test('rail line is anchored to the central station in the current map model', () => {
  assert.match(source, /const RAIL_Y = mapModel\.stations\[1\]\.y/);
  assert.match(source, /x:TRAIN_STATIONS\[1\]\.x,[\s\S]*stationIndex:1,[\s\S]*targetIndex:2/);
});

test('game delegates collision, nearest-road, and district queries to MapModel', () => {
  assert.match(source, /mapModel\.isRoad\(/);
  assert.match(source, /mapModel\.nearestRoad\(/);
  assert.match(source, /mapModel\.isWalkable\(/);
  assert.match(source, /mapModel\.districtAt\(/);
});

test('driving routes and traffic use the map graph and edge geometry', () => {
  assert.match(source, /mapModel\.findRoute\(/);
  assert.match(source, /mapModel\.getEdge\(/);
  assert.match(source, /edge\.points/);
  assert.match(source, /edge\.signalized/);
});

test('ambient cars follow graph routes instead of teleporting between road ends', () => {
  assert.match(source, /function buildTrafficRoute\(car, startNodeId, goalNodeId, avoidFirstEdgeId = null\)/);
  assert.match(source, /route = mapModel\.findRoute\(startNodeId, goalNodeId, \{ mode: "vehicle" \}\)/);
  assert.match(source, /function advanceTrafficRoute\(car\)/);
  assert.match(source, /car\.routeIndex \+= 1/);
  assert.match(source, /while \(remaining > 0 && transitions < 4\)/);
});

test('ambient pedestrians have destination plans, route states, and signal-aware crossings', () => {
  assert.match(source, /function buildPedestrianPlan\(ped, startNodeId, goalNodeId\)/);
  assert.match(source, /ped\.state = "walking"/);
  assert.match(source, /ped\.state = "waiting"/);
  assert.match(source, /ped\.state = action\.indoor \? "inside" : "staying"/);
  assert.match(source, /function pedestrianPoseAt\(ped\)/);
  assert.match(source, /pedestrianSignalState\(ped\)/);
  assert.match(source, /ped\.targetPlaceId/);
});

test('citizens carry deterministic age and gender into appearance generation', () => {
  assert.match(source, /const gender = socialProfile\?\.gender \|\| \(hash2\(index, 81, 16025\) < \.5 \? "male" : "female"\)/);
  assert.match(source, /ageGroup:citizenAgeGroup\(age\)/);
  assert.match(source, /name:socialProfile\?\.name \|\| citizenName\(index, gender\)/);
  assert.match(source, /appearance:personAppearanceFromSeed\(i, profile\)/);
  assert.match(source, /const ageSpeedFactor = profile\.ageGroup === "senior"/);
  assert.match(source, /baseSpeed,/);
  assert.match(source, /speed:baseSpeed/);
});

test('named citizens use authored gender while generated citizens keep deterministic gender', () => {
  assert.match(source, /const gender = socialProfile\?\.gender \|\| \(hash2\(index, 81, 16025\) < \.5 \? "male" : "female"\)/);
});

test('persistent pedestrians are not teleported beside the player to seed crowds', () => {
  const seeding = source.slice(
    source.indexOf('function seedPedestriansNearActor('),
    source.indexOf('function ', source.indexOf('function seedPedestriansNearActor(') + 10)
  );
  assert.match(seeding, /Citizens now keep persistent homes, jobs and routes/);
  assert.doesNotMatch(seeding, /ped\.x\s*=|ped\.y\s*=|buildPedestrianPlan/);
  assert.match(source, /seedPedestriansNearActor\(\);/);
});

test('game distance helper supports map polyline point objects', () => {
  assert.match(source, /typeof ax === "object"/);
  assert.match(source, /Math\.hypot\(ax\.x - ay\.x, ax\.y - ay\.y\)/);
});

test('city rendering is driven by v2 urban-fabric data instead of grid-only geometry', () => {
  assert.match(source, /mapModel\.buildingSites/);
  assert.match(source, /mapModel\.openSpaces/);
  assert.match(source, /mapModel\.landmarks/);
  assert.match(source, /mapModel\.vegetation/);
  assert.match(source, /mapModel\.edges/);
  assert.match(source, /edge\.points/);
  assert.match(source, /function drawWorldPolygon\(polygon\)/);
  assert.match(source, /function drawMapModelRoads\(\)/);
  assert.match(source, /function drawMapModelMinimap\(/);
});

test('saved state carries the map version and sanitizes legacy positions', () => {
  assert.match(source, /mapVersion:\s*mapModel\.version/);
  assert.match(source, /function migratePlayerToCurrentMap\(/);
  assert.match(source, /function migrateCarToCurrentRoadIfNeeded\(/);
  assert.match(source, /mapModel\.nearestRoad\(personalCar\.x, personalCar\.y, \{ vehicleOnly: true \}\)/);
  assert.match(source, /state\.drive\.route = \[\]/);
});

test('parked personal car remains an overtake obstacle while the player is indoors', () => {
  const start = source.indexOf('function trafficParkedCarInfo(car)');
  const end = source.indexOf('function trafficOvertakePlan(car, obstacle)',start);
  const parkedDetection = source.slice(start,end);
  assert.ok(start >= 0 && end > start);
  assert.match(parkedDetection,/state\.player\.inVehicle/);
  assert.match(parkedDetection,/personalCar\.speed/);
  assert.doesNotMatch(parkedDetection,/state\.player\.inHome/);
});

test('road rendering joins shared endpoints without oversized junction blobs', () => {
  assert.match(source, /ctx\.lineCap = "butt"/);
  assert.match(source, /drawJunctionPads/);
  assert.match(source, /ctx\.arc\(point\.x, point\.y, radius/);
  assert.match(source, /mapModel\.edges/);
  assert.doesNotMatch(source, /drawMapModelJunctions\(\);/);
});


test('driving route stays on the current road graph', () => {
  assert.match(source, /function edgeProjectionPointsToNode\(edge, hit, nodeId\)/);
  assert.match(source, /const fromCost = fromRoute \? polylineLength\(fromStartPoints\) \+ fromRoute\.distance : Infinity/);
  assert.match(source, /appendDistinctPoints\(centerline, \[\{ x: destinationNode\.x, y: destinationNode\.y \}\]\)/);
  assert.doesNotMatch(source, /appendDistinctPoints\(centerline, \[\{ x: place\.x, y: place\.y \}\]\)/);
});

test('building clearance follows the current map model rather than the retired grid', () => {
  assert.match(source, /function segmentIntersectsExpandedRect\(a, b, rect, pad\)/);
  assert.match(source, /function intersectsRoadNetworkClearance\(rect\)[\s\S]*for \(const edge of mapModel\.edges\)/);
});

test('traffic lanes respect road width and parallel lanes do not brake for each other', () => {
  assert.match(source, /function trafficLaneOffsetForEdge\(edge, secondaryLane = false\)/);
  assert.match(source, /function trafficLeadInfo\(car, maxDistance = 320\)[\s\S]*const forward = dx \* Math\.cos\(car\.angle\)/);
  assert.match(source, /const laneCorridor = \(vehicleDimensions\(car\)\.width \+ vehicleDimensions\(other\)\.width\) \* \.5 \+ 12/);
});

test('traffic checks passing clearance for a parked personal car and shifts back after passing', () => {
  assert.match(html, /traffic-overtake\.js/);
  assert.match(overtakeSource, /function plan\(/);
  assert.match(source, /function trafficParkedCarInfo\(car\)/);
  assert.match(source, /return \{ edge, hit:parkedHit,[^\n]+blocksLane \};/);
  assert.match(source, /function projectedObstacleDistance\(car, ignorePersonalCar = false\)/);
  assert.match(source, /trafficOvertake\.blocksLane\(/);
  assert.match(source, /function trafficOvertakePlan\(car, obstacle\)/);
  assert.match(source, /opposingVehicles/);
  assert.match(source, /car\.overtakePlan = trafficOvertakePlan\(car, parkedObstacle\)/);
  assert.match(source, /const parkedGap = parkedObstacle\?\.blocksLane \? parkedObstacle\.centerGap : Infinity/);
  assert.match(source, /const projectedGap = projectedObstacleDistance\(car, Boolean\(parkedObstacle\)\)/);
  assert.match(source, /function updateTrafficOvertake\(car, dt, stationaryParkedBlock = false\)/);
  assert.match(source, /trafficOvertake\.offsetAt\(plan, car\.along, dt, \{ stationary:stationaryParkedBlock \}\)/);
  assert.match(source, /const stationaryParkedBlock = car\.speed < 5 && blockReason === "obstacle"/);
  assert.match(source, /minimumDistance:car\.speed < 5\s*\? trafficOvertake\.minimumEmergencyDistance\(vehicleHalfLength,obstacleHalfLength\)/);
});

test('ambient traffic signals a planned intersection turn unless an overtake signal takes priority', () => {
  assert.match(overtakeSource, /function turnSignalForRoute\(/);
  assert.match(source, /function trafficIntersectionSignal\(car, timeMs\)/);
  assert.match(source, /distanceToJunction:trafficDistanceToEndpoint\(car, edge\)/);
  assert.match(source, /car\.overtakePlan\s*\?\s*trafficOvertake\.signalFor\(car\.overtakePlan, turnSignalTime\)\s*:\s*trafficIntersectionSignal\(car, turnSignalTime\)/);
});

test('reverse-direction pedestrians start from the correct edge end', () => {
  assert.match(source, /ped\.segmentAlong = ped\.segmentDirection > 0 \? 0 : firstSegment\.length/);
  assert.match(source, /ped\.segmentAlong = ped\.segmentDirection > 0 \? initialAlong : Math\.max\(0, segment\.length - initialAlong\)/);
  assert.match(source, /const centerOffset = corridor\?\.centerOffset \?\? \(edge\.width \/ 2 \+ 22\)/);
  assert.match(source, /const flowBias = directionSign > 0 \? 7 : -7/);
});

test('stuck pedestrian recovery stays on the current sidewalk without teleporting', () => {
  assert.match(source, /Recovery must never switch sidewalks or rebuild from an arbitrary node/);
  assert.match(source, /requestPedestrianAvoidance\(ped, room, 1\.05\)/);
  assert.doesNotMatch(source, /ped\.sideSign\s*=\s*\(ped\.sideSign/);
});

test('pedestrians reserve same-direction following space before advancing', () => {
  assert.match(source, /function pedestrianFollowingLimit\(ped, distanceUnits\)/);
  assert.match(source, /const safeDistance = pedestrianFollowingLimit\(ped, distanceUnits\)/);
  assert.match(source, /moveCitizenAlongRoute\(ped, safeDistance\)/);
});

test('traffic reverses at a true dead-end instead of remaining permanently stalled', () => {
  assert.match(source, /function reverseTrafficAtDeadEnd\(car, current\)/);
  assert.match(source, /if \(reverseTrafficAtDeadEnd\(car, current\)\) return true;/);
});

test('pedestrian collisions preserve sidewalk side and use continuous avoidance', () => {
  assert.match(source, /function pedestrianPriority\(ped\)/);
  assert.match(source, /const yieldingPed = pedestrianPriority\(ped\) < pedestrianPriority\(collision\.target\)/);
  assert.match(source, /requestPedestrianAvoidance\(yieldingPed, 18, \.8\)/);
  assert.match(source, /function updatePedestrianAvoidance\(ped, dt\)/);
  assert.doesNotMatch(source, /yieldingPed\.sideSign\s*=/);
});


test('pedestrians use dedicated sidewalk lanes outside the carriageway', () => {
  assert.match(source, /function pedestrianSidewalkLayout\(edge, directionSign = 1\)/);
  assert.match(source, /mapModel\.pedestrianCorridor\?\.\(edge\.id\)/);
  assert.match(source, /mapModel\.pedestrianOffsetPose\(edge, along, directionSign, lateralOffset\)/);
  assert.match(source, /const flowBias = directionSign > 0 \? 7 : -7/);
  const pose = source.slice(
    source.indexOf('function pedestrianEdgePose('),
    source.indexOf('function pedestrianCornerControl(')
  );
  assert.doesNotMatch(pose, /edge\.width \/ 2 \+ 5/);
});

test('same-direction pedestrian queues only block the same sidewalk side', () => {
  const following = source.slice(
    source.indexOf('function pedestrianFollowingLimit('),
    source.indexOf('function attemptPedestrianMove(')
  );
  assert.match(following, /other\.directionSign !== ped\.directionSign/);
  assert.match(following, /\(other\.sideSign \|\| 1\) !== \(ped\.sideSign \|\| 1\)/);
});

test('pedestrians sidestep away from vehicles instead of only retrying in place', () => {
  const attempt = source.slice(
    source.indexOf('function attemptPedestrianMove('),
    source.indexOf('function pedestrianVisibleOnScreen(')
  );
  assert.match(attempt, /requestPedestrianAvoidance\(ped, 16, \.95\)/);
  assert.match(source, /const NPC_COLLISION_RADIUS = 6\.5/);
});

test('vehicle roads render a visible pedestrian shoulder outside the curb', () => {
  assert.match(source, /const corridor = edge\.vehicle \? mapModel\.pedestrianCorridor\?\.\(edge\.id\) : null/);
  assert.match(source, /edge\.width \+ sidewalkWidth \* 2/);
  assert.match(source, /Vehicle streets have a real pedestrian shoulder/);
});

test('pedestrian generation places walkers on their first typed navigation segment', () => {
  assert.match(source, /const segment = mapModel\.pedestrianNavigation\.segmentsById\.get\(ped\.segmentId\)/);
  assert.match(source, /ped\.segmentAlong = ped\.segmentDirection > 0 \? initialAlong/);
  assert.match(source, /pedestrianSegmentLaneOffset\(ped, segment\)/);
});

test('pedestrian route progress remains inside the active typed segment bounds', () => {
  assert.match(source, /ped\.segmentAlong = clamp\(ped\.segmentAlong \+ ped\.segmentDirection \* remaining, 0, segment\.length\)/);
  assert.match(source, /segmentDirection:ped\.segmentDirection/);
});

test('pedestrians traverse route starts and sidewalk corners continuously', () => {
  assert.match(source, /function makePedestrianTransition\(from, to\)/);
  assert.match(source, /function makePedestrianJunctionTransition\(ped, currentEdge, nextEdge, nextDirectionSign\)/);
  assert.match(source, /ped\.junctionTransition = previousPose[\s\S]*makePedestrianTransition\(previousPose, firstPose\)/);
  assert.match(source, /ped\.junctionTransition = junctionTransition/);
  assert.match(source, /function pedestrianTransitionPose\(transition\)/);
  assert.match(source, /transition\.progress \+= step/);
  assert.match(source, /junctionTransition:clonePedestrianTransition\(ped\.junctionTransition\)/);
});

test('pedestrian sidewalk side is immutable after spawn', () => {
  const assignments = source.match(/sideSign\s*=/g) || [];
  assert.equal(assignments.length, 1);
  assert.match(source, /sideSign:hash2\(i, 14, 98\) > \.5 \? 1 : -1/);
});

test('fresh games snap the default car onto the current road graph', () => {
  assert.match(source, /generatePedestrians\(\);\s*syncNamedNpcCitizens\(\);\s*migrateCarToCurrentRoadIfNeeded\(\);/);
});

test('road culling considers every point in a curved map edge', () => {
  assert.match(source, /const points = edge\.points\.map\(\(point\) => worldToScreen\(point\.x, point\.y\)\)/);
  assert.match(source, /const minX = Math\.min\(\.\.\.points\.map/);
});


test('map traffic signals are intersection-node based rather than whole-edge based', () => {
  assert.match(source, /function isSignalizedMapNode\(nodeId\)/);
  assert.match(source, /incidentEdges\.length >= 3 && incidentEdges\.some\(\(edge\) => edge\.signalized\)/);
  assert.match(source, /if \(endpoint && isSignalizedMapNode\(endpoint\.id\)\)/);
  assert.match(source, /!isSignalizedMapNode\(node\.id\)/);
});

test('cars, pedestrians, route guidance, and markings share generated stop-line geometry', () => {
  assert.match(source, /function signalGeometryAtNode\(nodeId, approachEdge\)/);
  assert.match(source, /mapModel\.junctionGeometry\?\.\(nodeId, approachEdge\?\.id\)/);
  assert.match(source, /stopOffset: signalGeometryAtNode\(node\.id, routeEdge\)\.stopOffset/);
  assert.match(source, /const geometry = approachGeometry \|\| signalGeometryAtNode\(endpoint\.id, edge\)/);
  assert.match(source, /function drawMapModelIntersectionMarkings\(\)/);
  assert.match(source, /drawMapModelIntersectionMarkings\(\);/);
});

test('unsignalized junctions keep the whole vehicle behind the generated yield boundary', () => {
  assert.match(source, /const approachGeometry = endpoint \? signalGeometryAtNode\(endpoint\.id, edge\) : null/);
  assert.match(source, /const yieldLineOffset = approachGeometry\?\.yieldOffset/);
  assert.match(source, /let junctionYieldOffset = yieldLineOffset \+ vehicleFrontOverhang\(car\)/);
  assert.doesNotMatch(source, /let junctionYieldOffset = Math\.max\(vehicleFrontOverhang\(car\) \+ 18/);
});

test('road rendering uses generated center pads instead of widest-road circles', () => {
  assert.match(source, /const generated = mapModel\.junctionGeometry\?\.\(node\.id\)/);
  assert.match(source, /const baseRadius = generated\?\.padRadius \?\? fallbackHalf/);
  assert.doesNotMatch(source, /const radius = widest \/ 2 \+ \(layer === "shadow"/);
});

test('traffic-light rendering includes every drivable approach at a signalized node', () => {
  assert.match(source, /const incidentEdges = vehicleEdgesAtNode\(node\.id\)/);
  assert.doesNotMatch(source, /mapModel\.edges\.filter\(\(edge\) => edge\.signalized && edge\.vehicle/);
});


test('fresh player and the original three social NPCs use their current map anchors', () => {
  assert.match(source, /player:\s*\{\s*x: HOME\.x,\s*y: HOME\.y,/);
  assert.match(source, /aoi: \{ x:PARK\.x - 60, y:PARK\.y \}/);
  assert.match(source, /mei: \{ x:LIBRARY\.x, y:LIBRARY\.y - 45 \}/);
  assert.match(source, /const fallback = migratePlayerToCurrentMap\(NaN, NaN\)/);
  assert.doesNotMatch(source, /state\.player\.x = HOME\.x \+ 55/);
});


test('sleep returns the player to the current home entrance', () => {
  assert.match(source, /showToast\("よく眠れました"\)/);
  assert.doesNotMatch(source, /state\.player\.x = HOME\.x \+ 55/);
  assert.doesNotMatch(source, /state\.player\.y = HOME\.y \+ 65/);
});


test('v2 road rendering visually distinguishes street hierarchy and pedestrian surfaces', () => {
  assert.match(source, /const pedestrianSurface = \(edge\) =>/);
  assert.match(source, /edge\.type === "shopping-walk" \? "#b5aa90"/);
  assert.match(source, /const vehicleSurface = \(\) => "#626863"/);
  assert.match(source, /if \(edge\.type === "arterial"\)/);
  assert.match(source, /edge\.type === "collector" && edge\.width >= 112/);
});

test('v2 map removes the old 600px ground-block painting from the active renderer', () => {
  const drawGround = source.slice(source.indexOf('function drawGround()'), source.indexOf('function drawTree('));
  assert.doesNotMatch(drawGround, /ROAD_GAP/);
  assert.doesNotMatch(drawGround, /startBlockX|endBlockX|startBlockY|endBlockY/);
});

test('v2 landmarks and street lighting use map coordinates', () => {
  assert.match(source, /for \(const landmark of mapModel\.landmarks \|\| \[\]\)/);
  assert.match(source, /function forEachStreetLamp\(callback\)/);
  assert.match(source, /forEachStreetLamp\(\(x, y\) => drawLamp\(x, y\)\)/);
  assert.match(source, /forEachStreetLamp\(\(wx, wy\) =>/);
});

test('large park comes from map open-space geometry rather than a fake square facility block', () => {
  assert.doesNotMatch(source, /p\.x - 190, p\.y - 190, 380, 380/);
  assert.match(source, /space\.type === "park" \? "#638b61"/);
});


test('facility entrances and physical building footprints are rendered separately', () => {
  assert.match(source, /const building = place\.building/);
  assert.match(source, /const entry = worldToScreen\(place\.x, place\.y\)/);
  assert.match(source, /ctx\.arc\(entry\.x, entry\.y, 15/);
  assert.match(source, /ctx\.lineTo\(facadeEntrance\.x, facadeEntrance\.y\)/);
});

test('facility buildings participate in player collision', () => {
  assert.match(source, /function placeBuildingRect\(place\)/);
  assert.match(source, /for \(const place of PLACES\)/);
  assert.match(source, /const facility = placeBuildingRect\(place\)/);
  assert.match(source, /facility\.frontageGeometry[\s\S]*localX[\s\S]*localY/);
  assert.match(source, /circleRectCollision\(x, y, radius, facility\)/);
});

test('home interior transitions preserve outdoor position and use a separate scene', () => {
  assert.ok(source.includes("state.player.outdoorHomeX = state.player.x;"));
  assert.ok(source.includes("state.player.x = Number.isFinite(state.player.outdoorHomeX) ? state.player.outdoorHomeX : HOME.x;"));
  assert.match(source, /function render\(\)[\s\S]*if \(state\.player\.inHome\)[\s\S]*drawHomeInterior\(\)/);
  assert.match(source, /if \(place\.id === "home"\)[\s\S]*addChoice\("自宅に入る"[\s\S]*enterHome\(\)/);
});

test('home movement is twice normal street movement', () => {
  assert.match(source, /const HOME_MOVEMENT_SPEED_MULTIPLIER = 2/);
  assert.match(source, /const speed = \(running \? RUN_SPEED : WALK_SPEED\) \* HOME_MOVEMENT_SPEED_MULTIPLIER/);
});

test('smartphone has an always available responsive panel', () => {
  assert.match(html, /id="smartphoneToggle"/);
  assert.match(html, /id="smartphonePanel"/);
  assert.match(source, /smartphoneToggle\.addEventListener\("click"/);
  assert.match(css, /\.smartphone-panel[\s\S]*@media\(max-width:760px\)[\s\S]*\.smartphone-panel/);
});

test('visible smartphone refreshes world data at a bounded cadence and resets while closed', () => {
  const frame = source.slice(source.indexOf('function frame('),source.indexOf('function togglePause('));
  assert.match(html,/game\.js\?v=[^"]+/);
  assert.match(source,/const SMARTPHONE_REFRESH_INTERVAL = 0\.25/);
  assert.match(source,/let smartphoneRefreshElapsed = 0/);
  assert.match(frame,/smartphoneRefreshElapsed \+= dt/);
  assert.match(frame,/smartphoneRefreshElapsed >= SMARTPHONE_REFRESH_INTERVAL[\s\S]*updateSmartphone\(\)/);
  assert.match(frame,/else\s*\{\s*smartphoneRefreshElapsed = 0;/);
});

test('home map uses the street world scale and follows the player camera', () => {
  const viewport = source.slice(source.indexOf('function homeInteriorViewport'), source.indexOf('function homeToScreen'));
  assert.match(viewport, /const scale = Math\.max\(1, fitScale\)/);
  assert.match(viewport, /: state\.player\.homeX/);
  assert.match(viewport, /: state\.player\.homeY/);
  assert.match(viewport, /furniturePlacementState[\s\S]*homeFurnitureCandidate\(\)/);
  assert.match(viewport, /focusX/);
  assert.match(viewport, /focusScreenX = preview && viewWidth <= 760 \? viewWidth - 64 : viewWidth \/ 2/);
  assert.match(viewport, /x:\s*preview\s*\? centeredX/);
  assert.doesNotMatch(viewport, /1\.22/);
});

test('home furniture defaults into legacy saves and survives normalized snapshot round-trips', () => {
  const furnitureScript = html.indexOf('home-furniture.js');
  assert.notEqual(furnitureScript, -1);
  assert.ok(furnitureScript < html.indexOf('game.js'));
  assert.match(source, /const homeFurnitureModel = globalThis\.CityDaysHomeFurniture/);
  assert.match(source, /homeFurniture:homeFurnitureModel\.createProgress\(\)/);
  assert.match(source, /homeFurniture:homeFurnitureModel\.normalizeProgress\(state\.homeFurniture\)/);
  assert.match(source, /state\.homeFurniture = sanitizeHomeFurnitureProgress\(saved\.homeFurniture\)/);
  const hookStart = source.indexOf('function installSocialNpcTestHook()');
  const hookEnd = source.indexOf('function togglePause()', hookStart);
  const hook = source.slice(hookStart, hookEnd);
  assert.match(hook, /homeFurniture:homeFurnitureModel\.normalizeProgress\(state\.homeFurniture\)/);
});

test('supermarket exposes catalog furniture and sends a selected purchase through the atomic handler', () => {
  const storeStart = source.indexOf('if (place.id === "store")');
  const storeEnd = source.indexOf('if (place.id === "fuel-station")', storeStart);
  const store = source.slice(storeStart, storeEnd);
  const furnitureStart = store.indexOf('for (const item of homeFurnitureModel.CATALOG');
  const furnitureEnd = store.indexOf('addChoice("釣り餌を買う"', furnitureStart);
  const listing = store.slice(furnitureStart, furnitureEnd);
  const purchaseStart = source.indexOf('function buyHomeFurniture(');
  const purchaseEnd = source.indexOf('\n  function ', purchaseStart + 10);
  const purchase = source.slice(purchaseStart, purchaseEnd);
  assert.notEqual(furnitureStart, -1);
  assert.match(listing, /homeFurnitureModel\.buyFurniture\(state\.homeFurniture, state\.cash, item\.id\)/);
  assert.match(listing, /addChoice\(item\.name,[\s\S]*buyHomeFurniture\(item\.id\)/);
  assert.notEqual(purchaseStart, -1);
  assert.match(purchase, /homeFurnitureModel\.buyFurniture\(state\.homeFurniture, state\.cash, furnitureId\)/);
  assert.ok(purchase.indexOf('if (!result.ok)') < purchase.indexOf('state.homeFurniture = result.progress'));
  assert.ok(purchase.indexOf('state.homeFurniture = result.progress') < purchase.indexOf('state.cash = result.cashRemaining'));
  assert.ok(purchase.indexOf('state.cash = result.cashRemaining') < purchase.indexOf('advanceTime(result.duration)'));
});

test('home furniture use checks the home context and applies catalog results through existing time and need clamping', () => {
  const start = source.indexOf('function useHomeFurniture(');
  const end = source.indexOf('\n  function ', start + 10);
  const use = source.slice(start, end);
  assert.notEqual(start, -1);
  assert.match(use, /if \(!state\.player\.inHome\)/);
  assert.match(use, /homeFurnitureModel\.getUseAction\(/);
  assert.ok(use.indexOf('if (!action)') < use.indexOf('advanceTime(action.duration)'));
  assert.match(use, /clampNeeds\(\)/);
});

test('home exposes an in-room furniture manager plus dedicated touch placement controls', () => {
  assert.match(html, /id="homeFurnitureButton"[^>]*hidden/);
  assert.match(html, /id="furniturePlacementControls"[^>]*hidden/);
  assert.match(html, /id="furnitureRotateButton"[^>]*>回転/);
  assert.match(html, /id="furniturePlaceButton"[^>]*>配置/);
  assert.match(html, /id="furnitureCancelButton"[^>]*>キャンセル/);
  assert.match(css, /body\.furniture-placement/);
  assert.match(css, /furniture-placement-controls/);
  assert.match(css, /body\.furniture-placement \.toast/);
});

test('placement and movement share arrangement validation and migrate unsafe saved furniture back to inventory', () => {
  assert.match(source, /homeFurnitureModel\.validateArrangement\(/);
  assert.match(source, /function beginHomeFurniturePlacement\(/);
  assert.match(source, /function confirmHomeFurniturePlacement\(/);
  assert.match(source, /function sanitizeHomeFurnitureProgress\(/);
  assert.match(source, /function pickupHomeFurniture\(/);
  assert.match(source, /homeFurnitureModel\.getFootprint\(/);
  const snapshotStart = source.indexOf('function applyGameSnapshot(saved)');
  const snapshotEnd = source.indexOf('\n  function ', snapshotStart + 10);
  const snapshot = source.slice(snapshotStart, snapshotEnd);
  assert.match(snapshot, /sanitizeHomeFurnitureProgress\(saved\.homeFurniture\)/);
});

test('placement keyboard controls are isolated from walking and mobile buttons call the same state transitions', () => {
  const keydownStart = source.indexOf('window.addEventListener("keydown"');
  const keydownEnd = source.indexOf('window.addEventListener("keyup"', keydownStart);
  const keydown = source.slice(keydownStart, keydownEnd);
  assert.ok(keydown.indexOf('if (furniturePlacementState)') >= 0);
  assert.ok(keydown.indexOf('if (furniturePlacementState)') < keydown.indexOf('keys.add(key)'));
  assert.match(keydown, /key === "r"/);
  assert.match(keydown, /key === "e"/);
  assert.match(keydown, /key === "escape"/);
  assert.match(keydown, /else if \(\["arrowleft", "a"\]\.includes\(key\)\) moveHomeFurniturePreview/);
  for (const handler of ['furnitureRotateButton', 'furniturePlaceButton', 'furnitureCancelButton']) {
    assert.match(source, new RegExp('document\\.getElementById\\("' + handler + '"\\)'));
  }
  assert.match(source, /function updateFurniturePlacement\(/);
  assert.match(source, /function drawPlacedHomeFurniture\(/);
});

test('placement mode locks player movement without stopping normal world-time advancement', () => {
  const updateStart = source.indexOf('function update(dt)');
  const updateEnd = source.indexOf('\n  function ', updateStart + 10);
  const update = source.slice(updateStart, updateEnd);
  const placement = update.indexOf('if (furniturePlacementState)');
  const worldMinutes = update.indexOf('const gameMinutes = dt * .7');
  assert.ok(placement >= 0 && placement < worldMinutes);
  assert.match(update.slice(placement, worldMinutes), /updateFurniturePlacement\(dt\)/);
  assert.doesNotMatch(update.slice(placement, worldMinutes), /return;/);
  assert.match(update, /Boolean\(furniturePlacementState\)/);
});


test('pedestrian route starts honor map aliases instead of reversing the first safe segment', () => {
  assert.match(source, /const resolvedStartNodeId = route\.nodeIds\?\.\[0\] \|\| startNodeId/);
  assert.match(source, /firstSegment\.from === resolvedStartNodeId/);
  assert.match(source, /ped\.currentNodeId = resolvedStartNodeId/);
});

test('crosswalk stops use front-clearance ownership and never rewind a committed vehicle', () => {
  assert.match(source, /crossingControl\.SAFE_FRONT_CLEARANCE/);
  assert.match(source, /decision\.committed && claim\.phase === "crossing"/);
  assert.match(source, /\? currentEndpointDistance\s*:\s*plannedCenterStopOffset/);
});

test('signal stops follow the actual generated crosswalk instead of stale junction offsets', () => {
  assert.match(source, /const approachCrosswalk = mapModel\.crosswalks\.find/);
  assert.match(source, /crosswalkDistanceFromEndpoint/);
  assert.match(source, /vehicleDimensions\(car\)\.length \/ 2 \+ crossingClearance/);
});

test('world and minimap ignore unsafe legacy pedestrian-only blueprint edges', () => {
  const worldRoads = source.slice(source.indexOf('function drawMapModelRoads()'), source.indexOf('function drawMapModelJunctions()'));
  assert.match(worldRoads, /if \(!edge\.vehicle\) return false/);
  assert.match(worldRoads, /for \(const segment of mapModel\.pedestrianNavigation\.segments\)/);
  const minimap = source.slice(source.indexOf('function drawMapModelMinimap('), source.indexOf('function drawMinimap()'));
  assert.match(minimap, /if \(!edge\.vehicle\) continue/);
  assert.match(minimap, /for \(const segment of mapModel\.pedestrianNavigation\.segments\)/);
});
