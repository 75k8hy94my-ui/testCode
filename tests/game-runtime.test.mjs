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
  assert.match(source, /const normal = \{ x: -pose\.tangent\.y, y: pose\.tangent\.x \}/);
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

test('city rendering uses map parcels and polylines instead of grid-only geometry', () => {
  assert.match(source, /mapModel\.parcels/);
  assert.match(source, /mapModel\.edges/);
  assert.match(source, /edge\.points/);
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
