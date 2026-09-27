import test from 'node:test';
import assert from 'node:assert/strict';
import rendererModule from '../game/character-renderer.js';

const renderer = rendererModule;

test('character renderer exposes sprite animation metadata', () => {
  assert.equal(renderer.constants.directions, 8);
  assert.equal(renderer.constants.walkFrames, 8);
  assert.equal(renderer.constants.idleFrames, 4);
  assert.equal(renderer.constants.waitFrames, 4);
  assert.equal(typeof renderer.draw, 'function');
  assert.equal(typeof renderer.createAppearance, 'function');
});

test('character appearance generation is deterministic', () => {
  const profile = { age:34, jobType:'office' };
  const a = renderer.createAppearance(1234, profile);
  const b = renderer.createAppearance(1234, profile);
  assert.deepEqual(a, b);
});

test('age and job information affect generated character styling', () => {
  const student = renderer.createAppearance(77, { age:20, jobType:'student' });
  const retired = renderer.createAppearance(77, { age:74, jobType:'retired' });

  assert.notEqual(student.posture, retired.posture);
  assert.ok(retired.posture < student.posture);
});

test('named characters receive stable authored appearances', () => {
  const aoi = renderer.createAppearance(41, { specialNpcId:'aoi', age:28, jobType:'freelance' });
  const sora = renderer.createAppearance(42, { specialNpcId:'sora', age:24, jobType:'cafe' });
  const mei = renderer.createAppearance(43, { specialNpcId:'mei', age:22, jobType:'student' });

  assert.equal(aoi.id, 'aoi-41');
  assert.equal(aoi.hairStyle, 8);
  assert.equal(sora.accessory, 'tote');
  assert.equal(mei.accessory, 'backpack');
  assert.notEqual(aoi.top, sora.top);
});

test('direction quantization covers all eight facing directions', () => {
  const indexes = Array.from({ length:8 }, (_, i) => renderer.directionIndex(i * Math.PI / 4));
  assert.deepEqual(indexes, [0,1,2,3,4,5,6,7]);
});

test('runtime character states normalize to sprite states', () => {
  assert.equal(renderer.normalizeState('walking'), 'walk');
  assert.equal(renderer.normalizeState('running'), 'walk');
  assert.equal(renderer.normalizeState('waiting'), 'wait');
  assert.equal(renderer.normalizeState('staying'), 'idle');
});
