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

test('game keeps a timer fallback when requestAnimationFrame is unavailable', () => {
  assert.match(source, /const requestFrame = typeof window\.requestAnimationFrame === "function"/);
  assert.match(source, /window\.setTimeout\(\(\) => callback\(performance\.now\(\)\), 16\)/);
  assert.match(source, /requestFrame\(frame\)/);
});

test('game reports an unavailable canvas context instead of failing silently', () => {
  assert.match(source, /typeof canvas\.getContext === "function"/);
  assert.match(source, /Canvas API を利用できません/);
});

test('status HUD masks canvas content at the top-left edge', () => {
  assert.match(css, /#hud\{[^}]*z-index:5/);
  assert.match(css, /\.status-card\{[^}]*z-index:6/);
  assert.match(css, /\.status-card\{[^}]*left:0/);
  assert.match(css, /\.status-card\{[^}]*border-radius:0 12px 12px 0/);
  assert.match(css, /\.status-card\{[^}]*background:rgba\(15,22,18,\.98\)/);
});

test('game defines the traffic signal state helper used by rendering and updates', () => {
  assert.match(source, /function signalStateAt\(worldX, worldY, orientation\)/);
  assert.match(source, /signalStateAt\(signal\.x, signal\.y, signal\.orientation\)/);
  assert.match(source, /signalStateAt\(wx, wy, "h"\)/);
  assert.match(source, /const hasHorizontal = incidentEdges\.some/);
  assert.match(source, /const hasVertical = incidentEdges\.some/);
  assert.match(source, /drawPedestrianSignal\(p\.x - poleOffset/);
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
  assert.match(source, /function buildTrafficRoute\(car, startNodeId, goalNodeId\)/);
  assert.match(source, /route = mapModel\.findRoute\(startNodeId, goalNodeId, \{ mode: "vehicle" \}\)/);
  assert.match(source, /function advanceTrafficRoute\(car\)/);
  assert.match(source, /car\.routeIndex \+= 1/);
  assert.match(source, /while \(remaining > 0 && transitions < 4\)/);
});

test('ambient pedestrians have destination plans, route states, and signal-aware crossings', () => {
  assert.match(source, /function buildPedestrianPlan\(ped, startNodeId, goalNodeId\)/);
  assert.match(source, /ped\.state = "walking"/);
  assert.match(source, /ped\.state = "waiting"/);
  assert.match(source, /ped\.state = "staying"/);
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

test('ambient pedestrians seed the active central roads', () => {
  assert.match(source, /const nearbyPedestrianPlaces = \["cafe", "store", "home"\]/);
  assert.match(source, /i < 30 && nearbyPedestrianPlaces\.length/);
  assert.match(source, /function seedPedestriansNearActor\(\)/);
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
  assert.match(source, /Math\.abs\(\(other\.laneOffset \|\| 0\) - \(car\.laneOffset \|\| 0\)\) > 18/);
});

test('reverse-direction pedestrians start from the correct edge end', () => {
  assert.match(source, /ped\.along = ped\.directionSign > 0 \? 0 : ped\.edgeLength/);
  assert.match(source, /ped\.along = ped\.directionSign > 0 \? initialAlong : Math\.max\(0, ped\.edgeLength - initialAlong\)/);
  assert.match(source, /edge\.vehicle \? edge\.width \/ 2 \+ 5 : Math\.min\(10, edge\.width \* \.2\)/);
});

test('stuck pedestrian recovery stays on the current sidewalk without teleporting', () => {
  assert.match(source, /Recovery must never switch sidewalks or rebuild from an arbitrary node/);
  assert.match(source, /requestPedestrianAvoidance\(ped, extra, 1\.1\)/);
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
  assert.match(source, /generatePedestrians\(\);\s*migrateCarToCurrentRoadIfNeeded\(\);\s*loadGame\(\);/);
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
  assert.match(source, /const vehicleSurface = \(edge\) =>/);
  assert.match(source, /edge\.type === "alley" \? "#777873"/);
  assert.match(source, /edge\.vehicle && edge\.type === "arterial"/);
  assert.match(source, /edge\.vehicle && edge\.type === "collector" && edge\.width >= 112/);
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

test('home map uses the street world scale and follows the player camera', () => {
  const viewport = source.slice(source.indexOf('function homeInteriorViewport'), source.indexOf('function homeToScreen'));
  assert.match(viewport, /const scale = Math\.max\(1, fitScale\)/);
  assert.match(viewport, /state\.player\.homeX \* scale/);
  assert.match(viewport, /state\.player\.homeY \* scale/);
  assert.doesNotMatch(viewport, /1\.22/);
});
