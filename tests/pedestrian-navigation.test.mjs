import test from 'node:test';
import assert from 'node:assert/strict';
import mapModule from '../game/map-model.js';
import navigationModule from '../game/pedestrian-navigation.js';

const { createMapModel } = mapModule;
const { buildGraph, findRoute } = navigationModule;

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

test('crosswalk records are stable map geometry with endpoint, road, and signal metadata', () => {
  const map = createMapModel();
  const crossings = map.pedestrianNavigation.crosswalks;
  assert.ok(crossings.some((crossing) => crossing.signalized));
  assert.ok(crossings.some((crossing) => !crossing.signalized));
  for (const crossing of crossings) {
    assert.ok(crossing.id);
    assert.ok(map.getEdge(crossing.roadEdgeId)?.vehicle);
    assert.ok(Number.isFinite(crossing.along));
    assert.ok(crossing.endpoints[0] && crossing.endpoints[1]);
    assert.ok(Math.abs(Math.hypot(crossing.vector.x, crossing.vector.y) - 1) < 1e-6);
    assert.ok(crossing.stopLine && Number.isFinite(crossing.stopLine.x) && Number.isFinite(crossing.stopLine.y));
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
