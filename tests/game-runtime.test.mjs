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

test('game loads the community center schedule model before the runtime', () => {
  assert.match(html, /<script src="\.\/community-center\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('community-center.js') < html.indexOf('game.js'));
});

test('community garden model loads before game runtime and progresses with absolute game time', () => {
  assert.match(html, /<script src="\.\/community-garden\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('community-garden.js') < html.indexOf('game.js'));
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
  assert.match(html, /map-model\.js\?v=20260929-wakaba-clinic-1/);
  assert.match(html, /game\.js\?v=20260929-wakaba-clinic-1/);
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
  assert.match(source, /const gender = specialGender \|\| \(hash2\(index, 81, 16025\) < \.5 \? "male" : "female"\)/);
  assert.match(source, /ageGroup:citizenAgeGroup\(age\)/);
  assert.match(source, /name:citizenName\(index, gender\)/);
  assert.match(source, /appearance:personAppearanceFromSeed\(i, profile\)/);
  assert.match(source, /const ageSpeedFactor = profile\.ageGroup === "senior"/);
  assert.match(source, /baseSpeed,/);
  assert.match(source, /speed:baseSpeed/);
});

test('named citizens have authored gender presentation', () => {
  assert.match(source, /specialNpcId === "sora" \? "male"/);
  assert.match(source, /specialNpcId === "aoi" \|\| specialNpcId === "mei" \? "female"/);
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
  assert.match(source, /Math\.abs\(\(other\.laneOffset \|\| 0\) - \(car\.laneOffset \|\| 0\)\) > 20/);
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
  assert.match(source, /ped\.along = ped\.directionSign > 0 \? 0 : ped\.edgeLength/);
  assert.match(source, /ped\.along = ped\.directionSign > 0 \? initialAlong : Math\.max\(0, ped\.edgeLength - initialAlong\)/);
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

test('pedestrian generation spaces walkers before the first frame', () => {
  assert.match(source, /function pedestrianSpawnSpacing\(edgeId, edgeLength, along\)/);
  assert.match(source, /pedestrianSpawnSpacing\(ped\.edgeId, ped\.edgeLength, ped\.along\)/);
});

test('pedestrian route progress remains inside the active edge bounds', () => {
  assert.match(source, /ped\.along = clamp\(ped\.along, 0, edgeLength\);/);
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


test('fresh player and fixed NPC positions follow current map anchors', () => {
  assert.match(source, /player:\s*\{\s*x: HOME\.x,\s*y: HOME\.y,/);
  assert.match(source, /id: "aoi"[\s\S]*x: PARK\.x - 60, y: PARK\.y/);
  assert.match(source, /id: "mei"[\s\S]*x: LIBRARY\.x, y: LIBRARY\.y - 45/);
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
  assert.match(source, /ctx\.lineTo\(p\.x, p\.y\)/);
});

test('facility buildings participate in player collision', () => {
  assert.match(source, /function placeBuildingRect\(place\)/);
  assert.match(source, /for \(const place of PLACES\)/);
  assert.match(source, /const facility = placeBuildingRect\(place\)/);
  assert.match(source, /circleRectCollision\(x, y, radius, facility\)/);
});

test('home interior transitions preserve outdoor position and use a separate scene', () => {
  assert.ok(source.includes("state.player.outdoorHomeX = state.player.x;"));
  assert.ok(source.includes("state.player.x = Number.isFinite(state.player.outdoorHomeX) ? state.player.outdoorHomeX : HOME.x;"));
  assert.match(source, /function render\(\)[\s\S]*if \(state\.player\.inHome\)[\s\S]*drawHomeInterior\(\)/);
  assert.match(source, /if \(place\.id === "home"\)[\s\S]*addChoice\("自宅に入る"[\s\S]*enterHome\(\)/);
});

test('home movement is slightly faster than normal walking', () => {
  assert.match(source, /const speed = running \? RUN_SPEED \* 1\.08 : WALK_SPEED \* 1\.18/);
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
  assert.match(viewport, /state\.player\.homeX \* scale/);
  assert.match(viewport, /state\.player\.homeY \* scale/);
  assert.doesNotMatch(viewport, /1\.22/);
});
