import test from 'node:test';
import assert from 'node:assert/strict';
import mapModule from '../game/map-model.js';

const { createMapModel } = mapModule;

test('map model validates a connected Japanese city blueprint', () => {
  const map = createMapModel();
  assert.deepEqual(map.validate(), []);
  assert.equal(map.worldSize, 10800);
  assert.ok(map.edges.length >= 20);
  assert.ok(map.edges.some((edge) => edge.type === 'arterial'));
  assert.ok(map.edges.some((edge) => edge.type === 'alley'));
  assert.ok(map.edges.some((edge) => edge.pedestrian && !edge.vehicle));
});

test('map model keeps all game facilities and stations addressable', () => {
  const map = createMapModel();
  assert.deepEqual(
    map.places.map((place) => place.id),
    ['home', 'cafe', 'store', 'park', 'gym', 'library']
  );
  assert.deepEqual(
    map.stations.map((station) => station.id),
    ['west', 'central', 'east']
  );
  for (const place of map.places) {
    assert.ok(map.getNode(place.entranceNodeId));
    assert.ok(map.getNode(place.roadNodeId));
  }
});

test('walking and vehicle graphs reach every existing destination', () => {
  const map = createMapModel();
  const placeNodes = map.places.map((place) => place.entranceNodeId);
  for (const start of placeNodes) {
    for (const end of placeNodes) {
      assert.ok(map.findRoute(start, end, { mode: 'pedestrian' }));
    }
  }
  const roadNodes = map.places.map((place) => place.roadNodeId);
  for (const start of roadNodes) {
    for (const end of roadNodes) {
      assert.ok(map.findRoute(start, end, { mode: 'vehicle' }));
    }
  }
});

test('nearest road distinguishes vehicle streets from pedestrian-only paths', () => {
  const map = createMapModel();
  const vehicleEdge = map.edges.find((edge) => edge.vehicle);
  const pedestrianEdge = map.edges.find((edge) => edge.pedestrian && !edge.vehicle);
  const vehiclePoint = vehicleEdge.points[Math.floor(vehicleEdge.points.length / 2)];
  const pedestrianPoint = pedestrianEdge.points[Math.floor(pedestrianEdge.points.length / 2)];

  assert.equal(map.nearestRoad(vehiclePoint.x, vehiclePoint.y, { vehicleOnly: true }).edgeId, vehicleEdge.id);
  assert.equal(map.isRoad(pedestrianPoint.x, pedestrianPoint.y, { vehicleOnly: true }), false);
  assert.equal(map.isWalkable(pedestrianPoint.x, pedestrianPoint.y, 8), true);
});

test('map model exposes irregular polylines and shared endpoints', () => {
  const map = createMapModel();
  assert.ok(map.edges.some((edge) => edge.points.length > 2));
  for (const edge of map.edges) {
    const start = map.getNode(edge.from);
    const end = map.getNode(edge.to);
    assert.deepEqual(edge.points[0], { x: start.x, y: start.y });
    assert.deepEqual(edge.points.at(-1), { x: end.x, y: end.y });
  }
});


test('place validation requires a real pedestrian path to the road node', () => {
  const map = createMapModel();
  map.edges.find((edge) => edge.id === 'ped-home-entry').pedestrian = false;
  assert.ok(map.validate().includes('place unreachable: home'));
});

test('every facility road node is attached to the vehicle graph', () => {
  const map = createMapModel();
  for (const place of map.places) {
    assert.ok(map.neighbors(place.roadNodeId, { mode: 'vehicle' }).length > 0, place.id);
    assert.ok(map.findRoute(place.entranceNodeId, place.roadNodeId, { mode: 'pedestrian' }), place.id);
  }
});
