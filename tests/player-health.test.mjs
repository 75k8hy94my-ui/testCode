import test from 'node:test';
import assert from 'node:assert/strict';
import healthModel from '../game/player-health.js';

const { advanceHealth, conditionFor, listTreatments, completeTreatment } = healthModel;

test('health conditions change at the intended player-visible thresholds', () => {
  assert.equal(conditionFor(80), '健康');
  assert.equal(conditionFor(79.9), 'やや不調');
  assert.equal(conditionFor(55), 'やや不調');
  assert.equal(conditionFor(54.9), '体調不良');
  assert.equal(conditionFor(30), '体調不良');
  assert.equal(conditionFor(29.9), '重い不調');
});

test('health falls only under multiple critical needs and recovers with stable self-care', () => {
  assert.equal(advanceHealth(100, { hunger:14, energy:14, hygiene:80 }, 60), 98.5);
  assert.equal(advanceHealth(50, { hunger:14, energy:14, hygiene:80 }, 60), 48.5);
  assert.equal(advanceHealth(50, { hunger:14, energy:40, hygiene:50 }, 60), 50);
  assert.equal(advanceHealth(50, { hunger:60, energy:60, hygiene:60 }, 60), 50.36);
});

test('health transitions clamp at zero and one hundred for fractional and invalid inputs', () => {
  assert.equal(advanceHealth(1, { hunger:0, energy:0, hygiene:0 }, 120), 0);
  assert.equal(advanceHealth(99.9, { hunger:100, energy:100, hygiene:100 }, 120), 100);
  assert.equal(advanceHealth(NaN, { hunger:100, energy:100, hygiene:100 }, 10), 100);
  assert.equal(advanceHealth(40, { hunger:100, energy:100, hygiene:100 }, -10), 40);
});

test('clinic treatment choices report exact costs, durations, and eligibility', () => {
  const options = listTreatments({ minute:9 * 60, cash:3000, health:40 });
  assert.deepEqual(options.map(({ id, available, cost, duration, healthAfter }) => ({ id, available, cost, duration, healthAfter })), [
    { id:'standard', available:true, cost:1200, duration:45, healthAfter:85 },
    { id:'intensive', available:true, cost:2800, duration:90, healthAfter:100 }
  ]);
});

test('clinic treatment rejects opening, severity, funds, and finish-time violations', () => {
  assert.equal(completeTreatment({ minute:479, cash:5000, health:20 }, 'standard').reason, 'not-open');
  assert.equal(completeTreatment({ minute:480, cash:5000, health:81 }, 'standard').reason, 'not-needed');
  assert.equal(completeTreatment({ minute:480, cash:1199, health:20 }, 'standard').reason, 'insufficient-funds');
  assert.equal(completeTreatment({ minute:19 * 60 + 16, cash:5000, health:20 }, 'standard').reason, 'closing-time');
  assert.equal(completeTreatment({ minute:19 * 60 + 15.01, cash:5000, health:20 }, 'standard').reason, 'closing-time');
  assert.equal(completeTreatment({ minute:479.99, cash:5000, health:20 }, 'standard').reason, 'not-open');
  assert.equal(completeTreatment({ minute:18 * 60 + 31, cash:5000, health:20 }, 'intensive').reason, 'closing-time');
});

test('clinic treatment ending exactly at closing is allowed and leaves rejected state untouched', () => {
  assert.deepEqual(completeTreatment({ minute:19 * 60 + 15, cash:3000, health:50 }, 'standard'), {
    ok:true, cost:1200, duration:45, health:95
  });
  assert.deepEqual(completeTreatment({ minute:18 * 60 + 30, cash:3000, health:40 }, 'intensive'), {
    ok:true, cost:2800, duration:90, health:100
  });
  assert.deepEqual(completeTreatment({ minute:480, cash:5000, health:20 }, 'unknown'), {
    ok:false, reason:'unknown-treatment'
  });
});
