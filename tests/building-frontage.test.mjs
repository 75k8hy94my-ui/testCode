import test from 'node:test';
import assert from 'node:assert/strict';
import frontage from '../game/building-frontage.js';

test('frontage aligns footprint, facade, entrance, and collision polygon to cardinal or diagonal road tangents', () => {
  for (const tangent of [{ x:1,y:0 },{ x:Math.SQRT1_2,y:Math.SQRT1_2 },{ x:.6,y:-.8 }]) {
    const site = { x:100,y:100,w:120,h:80 };
    const center = { x:160,y:140 };
    const normal = { x:-tangent.y,y:tangent.x };
    const roadPoint = { x:center.x + normal.x*150,y:center.y + normal.y*150 };
    const geometry = frontage.resolve(site, roadPoint, 'road-a', tangent);
    assert.ok(geometry);
    assert.ok(Math.abs(geometry.tangent.x*tangent.y - geometry.tangent.y*tangent.x) < 1e-9);
    assert.ok(geometry.entrance.x > Math.min(...geometry.polygon.map((p) => p.x)) - 1);
    assert.ok(geometry.entrance.x < Math.max(...geometry.polygon.map((p) => p.x)) + 1);
    assert.ok(geometry.entrance.y > Math.min(...geometry.polygon.map((p) => p.y)) - 1);
    assert.ok(geometry.entrance.y < Math.max(...geometry.polygon.map((p) => p.y)) + 1);
    assert.ok(Math.abs((geometry.entrance.x-center.x)*geometry.normal.x + (geometry.entrance.y-center.y)*geometry.normal.y - 40) < 1e-9);
    assert.equal(geometry.roadEdgeId, 'road-a');
  }
});

test('frontage rejects missing road geometry instead of silently fabricating an entrance', () => {
  assert.equal(frontage.resolve({ x:0,y:0,w:100,h:80 }, null), null);
});
