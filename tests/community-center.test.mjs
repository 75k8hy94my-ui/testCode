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
    attendance:[{ courseId:'cooking', day:2 }],
    clubAttendance:[]
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
    attendance:[],
    clubAttendance:[]
  });
  assert.deepEqual(communityCenter.normalizeProgress({
    skills:{ cooking:135, craft:-5, exercise:'42' },
    attendance:[
      { courseId:'cooking', day:2 },
      { courseId:'unknown', day:2 },
      { courseId:'craft', day:0 },
      null
    ],
    clubAttendance:[{ clubId:'board-game', day:3 }, { clubId:'board-game', day:3 }, { clubId:'invalid', day:4 }]
  }), {
    skills:{ cooking:100, craft:0, exercise:42 },
    attendance:[{ courseId:'cooking', day:2 }],
    clubAttendance:[{ clubId:'board-game', day:3 }]
  });
});

test('weekly clubs expose their scheduled time, fee, duration and roster', () => {
  assert.deepEqual(communityCenter.getClubs().map(({ id, weekday, startMinute, cost, duration, members }) => ({
    id, weekday, startMinute, cost, duration, members
  })), [
    { id:'board-game', weekday:2, startMinute:1110, cost:100, duration:60, members:['aoi', 'mei', 'haru'] },
    { id:'handcraft-tea', weekday:4, startMinute:1200, cost:200, duration:75, members:['sora', 'yui', 'nana', 'toma'] },
    { id:'neighborhood-mixer', weekday:0, startMinute:990, cost:0, duration:45, members:['ren', 'kaori', 'daichi'] }
  ]);
});

test('club attendance window includes ten minutes before and after start only', () => {
  const before = communityCenter.getClubSession('board-game', 3, 1100);
  const starts = communityCenter.getClubSession('board-game', 3, 1110);
  const after = communityCenter.getClubSession('board-game', 3, 1120);
  const closed = communityCenter.getClubSession('board-game', 3, 1121);

  assert.equal(before.accepting, true);
  assert.equal(starts.accepting, true);
  assert.equal(after.accepting, true);
  assert.equal(closed.accepting, false);
});

test('all three weekly clubs use the same exact ten-minute arrival boundary', () => {
  for (const session of [
    { id:'board-game', day:3, minute:1110 },
    { id:'handcraft-tea', day:5, minute:1200 },
    { id:'neighborhood-mixer', day:1, minute:990 }
  ]) {
    assert.equal(communityCenter.getClubSession(session.id, session.day, session.minute - 10).accepting, true);
    assert.equal(communityCenter.getClubSession(session.id, session.day, session.minute + 10).accepting, true);
    assert.equal(communityCenter.getClubSession(session.id, session.day, session.minute - 11).accepting, false);
    assert.equal(communityCenter.getClubSession(session.id, session.day, session.minute + 11).accepting, false);
  }
});

test('club fee is checked and attendance is recorded once without changing course records', () => {
  const progress = communityCenter.normalizeProgress({ attendance:[{ courseId:'cooking', day:2 }] });
  const denied = communityCenter.getClubAvailability(progress, 'board-game', 3, 1110, 99);
  const accepted = communityCenter.getClubAvailability(progress, 'board-game', 3, 1110, 100);
  const once = communityCenter.attendClub(progress, accepted.session);
  const twice = communityCenter.attendClub(once, accepted.session);
  const repeated = communityCenter.getClubAvailability(once, 'board-game', 3, 1170, 1000);

  assert.equal(denied.reason, 'insufficient-funds');
  assert.equal(accepted.available, true);
  assert.deepEqual(once.attendance, [{ courseId:'cooking', day:2 }]);
  assert.deepEqual(once.clubAttendance, [{ clubId:'board-game', day:3 }]);
  assert.deepEqual(twice, once);
  assert.equal(repeated.reason, 'already-attended');
});

test('only healthy club members can plan a nearby session and arrival rechecks the roster, time and fee', () => {
  const citizen = {
    id:'aoi', money:100, onShift:false, lateNight:false, unwell:false,
    needs:{ hunger:70, energy:75, social:35, fun:40 },
    personality:{ social:0.8, curious:0.7, active:0.6 }
  };
  const opportunity = communityCenter.getCitizenClubOpportunity(3, 1070, citizen);

  assert.equal(opportunity.id, 'community_club');
  assert.equal(opportunity.club.id, 'board-game');
  assert.equal(opportunity.session.startAbsoluteMinute, 3990);
  assert.equal(communityCenter.getCitizenClubOpportunity(3, 1070, { ...citizen, id:'ren' }), null);
  assert.equal(communityCenter.getCitizenClubOpportunity(3, 1070, { ...citizen, unwell:true }), null);
  assert.equal(communityCenter.getCitizenClubOpportunity(3, 1070, { ...citizen, onShift:true }), null);
  assert.equal(communityCenter.getCitizenClubOpportunity(3, 1070, { ...citizen, lateNight:true }), null);
  assert.equal(communityCenter.getCitizenClubOpportunity(3, 1070, { ...citizen, money:99 }), null);
  assert.equal(communityCenter.isCitizenClubArrivalValid('board-game', 3990, 'aoi', 3, 1100, 100), true);
  assert.equal(communityCenter.isCitizenClubArrivalValid('board-game', 3990, 'aoi', 3, 1121, 100), false);
  assert.equal(communityCenter.isCitizenClubArrivalValid('board-game', 3990, 'aoi', 3, 1100, 99), false);
  assert.equal(communityCenter.isCitizenClubArrivalValid('board-game', 3990, 'ren', 3, 1100, 100), false);
});
