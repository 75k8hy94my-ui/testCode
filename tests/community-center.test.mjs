import test from 'node:test';
import assert from 'node:assert/strict';
import communityCenter from '../game/community-center.js';

test('weekly classes expose the agreed schedule, price, duration and skill', () => {
  assert.deepEqual(communityCenter.COURSES.map((course) => ({
    id:course.id,
    weekdays:course.weekdays,
    startMinute:course.startMinute,
    cost:course.cost,
    duration:course.duration,
    skill:course.skill
  })), [
    { id:'cooking', weekdays:[1,5], startMinute:600, cost:300, duration:60, skill:'cooking' },
    { id:'craft', weekdays:[2,5], startMinute:840, cost:200, duration:75, skill:'craft' },
    { id:'exercise', weekdays:[0,3], startMinute:1080, cost:0, duration:45, skill:'exercise' }
  ]);
  assert.ok(Object.isFrozen(communityCenter.COURSES));
  assert.ok(communityCenter.COURSES.every(Object.isFrozen));
});

test('a class accepts arrivals from its start through ten minutes after start', () => {
  const atStart = communityCenter.getSession('cooking', 2, 600);
  const atDeadline = communityCenter.getSession('cooking', 2, 610);
  const afterDeadline = communityCenter.getSession('cooking', 2, 611);

  assert.equal(atStart.accepting, true);
  assert.equal(atStart.startAbsoluteMinute, 2040);
  assert.equal(atDeadline.accepting, true);
  assert.equal(afterDeadline.accepting, false);
  assert.equal(afterDeadline.startAbsoluteMinute, 7800);
});

test('next class calculation crosses midnight and the end of the week', () => {
  const mondayNight = communityCenter.getSession('craft', 8, 1430);
  const sundayNight = communityCenter.getSession('exercise', 7, 1430);

  assert.equal(mondayNight.startAbsoluteMinute, 13800);
  assert.equal(mondayNight.accepting, false);
  assert.equal(sundayNight.startAbsoluteMinute, 11160);
});

test('unknown course IDs do not produce sessions', () => {
  assert.equal(communityCenter.getSession('pottery', 2, 600), null);
});

test('progress migration defaults, clamps, and filters attendance records', () => {
  assert.deepEqual(communityCenter.normalizeProgress(undefined), {
    skills:{ cooking:0, craft:0, exercise:0 },
    attendance:[]
  });
  assert.deepEqual(communityCenter.normalizeProgress({
    skills:{ cooking:135, craft:-5, exercise:'42' },
    attendance:[
      { courseId:'cooking', day:2 },
      { courseId:'unknown', day:2 },
      { courseId:'craft', day:0 },
      null
    ]
  }), {
    skills:{ cooking:100, craft:0, exercise:42 },
    attendance:[{ courseId:'cooking', day:2 }]
  });
});
