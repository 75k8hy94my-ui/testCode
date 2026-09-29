import test from 'node:test';
import assert from 'node:assert/strict';
import mapModule from '../game/map-model.js';

const { createMapModel } = mapModule;

test('v2 map validates as a connected Japanese urban fabric', () => {
  const map = createMapModel();
  assert.deepEqual(map.validate(), []);
  assert.equal(map.version, 'japan-v2.9');
  assert.equal(map.worldSize, 10800);
  assert.ok(map.nodes.length >= 45);
  assert.ok(map.edges.length >= 55);
  assert.ok(map.edges.some((edge) => edge.type === 'arterial'));
  assert.ok(map.edges.some((edge) => edge.type === 'collector'));
  assert.ok(map.edges.some((edge) => edge.type === 'alley'));
  assert.ok(map.edges.some((edge) => edge.pedestrian && !edge.vehicle));
});

test('the laundromat is a named facility with a walkable route from the home entrance', () => {
  const map = createMapModel();
  const laundromat = map.places.find((place) => place.id === 'laundromat');
  assert.ok(laundromat);
  assert.equal(laundromat.name, '若葉コインランドリー');
  assert.ok(laundromat.building);
  assert.deepEqual(map.validate(), []);
  const route = map.findRoute('home-entrance', laundromat.entranceNodeId, { mode:'pedestrian' });
  assert.ok(route, 'home should connect to the laundromat by pedestrian paths');
  assert.ok(route.edgeIds.length > 0);
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

test('every generated building shares frontage orientation, entrance anchor, and collision footprint', () => {
  const map = createMapModel();
  for (const site of map.buildingSites) {
    const frontage = site.frontageGeometry;
    assert.ok(frontage, site.id + ' frontage record');
    assert.equal(frontage.side, site.frontage, site.id + ' facade side');
    assert.equal(frontage.roadEdgeId, site.frontageEdgeId, site.id + ' access road');
    assert.deepEqual(frontage.footprint, { x:site.x,y:site.y,w:site.w,h:site.h }, site.id + ' collision is visual footprint');
    assert.ok(map.getEdge(frontage.roadEdgeId)?.vehicle, site.id + ' frontage must touch a vehicle street');
    const entrance = frontage.entrance;
    const center = { x:site.x + site.w / 2,y:site.y + site.h / 2 };
    const entranceDepth = (entrance.x-center.x)*frontage.normal.x + (entrance.y-center.y)*frontage.normal.y;
    assert.ok(Math.abs(entranceDepth - site.h / 2) < 1e-6, site.id + ' entrance lies on its road-facing facade');
    assert.equal(site.collisionFootprint.length, 4, site.id + ' collision uses its oriented polygon');
    assert.ok(site.collisionFootprint.every((point) => point.x >= site.collisionBounds.x - 1e-6 && point.x <= site.collisionBounds.x + site.collisionBounds.w + 1e-6), site.id + ' oriented bounds contain collision polygon');
    assert.ok(site.collisionFootprint.every((point) => point.y >= site.collisionBounds.y - 1e-6 && point.y <= site.collisionBounds.y + site.collisionBounds.h + 1e-6), site.id + ' oriented bounds contain collision polygon');
  }
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

test('all current facilities and stations remain addressable', () => {
  const map = createMapModel();
  assert.deepEqual(map.places.map((place) => place.id), ['home','arcade','cafe','store','park','gym','library','pet-shelter','community-center','fuel-station','delivery-depot','public-bath','laundromat','clinic']);
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
  assert.equal(map.version, 'japan-v2.9');
});

test('station arcade has a walkable plaza route, legible identity, and collision-free footprint', () => {
  const map = createMapModel();
  const arcade = map.places.find((place) => place.id === 'arcade');
  assert.ok(arcade);
  assert.equal(arcade.name, '若葉ゲームコーナー');
  assert.equal(arcade.symbol, '遊');
  assert.equal(arcade.roadNodeId, 'north-market');
  assert.ok(map.findRoute('central-station-entry', arcade.entranceNodeId, { mode:'pedestrian' }));
  assert.equal(map.getEdge('ped-arcade-entry').vehicle, false);
  assert.equal(map.getEdge('ped-arcade-entry').pedestrian, true);
  assert.equal(map.isWalkable(arcade.x, arcade.y, 14), true);
  assert.ok(arcade.building.w >= 300 && arcade.building.h >= 260);
  assert.deepEqual(map.validate(), []);
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
  assert.notDeepEqual([cafe.x, cafe.y], [cafe.building.x, cafe.building.y]);
  assert.deepEqual(
    { x:cafe.building.x, y:cafe.building.y, w:cafe.building.w, h:cafe.building.h },
    { x:4380, y:5784, w:300, h:270 }
  );
  assert.ok(cafe.building.frontageGeometry);
  const hit = map.nearestRoad(cafe.x, cafe.y, { vehicleOnly:true });
  assert.ok(hit);
  assert.ok(hit.distance >= hit.edge.width / 2 + 18);
});

test('Wakaba fuel station is reachable on foot and by car without map collisions', () => {
  const map = createMapModel();
  const station = map.places.find((place) => place.id === 'fuel-station');
  assert.ok(station);
  assert.equal(station.name, '若葉石油');
  assert.equal(station.type, 'fuel-station');
  assert.ok(map.findRoute('home-entrance', station.entranceNodeId, { mode:'pedestrian' }));
  assert.ok(map.findRoute('home-road', station.roadNodeId, { mode:'vehicle' }));
  assert.deepEqual(map.validate(), []);
});

test('Wakaba animal shelter has a reachable pedestrian entrance and collision-safe footprint', () => {
  const map = createMapModel();
  const shelter = map.places.find((place) => place.id === 'pet-shelter');
  assert.ok(shelter);
  assert.equal(shelter.name, 'わかば動物保護センター');
  assert.equal(shelter.entranceNodeId, 'pet-shelter-entrance');
  assert.deepEqual(
    { x:shelter.building.x, y:shelter.building.y, w:shelter.building.w, h:shelter.building.h },
    { x:1580, y:6560, w:320, h:260 }
  );
  assert.ok(shelter.building.frontageGeometry);
  assert.ok(map.findRoute('home-entrance', shelter.entranceNodeId, { mode:'pedestrian' }));
  const entrance = map.getNode(shelter.entranceNodeId);
  assert.equal(map.isWalkable(entrance.x, entrance.y, 14), true);
  const spur = map.getEdge('ped-pet-shelter-entry');
  assert.equal(spur.pedestrian, true);
  assert.equal(spur.vehicle, false);
  assert.deepEqual(map.validate(), []);
});

test('Wakaba courier depot is walkable, connected to the home road, and collision-free', () => {
  const map = createMapModel();
  const depot = map.places.find((place) => place.id === 'delivery-depot');
  assert.ok(depot);
  assert.equal(depot.name, '若葉便 配達受付所');
  assert.equal(depot.type, 'delivery-depot');
  assert.ok(map.findRoute('home-entrance', depot.entranceNodeId, { mode:'pedestrian' }));
  assert.ok(map.findRoute('home-road', depot.roadNodeId, { mode:'vehicle' }));
  assert.equal(map.isWalkable(depot.x, depot.y, 14), true);
  assert.deepEqual(map.validate(), []);
});

test('Wakaba bathhouse is reachable from home and does not collide with the map', () => {
  const map = createMapModel();
  const bathhouse = map.places.find((place) => place.id === 'public-bath');
  assert.ok(bathhouse);
  assert.equal(bathhouse.name, '若葉湯');
  assert.ok(map.findRoute('home-entrance', bathhouse.entranceNodeId, { mode:'pedestrian' }));
  assert.ok(map.findRoute('home-road', bathhouse.roadNodeId, { mode:'vehicle' }));
  const home = map.places.find((place) => place.id === 'home');
  assert.ok(Math.hypot(bathhouse.x - home.x, bathhouse.y - home.y) < 500);
  assert.ok(Math.hypot(bathhouse.building.x - bathhouse.x, bathhouse.building.y - bathhouse.y) < 275);
  assert.deepEqual(map.validate(), []);
});

test('Wakaba clinic is reachable from home and clear of roads and generated buildings', () => {
  const map = createMapModel();
  const clinic = map.places.find((place) => place.id === 'clinic');
  assert.ok(clinic);
  assert.equal(clinic.name, '若葉診療所');
  assert.ok(map.findRoute('home-entrance', clinic.entranceNodeId, { mode:'pedestrian' }));
  assert.ok(map.findRoute('home-road', clinic.roadNodeId, { mode:'vehicle' }));
  assert.equal(map.isWalkable(clinic.x, clinic.y, 14), true);
  assert.deepEqual(map.validate(), []);
});


test('enterable facility buildings share road-frontage orientation, entrance geometry, and collision geometry', () => {
  const map = createMapModel();
  for (const place of map.places.filter((value) => value.building)) {
    const building = place.building;
    const frontage = building.frontageGeometry;
    assert.ok(frontage, place.id + ' frontage record');
    assert.equal(frontage.roadEdgeId, building.frontageEdgeId, place.id + ' frontage edge');
    assert.ok(map.getEdge(frontage.roadEdgeId)?.vehicle, place.id + ' frontage road');
    assert.equal(building.collisionFootprint.length, 4, place.id + ' oriented collision polygon');
    assert.ok(Number.isFinite(frontage.entrance.x) && Number.isFinite(frontage.entrance.y), place.id + ' facade entrance');
    const road = map.getEdge(frontage.roadEdgeId);
    const roadHeading = (() => {
      let nearest = null;
      for (let i = 1; i < road.points.length; i += 1) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((building.x - a.x) * dx + (building.y - a.y) * dy) / l2));
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        const d = Math.hypot(building.x - px, building.y - py);
        if (!nearest || d < nearest.distance) nearest = { distance:d, angle:Math.atan2(dy, dx) };
      }
      return nearest.angle;
    })();
    const angleDelta = Math.atan2(Math.sin(frontage.angle - roadHeading), Math.cos(frontage.angle - roadHeading));
    assert.ok(Math.abs(Math.sin(angleDelta)) < 1e-6, place.id + ' building must align with its frontage road');
  }
  assert.deepEqual(map.validate(), []);
});


test('all facility and station interaction points are outside the vehicle carriageway', () => {
  const map = createMapModel();
  for (const place of map.places) {
    const hit = map.nearestRoad(place.x, place.y, { vehicleOnly:true });
    assert.ok(!hit || hit.distance >= hit.edge.width / 2 + 8, place.id);
    assert.equal(map.isWalkable(place.x, place.y, 14), true, place.id);
  }
  for (const station of map.stations) {
    const hit = map.nearestRoad(station.accessX, station.accessY, { vehicleOnly:true });
    assert.ok(!hit || hit.distance >= hit.edge.width / 2 + 8, station.id);
    assert.equal(map.isWalkable(station.accessX, station.accessY, 14), true, station.id);
  }
});

test('vehicle roads never cross or overlap without a shared junction node', () => {
  const map = createMapModel();
  assert.deepEqual(
    map.validate().filter((error) => error.includes('vehicle roads cross without junction node') || error.includes('vehicle road surfaces overlap without junction node')),
    []
  );
});

test('public pedestrian routing delegates to the typed safe navigation graph', () => {
  const map = createMapModel();
  const route = map.findRoute('home-entrance', 'laundromat-entrance', { mode:'pedestrian' });
  assert.ok(route);
  assert.deepEqual(route.edgeIds, route.segmentIds);
  assert.ok(route.edgeIds.every((id) => map.pedestrianNavigation.segmentsById.has(id)));
});
