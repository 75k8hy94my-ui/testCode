import test from 'node:test';
import assert from 'node:assert/strict';
import mapModule from '../game/map-model.js';
import navigationModule from '../game/pedestrian-navigation.js';

const { createMapModel } = mapModule;
const { buildGraph, findRoute, nearestNode, resolveNodeId, poseAt } = navigationModule;

test('map model exposes deterministic typed sidewalk, crosswalk, and facility access segments', () => {
  const map = createMapModel();
  const graph = map.pedestrianNavigation;
  assert.ok(graph, 'the map should own its pedestrian navigation graph');
  assert.ok(graph.segments.length > 0);
  assert.ok(graph.segments.some((segment) => segment.type === 'sidewalk'));
  assert.ok(graph.segments.some((segment) => segment.type === 'crosswalk'));
  assert.ok(graph.segments.some((segment) => segment.type === 'facility-access'));
  assert.ok(graph.segments.every((segment) => Number.isFinite(segment.length) && segment.length > 0));
  assert.ok(graph.segments.every((segment) => segment.points.length >= 2));
  assert.deepEqual(
    graph.segments.map(({ id }) => id),
    createMapModel().pedestrianNavigation.segments.map(({ id }) => id)
  );
});

test('citizen home and work anchors can exclude road-crossing nodes', () => {
  const map = createMapModel();
  const graph = map.pedestrianNavigation;
  const crossingNodes = new Set(graph.crosswalks.flatMap((crossing) => crossing.endpointNodeIds));
  const site = map.buildingSites.find((value) => value.use === 'residential');
  const hit = nearestNode(graph, site.x + site.w / 2, site.y + site.h / 2, { excludeNodeIds:crossingNodes });
  assert.ok(hit);
  assert.equal(crossingNodes.has(hit.nodeId), false);
  for (const candidate of map.buildingSites.filter((value) => ['residential','mixed-low','commercial','mixed'].includes(value.use))) {
    const anchor = nearestNode(graph, candidate.x + candidate.w / 2, candidate.y + candidate.h / 2, { excludeNodeIds:crossingNodes });
    assert.ok(anchor, candidate.id + ' should have a non-crossing pedestrian anchor');
    assert.equal(crossingNodes.has(anchor.nodeId), false, candidate.id + ' must not hide a citizen on a crosswalk');
  }
});

test('crosswalk records are stable map geometry with endpoint, road, and signal metadata', () => {
  const map = createMapModel();
  const crossings = map.pedestrianNavigation.crosswalks;
  assert.ok(crossings.some((crossing) => crossing.signalized));
  assert.ok(crossings.some((crossing) => !crossing.signalized));
  for (const crossing of crossings) {
    assert.ok(crossing.id);
    assert.ok(map.getEdge(crossing.roadEdgeId)?.vehicle);
    assert.ok(Number.isFinite(crossing.along));
    assert.ok(Number.isFinite(crossing.length) && crossing.length > 0);
    assert.ok(Number.isFinite(crossing.depth) && crossing.depth >= 18);
    assert.ok(crossing.endpoints[0] && crossing.endpoints[1]);
    assert.ok(Math.abs(crossing.length - Math.hypot(
      crossing.endpoints[1].x - crossing.endpoints[0].x,
      crossing.endpoints[1].y - crossing.endpoints[0].y
    )) < 1e-6);
    assert.ok(Math.abs(Math.hypot(crossing.vector.x, crossing.vector.y) - 1) < 1e-6);
    assert.ok(crossing.stopLine && Number.isFinite(crossing.stopLine.x) && Number.isFinite(crossing.stopLine.y));
  }
});

test('crosswalk markings follow the local road tangent on curved approaches', () => {
  const map = createMapModel();
  for (const crossing of map.pedestrianNavigation.crosswalks) {
    const edge = map.getEdge(crossing.roadEdgeId);
    const roadPose = map.pedestrianOffsetPose(edge, crossing.along, 1, 0);
    const expected = { x:-Math.sin(roadPose.angle), y:Math.cos(roadPose.angle) };
    const alignment = Math.abs(crossing.vector.x * expected.x + crossing.vector.y * expected.y);
    assert.ok(alignment > .9999, crossing.id + ' should align with its local road tangent');
  }
});

test('typed pedestrian routes stay connected between home and every mapped facility', () => {
  const map = createMapModel();
  for (const place of map.places) {
    assert.ok(findRoute(map.pedestrianNavigation, 'home-entrance', place.entranceNodeId), place.id + ' should be reachable on the typed graph');
  }
  for (const station of map.stations) {
    assert.ok(findRoute(map.pedestrianNavigation, 'home-entrance', station.roadNodeId), station.id + ' should be reachable on the typed graph');
  }
});

test('legacy map and place node aliases resolve to canonical pedestrian graph nodes', () => {
  const map = createMapModel();
  const graph = map.pedestrianNavigation;
  for (const [alias, nodeId] of graph.externalNodeAliases) {
    assert.equal(resolveNodeId(graph, alias), nodeId, alias + ' should restore onto its pedestrian node');
    assert.ok(graph.nodePositions.has(resolveNodeId(graph, alias)), alias + ' should have a restorable world position');
  }
  assert.equal(resolveNodeId(graph, 'missing-pedestrian-node'), null);
});

test('reverse pedestrian traversal starts at the segment destination and walks toward its origin', () => {
  const segment = { length:100, points:[{ x:0, y:0 },{ x:100, y:0 }] };
  const reverseStart = poseAt(segment, -1, 100);
  const reverseEnd = poseAt(segment, -1, 0);
  assert.deepEqual({ x:reverseStart.x, y:reverseStart.y }, { x:100, y:0 });
  assert.deepEqual({ x:reverseEnd.x, y:reverseEnd.y }, { x:0, y:0 });
  assert.ok(Math.abs(Math.abs(reverseStart.angle) - Math.PI) < 1e-9);
  assert.ok(Math.abs(Math.abs(reverseEnd.angle) - Math.PI) < 1e-9);
  assert.deepEqual(poseAt(segment, 1, 0), { x:0, y:0, angle:0 });
  assert.deepEqual(poseAt(segment, 1, 100), { x:100, y:0, angle:0 });
});

test('every pedestrian segment endpoint pose agrees with the graph node position in both directions', () => {
  const map = createMapModel();
  const graph = map.pedestrianNavigation;
  for (const segment of graph.segments) {
    for (const [direction, along, nodeId] of [
      [1, 0, segment.from],
      [1, segment.length, segment.to],
      [-1, segment.length, segment.to],
      [-1, 0, segment.from]
    ]) {
      const pose = poseAt(segment, direction, along);
      const node = graph.nodePositions.get(nodeId);
      assert.ok(Math.hypot(pose.x - node.x, pose.y - node.y) < .01, segment.id + ' must meet ' + nodeId + ' while moving ' + direction);
    }
  }
});

test('a pedestrian route crosses a vehicle corridor only through an explicit crosswalk segment', () => {
  const graph = buildGraph({
    nodes: [{ id:'west', x:0, y:0 }, { id:'east', x:500, y:0 }],
    edges: [{
      id:'street', from:'west', to:'east', vehicle:true, pedestrian:true, width:100,
      points:[{ x:0, y:0 }, { x:500, y:0 }], sidewalkWidth:50
    }],
    places: [], stations: [],
    pedestrianCorridor:() => ({ centerOffset:72 }),
    getNode(id) { return this.nodes.find((node) => node.id === id) || null; },
    pedestrianOffsetPose(_edge, along, direction, offset) {
      return { x:along, y:-(direction * offset), angle:0 };
    },
    junctionGeometry:() => ({ crossingOffset:60 }),
    neighbors:() => [{}, {}, {}]
  });
  const crossing = graph.crosswalks.find((value) => value.roadEdgeId === 'street');
  assert.ok(crossing);
  const route = findRoute(graph, crossing.endpointNodeIds[0], crossing.endpointNodeIds[1]);
  assert.ok(route);
  assert.ok(route.segmentIds.some((id) => graph.segmentsById.get(id).type === 'crosswalk'));
  assert.ok(route.segmentIds.every((id) => graph.segmentsById.get(id).type !== 'vehicle'));
});


test('generated homes and workplaces anchor to real typed pedestrian nodes instead of vehicle-road node ids', () => {
  const map = createMapModel();
  for (const site of map.buildingSites) {
    const hit = nearestNode(map.pedestrianNavigation, site.x + site.w / 2, site.y + site.h / 2);
    assert.ok(hit, site.id + ' should have a nearest pedestrian node');
    assert.ok(map.pedestrianNavigation.adjacency.has(hit.nodeId), site.id + ' anchor should belong to the typed graph');
    assert.ok(findRoute(map.pedestrianNavigation, 'home-entrance', hit.nodeId), site.id + ' anchor should be reachable');
  }
});

test('junction crosswalk signal metadata follows the whole signalized junction, not only one road edge flag', () => {
  const map = createMapModel();
  for (const crossing of map.pedestrianNavigation.crosswalks.filter((value) => value.nodeId)) {
    const incident = map.neighbors(crossing.nodeId, { mode:'vehicle' }).map((link) => link.edge);
    const expected = incident.length >= 3 && incident.some((edge) => edge.signalized);
    assert.equal(crossing.signalized, expected, crossing.id);
  }
});


test('the generated pedestrian graph never enters a vehicle road except on its own explicit crosswalk', () => {
  const map = createMapModel();
  assert.deepEqual(map.pedestrianNavigation.safetyViolations, []);
});

test('the generated pedestrian graph is one connected component', () => {
  const map = createMapModel();
  const graph = map.pedestrianNavigation;
  const start = graph.nodes[0];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const nodeId = queue.shift();
    for (const link of graph.adjacency.get(nodeId) || []) {
      if (seen.has(link.nodeId)) continue;
      seen.add(link.nodeId);
      queue.push(link.nodeId);
    }
  }
  assert.equal(seen.size, graph.nodes.length);
});

test('facility and station aliases resolve onto the safe pedestrian graph', () => {
  const map = createMapModel();
  for (const place of map.places) {
    assert.ok(map.pedestrianNavigation.externalNodeAliases.has(place.entranceNodeId), place.id);
    assert.ok(findRoute(map.pedestrianNavigation, 'home-entrance', place.entranceNodeId), place.id);
  }
  for (const station of map.stations) {
    assert.ok(map.pedestrianNavigation.externalNodeAliases.has(station.roadNodeId), station.id);
    assert.ok(findRoute(map.pedestrianNavigation, 'home-entrance', station.roadNodeId), station.id);
  }
});


test('non-arterial pedestrian roads receive sparse mid-block crossings before detours exceed the configured gap', () => {
  const map = createMapModel();
  for (const edge of map.edges.filter((value) => value.vehicle && value.pedestrian && !['arterial','highway'].includes(value.type))) {
    let length = 0;
    for (let i = 1; i < edge.points.length; i += 1) {
      length += Math.hypot(edge.points[i].x - edge.points[i - 1].x, edge.points[i].y - edge.points[i - 1].y);
    }
    const marks = [0, ...map.crosswalks.filter((crossing) => crossing.roadEdgeId === edge.id).map((crossing) => crossing.along), length].sort((a, b) => a - b);
    const maxGap = Math.max(...marks.slice(1).map((value, index) => value - marks[index]));
    assert.ok(maxGap <= 850.5, edge.id + ' gap=' + maxGap);
  }
});
