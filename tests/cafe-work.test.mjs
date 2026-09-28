import test from 'node:test';
import assert from 'node:assert/strict';
import employment from '../game/cafe-work.js';

const readyDay = {
  day:2,
  minute:480,
  lastShiftDay:1,
  shiftsWorked:0,
  energy:85,
  hunger:75
};

test('new staff can choose short or regular shifts while long shifts require experience', () => {
  assert.deepEqual(employment.listShifts(readyDay).map((entry) => ({
    id:entry.shift.id,
    available:entry.available,
    reason:entry.reason
  })), [
    { id:'short', available:true, reason:null },
    { id:'regular', available:true, reason:null },
    { id:'long', available:false, reason:'experience-required' }
  ]);
});

test('completed shifts promote staff and raise hourly pay without changing legacy regular pay', () => {
  assert.deepEqual(employment.completeShift({ ...readyDay, shiftsWorked:4 }, 'regular'), {
    ok:true,
    pay:4800,
    shiftsWorked:5,
    careerLevel:'一人前'
  });
  assert.deepEqual(employment.completeShift({ ...readyDay, minute:720, shiftsWorked:5 }, 'long'), {
    ok:true,
    pay:7800,
    shiftsWorked:6,
    careerLevel:'一人前'
  });
  assert.deepEqual(employment.completeShift({ ...readyDay, shiftsWorked:12 }, 'regular'), {
    ok:true,
    pay:5600,
    shiftsWorked:13,
    careerLevel:'ベテラン'
  });
});

test('a shift cannot start before opening, finish after closing, or repeat on the same day', () => {
  assert.equal(employment.listShifts({ ...readyDay, minute:419 })[0].reason, 'too-early');
  assert.equal(employment.listShifts({ ...readyDay, minute:960, shiftsWorked:5 })[0].available, true);
  assert.equal(employment.listShifts({ ...readyDay, minute:960, shiftsWorked:5 })[1].reason, 'closing-time');
  assert.equal(employment.listShifts({ ...readyDay, minute:720, shiftsWorked:5 })[2].available, true);
  assert.equal(employment.listShifts({ ...readyDay, minute:480, lastShiftDay:2 })[0].reason, 'already-worked');
});

test('fractional game minutes cannot let a shift run past closing', () => {
  assert.equal(employment.listShifts({ ...readyDay, minute:960.5, shiftsWorked:5 })[0].reason, 'closing-time');
});

test('work is rejected without paying or recording progress when conditions are poor', () => {
  assert.deepEqual(employment.completeShift({ ...readyDay, energy:19 }, 'regular'), { ok:false, reason:'too-tired' });
  assert.deepEqual(employment.completeShift({ ...readyDay, hunger:19 }, 'regular'), { ok:false, reason:'too-hungry' });
  assert.deepEqual(employment.completeShift({ ...readyDay, shiftsWorked:4, minute:720 }, 'long'), { ok:false, reason:'experience-required' });
  assert.deepEqual(employment.completeShift(readyDay, 'unknown'), { ok:false, reason:'unknown-shift' });
});
