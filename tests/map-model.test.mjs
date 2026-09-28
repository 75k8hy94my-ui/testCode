import test from 'node:test';
import assert from 'node:assert/strict';
import mapModule from '../game/map-model.js';

const { createMapModel } = mapModule;

test('v2 map validates as a connected Japanese urban fabric', () => {
  const map = createMapModel();
  assert.deepEqual(map.validate(), []);
  assert.equal(map.version, 'japan-v2.5');
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

test('pedestrian offset paths stay continuous when a curved road polyline changes segments', () => {
  const map = createMapModel();
  const knownProblemCorners = new Map([
    ['collector-library', 524.6],
    ['residential-court-southwest', 627.55]
  ]);
  const verifiedKnownCorners = new Set();

  for (const edge of map.edges.filter((value) => value.pedestrian)) {
    let along = 0;
    for (let index = 1; index < edge.points.length - 1; index += 1) {
      const previous = edge.points[index - 1];
      const point = edge.points[index];
      along += Math.hypot(point.x - previous.x, point.y - previous.y);
      const isKnownProblem = Math.abs((knownProblemCorners.get(edge.id) ?? Infinity) - along) < .02;
      if (isKnownProblem) verifiedKnownCorners.add(edge.id);

      for (const directionSign of [1, -1]) {
        const before = map.pedestrianOffsetPose?.(edge.id, along - .01, directionSign, 62) || null;
        const after = map.pedestrianOffsetPose?.(edge.id, along + .01, directionSign, 62) || null;
        assert.ok(before && after, 'the map model should provide pedestrian offset poses');
        assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < .1,
          edge.id + ' should not jump sideways at an internal polyline corner');
      }
    }
  }

  assert.deepEqual([...verifiedKnownCorners].sort(), [...knownProblemCorners.keys()].sort());
});


test('two-way vehicle streets are wide enough for collision geometry', () => {
  const map = createMapModel();
  const vehicleEdges = map.edges.filter((edge) => edge.vehicle);
  assert.ok(vehicleEdges.length > 0);
  assert.ok(vehicleEdges.every((edge) => edge.width >= 80));
  assert.ok(vehicleEdges.some((edge) => edge.sourceWidth < edge.width));
});

test('vehicle streets expose a separate pedestrian shoulder', () => {
  const map = createMapModel();
  for (const edge of map.edges.filter((value) => value.vehicle && value.pedestrian)) {
    const corridor = map.pedestrianCorridor(edge.id);
    assert.ok(corridor, edge.id);
    assert.ok(corridor.width >= 38, edge.id);
    assert.ok(corridor.innerOffset > edge.width / 2, edge.id);
    assert.ok(corridor.centerOffset > corridor.innerOffset, edge.id);
    assert.ok(corridor.outerOffset > corridor.centerOffset, edge.id);
  }
});


test('major signalized junctions avoid five-way vehicle conflicts', () => {
  const map = createMapModel();
  const degree = (nodeId) => map.neighbors(nodeId, { mode:'vehicle' }).length;

  assert.equal(degree('central'), 3);
  assert.equal(degree('central-west'), 3);
  assert.equal(degree('east-junction'), 4);
  assert.ok(degree('west-junction') <= 4);

  const centralEdges = map.neighbors('central', { mode:'vehicle' }).map(({ edge }) => edge.id);
  assert.ok(!centralEdges.includes('shopping-central-cafe'));
  assert.ok(!centralEdges.includes('shopping-central-market'));

  const eastEdges = map.neighbors('east-junction', { mode:'vehicle' }).map(({ edge }) => edge.id);
  assert.ok(!eastEdges.includes('shopping-store-east'));
});

test('junction geometry derives ordered stop and crossing offsets per approach', () => {
  const map = createMapModel();
  const approaches = map.neighbors('west-junction', { mode:'vehicle' }).map(({ edge }) => edge);
  const geometries = approaches.map((edge) => map.junctionGeometry('west-junction', edge.id));

  for (const geometry of geometries) {
    assert.ok(geometry);
    assert.ok(geometry.crossingInnerEdge > geometry.conflictBoundary);
    assert.ok(geometry.crossingOuterEdge > geometry.crossingInnerEdge);
    assert.ok(geometry.stopOffset > geometry.crossingOuterEdge);
    assert.ok(geometry.yieldOffset > geometry.conflictBoundary);
  }

  const westbound = map.junctionGeometry('west-junction', 'arterial-west-core');
  const northApproach = map.junctionGeometry('west-junction', 'collector-west-north');
  assert.notEqual(Math.round(westbound.stopOffset), Math.round(northApproach.stopOffset));
  assert.ok(northApproach.stopOffset > westbound.stopOffset);
});

test('junction center pads no longer use the widest road as a circular radius', () => {
  const map = createMapModel();
  const incident = map.neighbors('west-junction', { mode:'vehicle' }).map(({ edge }) => edge);
  const widestHalf = Math.max(...incident.map((edge) => edge.width / 2));
  const generated = map.junctionGeometry('west-junction');

  assert.ok(generated.padRadius < widestHalf);
  assert.ok(generated.conflictRadius >= generated.padRadius);
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

test('residential districts have connected local streets and street-fronting low-rise homes', () => {
  const map = createMapModel();
  const localRoads = map.edges.filter((edge) => edge.id.startsWith('housing-lane-'));
  const homes = map.buildingSites.filter((site) => ['west-housing', 'south-housing', 'east-housing'].includes(site.zoneId));

  assert.ok(localRoads.length >= 5);
  assert.ok(localRoads.every((edge) => edge.vehicle && edge.sourceWidth >= 52 && edge.sourceWidth <= 72));
  assert.ok(homes.length >= 100);
  assert.ok(homes.filter((home) => home.zoneId === 'west-housing').length >= 28);
  assert.ok(homes.filter((home) => home.zoneId === 'south-housing').length >= 40);
  assert.ok(homes.filter((home) => home.zoneId === 'east-housing').length >= 26);
  for (const home of homes) {
    const road = map.getEdge(home.frontageEdgeId);
    assert.ok(road?.vehicle, home.id + ' must face a vehicle street');
    assert.ok(['residential', 'alley', 'collector'].includes(road.type), home.id + ' must face a neighborhood street');
    assert.equal(home.houseStyle, 'detached');
    assert.ok(home.floors <= 2, home.id + ' must remain low-rise');
    assert.ok(home.frontSetback >= 16 && home.frontSetback <= 34);
    assert.ok(map.nearestRoad(home.x + home.w / 2, home.y + home.h / 2, { vehicleOnly:true }).distance < 180);

    const center = { x:home.x + home.w / 2, y:home.y + home.h / 2 };
    let closest = null;
    for (let i = 1; i < road.points.length; i += 1) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / lengthSquared));
      const projection = { x:a.x + dx * t, y:a.y + dy * t };
      const distance = Math.hypot(center.x - projection.x, center.y - projection.y);
      if (!closest || distance < closest.distance) closest = { projection, distance, tangent:{ x:dx / Math.sqrt(lengthSquared), y:dy / Math.sqrt(lengthSquared) } };
    }
    const normal = { x:-closest.tangent.y, y:closest.tangent.x };
    const support = Math.abs(normal.x) * home.w / 2 + Math.abs(normal.y) * home.h / 2;
    const measuredSetback = closest.distance - support - road.width / 2;
    assert.ok(measuredSetback >= home.frontSetback - 1, home.id + ' must preserve its declared street setback: ' + JSON.stringify({ measuredSetback, declared:home.frontSetback, edgeId:road.id }));
  }
  assert.deepEqual(map.validate(), []);
});

test('enterable home exterior matches surrounding detached-house scale', () => {
  const map = createMapModel();
  const playerHome = map.places.find((place) => place.id === 'home');
  const homes = map.buildingSites.filter((site) => ['west-housing', 'south-housing', 'east-housing'].includes(site.zoneId));
  const areas = homes.map((home) => home.w * home.h).sort((a, b) => a - b);
  const medianArea = areas[Math.floor(areas.length / 2)];
  const playerHomeArea = playerHome.building.w * playerHome.building.h;

  assert.ok(playerHome.building.w >= 100 && playerHome.building.w <= 140);
  assert.ok(playerHome.building.h >= 80 && playerHome.building.h <= 115);
  assert.ok(playerHomeArea >= medianArea * .75);
  assert.ok(playerHomeArea <= medianArea * 1.45);

  for (const home of homes) {
    assert.ok(home.w >= 90 && home.w <= 130, home.id + ' width');
    assert.ok(home.h >= 74 && home.h <= 108, home.id + ' height');
  }
});

test('all existing facilities and stations remain addressable', () => {
  const map = createMapModel();
  assert.deepEqual(map.places.map((place) => place.id), ['home','cafe','store','park','gym','library','community-center']);
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

test('community center has a walkable entrance, civic-road access, and clear building footprint', () => {
  const map = createMapModel();
  const center = map.places.find((place) => place.id === 'community-center');

  assert.ok(center);
  assert.equal(center.name, '若葉コミュニティセンター');
  assert.ok(center.building.w >= 300 && center.building.h >= 260);
  assert.ok(map.getNode(center.entranceNodeId));
  assert.ok(map.findRoute('central-station-entry', center.entranceNodeId, { mode:'pedestrian' }));
  assert.ok(map.neighbors(center.roadNodeId, { mode:'vehicle' }).length > 0);
  assert.deepEqual(map.validate(), []);
  assert.equal(map.version, 'japan-v2.5');
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
  const vehiclePoint = vehicleEdge.points[Math.floor(vehicleEdge.points.length / 2)];
  const pedestrianSample = map.edges
    .filter((edge) => edge.pedestrian && !edge.vehicle)
    .flatMap((edge) => edge.points.slice(1).map((point, index) => ({ edge, point, start:edge.points[index] })))
    .map(({ edge, start, point }) => ({
      edge,
      point:{ x:(start.x + point.x) / 2, y:(start.y + point.y) / 2 }
    }))
    .find(({ point }) => !map.isRoad(point.x, point.y, { vehicleOnly:true }));
  assert.ok(pedestrianSample);
  const pedestrianEdge = pedestrianSample.edge;
  const pedestrianPoint = pedestrianSample.point;

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
  for (const place of map.places.filter((place) => !['park', 'home'].includes(place.id))) {
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
