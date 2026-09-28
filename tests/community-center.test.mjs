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
    skill:course.skill,
    skillName:course.skillName
  })), [
    { id:'cooking', weekdays:[1,5], startMinute:600, cost:300, duration:60, skill:'cooking', skillName:'料理' },
    { id:'craft', weekdays:[2,5], startMinute:840, cost:200, duration:75, skill:'craft', skillName:'手芸' },
    { id:'exercise', weekdays:[0,3], startMinute:1080, cost:0, duration:45, skill:'exercise', skillName:'体操' }
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

test('class availability explains closed sessions, insufficient cash, and completed attendance', () => {
  const closed = communityCenter.getCourseAvailability('cooking', 2, 611, 8000, null);
  const unaffordable = communityCenter.getCourseAvailability('cooking', 2, 600, 299, null);
  const attended = communityCenter.getCourseAvailability('cooking', 2, 600, 8000, {
    attendance:[{ courseId:'cooking', day:2 }]
  });

  assert.equal(closed.available, false);
  assert.equal(closed.reason, 'not-open');
  assert.equal(unaffordable.available, false);
  assert.equal(unaffordable.reason, 'insufficient-funds');
  assert.equal(attended.available, false);
  assert.equal(attended.reason, 'already-attended');
});

test('completing a class awards skill once and records the scheduled day', () => {
  const started = communityCenter.getSession('cooking', 2, 600);
  const once = communityCenter.completeCourse({ skills:{ cooking:98 }, attendance:[] }, started);
  const twice = communityCenter.completeCourse(once, started);

  assert.deepEqual(once, {
    skills:{ cooking:100, craft:0, exercise:0 },
    attendance:[{ courseId:'cooking', day:2 }]
  });
  assert.deepEqual(twice, once);
});

test('citizens can choose a nearby class before it starts and hold that plan until arrival', () => {
  const citizen = {
    money:1000,
    onShift:false,
    lateNight:false,
    needs:{ hunger:70, energy:75, social:35, fun:40 },
    personality:{ social:0.8, curious:0.7, active:0.6 }
  };
  const opportunity = communityCenter.getCitizenCourseOpportunity(2, 555, citizen);

  assert.equal(opportunity.course.id, 'cooking');
  assert.equal(opportunity.session.day, 2);
  assert.equal(opportunity.session.startAbsoluteMinute, 2040);
  assert.equal(opportunity.duration, 105);
  assert.equal(opportunity.id, 'community_class');
});

test('citizens skip classes outside the travel window, during work, or without enough needs and money', () => {
  const citizen = {
    money:1000,
    onShift:false,
    lateNight:false,
    needs:{ hunger:70, energy:75, social:35, fun:40 },
    personality:{ social:0.8, curious:0.7, active:0.6 }
  };

  assert.equal(communityCenter.getCitizenCourseOpportunity(2, 554, citizen), null);
  assert.equal(communityCenter.getCitizenCourseOpportunity(2, 555, { ...citizen, onShift:true }), null);
  assert.equal(communityCenter.getCitizenCourseOpportunity(2, 555, { ...citizen, money:299 }), null);
  assert.equal(communityCenter.getCitizenCourseOpportunity(2, 555, {
    ...citizen,
    needs:{ ...citizen.needs, energy:15 }
  }), null);
  assert.equal(communityCenter.getCitizenCourseOpportunity(2, 611, citizen), null);
});

test('citizen arrival revalidates the planned session, travel deadline, and fare', () => {
  assert.equal(communityCenter.isCitizenCourseArrivalValid('cooking', 2040, 2, 555, 1000), true);
  assert.equal(communityCenter.isCitizenCourseArrivalValid('cooking', 2040, 2, 610, 1000), true);
  assert.equal(communityCenter.isCitizenCourseArrivalValid('cooking', 2040, 2, 611, 1000), false);
  assert.equal(communityCenter.isCitizenCourseArrivalValid('cooking', 2040, 2, 554, 1000), false);
  assert.equal(communityCenter.isCitizenCourseArrivalValid('cooking', 2040, 2, 600, 299), false);
  assert.equal(communityCenter.isCitizenCourseArrivalValid('pottery', 2040, 2, 600, 1000), false);
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
