import test from 'node:test';
import assert from 'node:assert/strict';
import mapModule from '../game/map-model.js';
import trafficSpawn from '../game/traffic-spawn.js';

const { createMapModel } = mapModule;

test('traffic spawns remain outside both junction approach reservation zones', () => {
  const map = createMapModel();
  const edges = map.edges.filter((edge) => edge.vehicle);
  for (const edge of edges) {
    const edgeLength = edge.points.slice(1).reduce((sum, point, index) =>
      sum + Math.hypot(point.x - edge.points[index].x, point.y - edge.points[index].y), 0);
    const startClearance = map.junctionGeometry(edge.from, edge.id).yieldOffset + 65;
    const endClearance = map.junctionGeometry(edge.to, edge.id).yieldOffset + 65;
    const along = trafficSpawn.positionAlong(edgeLength, .839, startClearance, endClearance);
    assert.ok(Number.isFinite(along), edge.id + ' should have a safe spawn interval');
    assert.ok(along >= startClearance, edge.id + ' spawn must stay outside its start junction');
    assert.ok(edgeLength - along >= endClearance, edge.id + ' spawn must stay outside its end junction');
  }
});

test('short roads without a safe junction buffer are not spawnable', () => {
  assert.equal(trafficSpawn.positionAlong(180, .5, 100, 100), null);
});

test('same-direction traffic lanes keep enough lateral clearance for the widest vehicles', () => {
  const inner = trafficSpawn.laneOffset(206, false, 38);
  const outer = trafficSpawn.laneOffset(206, true, 38);
  assert.equal(inner, 38);
  assert.equal(outer, 80);
  assert.ok(outer - inner >= 42);
  assert.equal(trafficSpawn.laneOffset(176, true, 38), 38);
});

test('narrow residential roads admit only one direction of ambient traffic at a time', () => {
  const narrow = { id:'home-lane', width:80 };
  const occupant = { edgeId:'home-lane', directionSign:1 };
  assert.equal(trafficSpawn.blockedByOpposingTraffic(narrow, -1, [occupant]), true);
  assert.equal(trafficSpawn.blockedByOpposingTraffic(narrow, 1, [occupant]), false);
  assert.equal(trafficSpawn.blockedByOpposingTraffic({ ...narrow, width:96 }, -1, [occupant]), false);
});
