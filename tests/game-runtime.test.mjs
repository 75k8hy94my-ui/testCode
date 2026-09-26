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

test('cars, pedestrians, route guidance, and markings share stop-line geometry', () => {
  assert.match(source, /function signalGeometryAtNode\(nodeId, approachEdge\)/);
  assert.match(source, /stopOffset: signalGeometryAtNode\(node\.id, routeEdge\)\.stopOffset/);
  assert.match(source, /const geometry = signalGeometryAtNode\(endpoint\.id, edge\)/);
  assert.match(source, /function drawMapModelIntersectionMarkings\(\)/);
  assert.match(source, /drawMapModelIntersectionMarkings\(\);/);
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
