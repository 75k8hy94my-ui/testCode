import test from 'node:test';
import assert from 'node:assert/strict';
import mapModule from '../game/map-model.js';

const { createMapModel } = mapModule;

test('v2 map validates as a connected Japanese urban fabric', () => {
  const map = createMapModel();
  assert.deepEqual(map.validate(), []);
  assert.equal(map.version, 'japan-v2.1');
  assert.equal(map.worldSize, 10800);
  assert.ok(map.nodes.length >= 45);
  assert.ok(map.edges.length >= 55);
  assert.ok(map.edges.some((edge) => edge.type === 'arterial'));
  assert.ok(map.edges.some((edge) => edge.type === 'collector'));
  assert.ok(map.edges.some((edge) => edge.type === 'alley'));
  assert.ok(map.edges.some((edge) => edge.pedestrian && !edge.vehicle));
});

test('street topology includes dead ends, T junctions, curves, and unequal street widths', () => {
  const map = createMapModel();
  const vehicleDegrees = map.nodes.map((node) => map.neighbors(node.id, { mode:'vehicle' }).length);
  assert.ok(vehicleDegrees.filter((degree) => degree === 1).length >= 4);
  assert.ok(vehicleDegrees.filter((degree) => degree === 3).length >= 5);
  assert.ok(map.edges.filter((edge) => edge.points.length >= 4).length >= 20);
  assert.ok(new Set(map.edges.filter((edge) => edge.vehicle).map((edge) => edge.width)).size >= 8);
});

test('districts are irregular polygons instead of rectangular grid sectors', () => {
  const map = createMapModel();
  assert.ok(map.districts.length >= 7);
  for (const district of map.districts) {
    assert.ok(Array.isArray(district.polygon));
    assert.ok(district.polygon.length >= 5, district.id);
    assert.ok(district.bounds.w > 0 && district.bounds.h > 0, district.id);
  }
});

test('urban fabric contains dense buildings and multiple real open-space types', () => {
  const map = createMapModel();
  assert.ok(map.buildingSites.length >= 180);
  assert.ok(map.buildingSites.filter((site) => site.style === 'residential').length >= 90);
  assert.ok(map.buildingSites.some((site) => site.kind === 'tower'));
  assert.ok(map.openSpaces.some((space) => space.type === 'park'));
  assert.ok(map.openSpaces.some((space) => space.type === 'shrine'));
  assert.ok(map.openSpaces.some((space) => space.type === 'schoolyard'));
  assert.ok(map.openSpaces.some((space) => space.type === 'plaza'));
  assert.ok(map.openSpaces.some((space) => space.type === 'parking'));
  assert.ok(map.landmarks.length >= 4);
  assert.ok(map.vegetation.length >= 50);
});

test('all existing facilities and stations remain addressable', () => {
  const map = createMapModel();
  assert.deepEqual(map.places.map((place) => place.id), ['home','cafe','store','park','gym','library']);
  assert.deepEqual(map.stations.map((station) => station.id), ['west','central','east']);
  for (const place of map.places) {
    assert.ok(map.getNode(place.entranceNodeId));
    assert.ok(map.getNode(place.roadNodeId));
    assert.equal(map.isWalkable(place.x, place.y, 14), true, place.id);
  }
  for (const station of map.stations) {
    assert.equal(map.isWalkable(station.accessX, station.accessY, 14), true, station.id);
  }
});

test('walking and vehicle graphs reach every facility pair', () => {
  const map = createMapModel();
  for (const start of map.places) {
    for (const end of map.places) {
      assert.ok(map.findRoute(start.entranceNodeId, end.entranceNodeId, { mode:'pedestrian' }), start.id + ' -> ' + end.id);
      assert.ok(map.findRoute(start.roadNodeId, end.roadNodeId, { mode:'vehicle' }), start.id + ' -> ' + end.id);
    }
  }
});

test('nearest-road and surface membership distinguish vehicle and pedestrian streets', () => {
  const map = createMapModel();
  const vehicleEdge = map.edges.find((edge) => edge.vehicle);
  const pedestrianEdge = map.edges.find((edge) => edge.pedestrian && !edge.vehicle);
  const vehiclePoint = vehicleEdge.points[Math.floor(vehicleEdge.points.length / 2)];
  const pedestrianPoint = pedestrianEdge.points[Math.floor(pedestrianEdge.points.length / 2)];

  assert.equal(map.nearestRoad(vehiclePoint.x, vehiclePoint.y, { vehicleOnly:true }).edgeId, vehicleEdge.id);
  assert.equal(map.isRoad(pedestrianPoint.x, pedestrianPoint.y, { vehicleOnly:true }), false);
  assert.equal(map.isWalkable(pedestrianPoint.x, pedestrianPoint.y, 8), true);
});

test('all edge polylines stay attached to their declared nodes', () => {
  const map = createMapModel();
  for (const edge of map.edges) {
    const start = map.getNode(edge.from);
    const end = map.getNode(edge.to);
    assert.deepEqual(edge.points[0], { x:start.x, y:start.y });
    assert.deepEqual(edge.points.at(-1), { x:end.x, y:end.y });
  }
});

test('place validation detects a broken entrance connection', () => {
  const map = createMapModel();
  map.edges.find((edge) => edge.id === 'ped-home-entry').pedestrian = false;
  assert.ok(map.validate().includes('place unreachable: home'));
});

test('facility road nodes are connected to the vehicle graph', () => {
  const map = createMapModel();
  for (const place of map.places) {
    assert.ok(map.neighbors(place.roadNodeId, { mode:'vehicle' }).length > 0, place.id);
  }
});

test('station access remains walkable even where road surfaces overlap', () => {
  const map = createMapModel();
  for (const station of map.stations) {
    assert.equal(map.isWalkable(station.accessX, station.accessY, 14), true, station.id);
  }
});

test('vegetation is kept clear of the pedestrian street surface', () => {
  const map = createMapModel();
  for (const tree of map.vegetation) {
    const hit = map.nearestRoad(tree.x, tree.y);
    assert.ok(!hit || hit.distance > hit.edge.width / 2 + 15, tree.spaceId);
  }
});


test('facility entrances are separate from road-clear building footprints', () => {
  const map = createMapModel();
  for (const place of map.places.filter((place) => place.id !== 'park')) {
    assert.ok(place.building, place.id);
    assert.notDeepEqual([place.building.x, place.building.y], [place.x, place.y], place.id);
    assert.ok(place.building.w >= 300, place.id);
    assert.ok(place.building.h >= 260, place.id);
  }
  assert.deepEqual(map.validate(), []);
});

test('cafe body is not centered on its street-side interaction entrance', () => {
  const map = createMapModel();
  const cafe = map.places.find((place) => place.id === 'cafe');
  assert.deepEqual([cafe.x, cafe.y], [4230, 5560]);
  assert.deepEqual(cafe.building, { x:4380, y:5784, w:300, h:270 });
});
