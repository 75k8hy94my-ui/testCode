(function initCityDaysCommunityCenter(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysCommunityCenter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCommunityCenterApi() {
  "use strict";

  const MINUTES_PER_DAY = 1440;
  const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;
  const COURSES = Object.freeze([
    Object.freeze({ id:"cooking", name:"家庭料理の会", weekdays:Object.freeze([1, 5]), startMinute:600, cost:300, duration:60, skill:"cooking", skillName:"料理" }),
    Object.freeze({ id:"craft", name:"手芸サークル", weekdays:Object.freeze([2, 5]), startMinute:840, cost:200, duration:75, skill:"craft", skillName:"手芸" }),
    Object.freeze({ id:"exercise", name:"ゆったり体操", weekdays:Object.freeze([0, 3]), startMinute:1080, cost:0, duration:45, skill:"exercise", skillName:"体操" })
  ]);
  const COURSE_IDS = new Set(COURSES.map((course) => course.id));

  function safeDay(value) {
    const day = Math.floor(Number(value));
    return Number.isFinite(day) && day >= 1 ? day : 1;
  }

  function safeMinute(value) {
    const minute = Math.floor(Number(value));
    return Number.isFinite(minute) ? Math.max(0, Math.min(MINUTES_PER_DAY - 1, minute)) : 0;
  }

  function getSession(courseId, day, minute) {
    const course = COURSES.find((value) => value.id === courseId);
    if (!course) return null;

    const currentDay = safeDay(day);
    const currentMinute = safeMinute(minute);
    const now = (currentDay - 1) * MINUTES_PER_DAY + currentMinute;
    for (let offset = 0; offset <= 7; offset += 1) {
      const sessionDay = currentDay + offset;
      const weekday = (sessionDay - 1) % 7;
      if (!course.weekdays.includes(weekday)) continue;

      const startAbsoluteMinute = (sessionDay - 1) * MINUTES_PER_DAY + course.startMinute;
      if (startAbsoluteMinute + 10 < now) continue;
      return {
        course,
        day:sessionDay,
        startAbsoluteMinute,
        accepting:now >= startAbsoluteMinute && now <= startAbsoluteMinute + 10
      };
    }
    return null;
  }

  function listSessions(day, minute) {
    return COURSES.map((course) => getSession(course.id, day, minute));
  }

  function normalizeProgress(value) {
    const source = value && typeof value === "object" ? value : {};
    const sourceSkills = source.skills && typeof source.skills === "object" ? source.skills : {};
    const normalizeSkill = (skill) => {
      const number = Number(sourceSkills[skill]);
      return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
    };
    const attendance = [];
    const seen = new Set();
    for (const record of Array.isArray(source.attendance) ? source.attendance : []) {
      if (!record || typeof record !== "object" || !COURSE_IDS.has(record.courseId)) continue;
      const day = Number(record.day);
      if (!Number.isInteger(day) || day < 1) continue;
      const key = record.courseId + ":" + day;
      if (seen.has(key)) continue;
      seen.add(key);
      attendance.push({ courseId:record.courseId, day });
    }
    return {
      skills:{ cooking:normalizeSkill("cooking"), craft:normalizeSkill("craft"), exercise:normalizeSkill("exercise") },
      attendance
    };
  }

  function getCourseAvailability(courseId, day, minute, cash, progress) {
    const session = getSession(courseId, day, minute);
    if (!session) return { session:null, available:false, reason:"unknown-course" };
    if (!session.accepting) return { session, available:false, reason:"not-open" };
    const normalized = normalizeProgress(progress);
    if (normalized.attendance.some((record) => record.courseId === courseId && record.day === session.day)) {
      return { session, available:false, reason:"already-attended" };
    }
    if (!Number.isFinite(Number(cash)) || Number(cash) < session.course.cost) {
      return { session, available:false, reason:"insufficient-funds" };
    }
    return { session, available:true, reason:null };
  }

  function completeCourse(progress, session) {
    const normalized = normalizeProgress(progress);
    const course = session?.course;
    const day = Number(session?.day);
    if (!course || !COURSE_IDS.has(course.id) || !Number.isInteger(day) || day < 1) return normalized;
    if (normalized.attendance.some((record) => record.courseId === course.id && record.day === day)) return normalized;
    normalized.skills[course.skill] = Math.min(100, normalized.skills[course.skill] + 5);
    normalized.attendance.push({ courseId:course.id, day });
    return normalized;
  }

  return Object.freeze({ COURSES, getSession, listSessions, normalizeProgress, getCourseAvailability, completeCourse });
});
