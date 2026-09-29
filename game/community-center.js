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
  const CLUBS = Object.freeze([
    Object.freeze({ id:"board-game", name:"放課後ボードゲーム会", weekday:2, startMinute:1110, cost:100, duration:60, members:Object.freeze(["aoi", "mei", "haru"]) }),
    Object.freeze({ id:"handcraft-tea", name:"手しごととお茶の会", weekday:4, startMinute:1200, cost:200, duration:75, members:Object.freeze(["sora", "yui", "nana", "toma"]) }),
    Object.freeze({ id:"neighborhood-mixer", name:"夕方のまち交流会", weekday:0, startMinute:990, cost:0, duration:45, members:Object.freeze(["ren", "kaori", "daichi"]) })
  ]);
  const CLUB_IDS = new Set(CLUBS.map((club) => club.id));

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
    const clubAttendance = [];
    const seenClubs = new Set();
    for (const record of Array.isArray(source.clubAttendance) ? source.clubAttendance : []) {
      if (!record || typeof record !== "object" || !CLUB_IDS.has(record.clubId)) continue;
      const day = Number(record.day);
      if (!Number.isInteger(day) || day < 1) continue;
      const key = record.clubId + ":" + day;
      if (seenClubs.has(key)) continue;
      seenClubs.add(key);
      clubAttendance.push({ clubId:record.clubId, day });
    }
    return {
      skills:{ cooking:normalizeSkill("cooking"), craft:normalizeSkill("craft"), exercise:normalizeSkill("exercise") },
      attendance,
      clubAttendance
    };
  }

  function getClubs() {
    return CLUBS;
  }

  function getClubSession(clubId, day, minute) {
    const club = CLUBS.find((value) => value.id === clubId);
    if (!club) return null;
    const sessionDay = safeDay(day);
    const startAbsoluteMinute = (sessionDay - 1) * MINUTES_PER_DAY + club.startMinute;
    const now = (sessionDay - 1) * MINUTES_PER_DAY + safeMinute(minute);
    return {
      club,
      day:sessionDay,
      startAbsoluteMinute,
      accepting:(sessionDay - 1) % 7 === club.weekday && now >= startAbsoluteMinute - 10 && now <= startAbsoluteMinute + 10
    };
  }

  function getNextClubSession(clubId, day, minute) {
    const club = CLUBS.find((value) => value.id === clubId);
    if (!club) return null;
    const currentDay = safeDay(day);
    const currentMinute = safeMinute(minute);
    const now = (currentDay - 1) * MINUTES_PER_DAY + currentMinute;
    for (let offset = 0; offset <= 7; offset += 1) {
      const sessionDay = currentDay + offset;
      if ((sessionDay - 1) % 7 !== club.weekday) continue;
      const session = getClubSession(clubId, sessionDay, offset === 0 ? currentMinute : 0);
      if (session.startAbsoluteMinute + 10 < now) continue;
      return session;
    }
    return null;
  }

  function getClubAvailability(progress, clubId, day, minute, cash) {
    const session = getClubSession(clubId, day, minute);
    if (!session) return { session:null, available:false, reason:"unknown-club" };
    const normalized = normalizeProgress(progress);
    if (normalized.clubAttendance.some((record) => record.clubId === clubId && record.day === session.day)) {
      return { session, available:false, reason:"already-attended" };
    }
    if ((session.day - 1) % 7 !== session.club.weekday || !session.accepting) return { session, available:false, reason:"not-open" };
    if (!Number.isFinite(Number(cash)) || Number(cash) < session.club.cost) return { session, available:false, reason:"insufficient-funds" };
    return { session, available:true, reason:null };
  }

  function attendClub(progress, session) {
    const normalized = normalizeProgress(progress);
    const clubId = session?.club?.id;
    const day = Number(session?.day);
    if (!CLUB_IDS.has(clubId) || !Number.isInteger(day) || day < 1) return normalized;
    if (!normalized.clubAttendance.some((record) => record.clubId === clubId && record.day === day)) {
      normalized.clubAttendance.push({ clubId, day });
    }
    return normalized;
  }

  function getCitizenClubOpportunity(day, minute, citizen) {
    if (!citizen || typeof citizen !== "object" || citizen.onShift || citizen.lateNight || citizen.unwell) return null;
    const citizenId = String(citizen.id || citizen.citizenId || "");
    const needs = citizen.needs && typeof citizen.needs === "object" ? citizen.needs : {};
    const energy = Number(needs.energy);
    const hunger = Number(needs.hunger);
    const money = Number(citizen.money);
    if (!Number.isFinite(energy) || energy < 18 || !Number.isFinite(hunger) || hunger < 15 || !Number.isFinite(money)) return null;
    const now = (safeDay(day) - 1) * MINUTES_PER_DAY + safeMinute(minute);
    const social = Number(citizen.personality?.social) || 0;
    const curious = Number(citizen.personality?.curious) || 0;
    const active = Number(citizen.personality?.active) || 0;
    for (const club of CLUBS) {
      if (!club.members.includes(citizenId) || money < club.cost) continue;
      const session = getClubSession(club.id, day, minute);
      const minutesUntilStart = session.startAbsoluteMinute - now;
      if ((session.day - 1) % 7 !== club.weekday || minutesUntilStart < -10 || minutesUntilStart > 45) continue;
      return {
        id:"community_club",
        club,
        session,
        duration:Math.max(8, club.duration + minutesUntilStart),
        score:108 + social * 16 + curious * 12 + active * 8 - Math.max(0, minutesUntilStart) * .3
      };
    }
    return null;
  }

  function isCitizenClubArrivalValid(clubId, expectedStartAbsoluteMinute, citizenId, day, minute, cash) {
    const club = CLUBS.find((value) => value.id === clubId);
    const expectedStart = Number(expectedStartAbsoluteMinute);
    if (!club || !club.members.includes(String(citizenId)) || !Number.isFinite(expectedStart)) return false;
    const session = getClubSession(clubId, day, minute);
    if ((session.day - 1) % 7 !== club.weekday || session.startAbsoluteMinute !== expectedStart) return false;
    const now = (safeDay(day) - 1) * MINUTES_PER_DAY + safeMinute(minute);
    return expectedStart - now <= 45 && now <= expectedStart + 10 && Number(cash) >= club.cost;
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

  function getCitizenCourseOpportunity(day, minute, citizen) {
    if (!citizen || typeof citizen !== "object" || citizen.onShift || citizen.lateNight) return null;
    const needs = citizen.needs && typeof citizen.needs === "object" ? citizen.needs : {};
    const energy = Number(needs.energy);
    const hunger = Number(needs.hunger);
    const money = Number(citizen.money);
    if (!Number.isFinite(energy) || energy < 18 || !Number.isFinite(hunger) || hunger < 15 || !Number.isFinite(money)) return null;

    const now = (safeDay(day) - 1) * MINUTES_PER_DAY + safeMinute(minute);
    const personality = citizen.personality && typeof citizen.personality === "object" ? citizen.personality : {};
    const social = Number(personality.social) || 0;
    const curious = Number(personality.curious) || 0;
    const active = Number(personality.active) || 0;
    const socialDeficit = 100 - (Number(needs.social) || 0);
    const funDeficit = 100 - (Number(needs.fun) || 0);

    for (const course of COURSES) {
      const session = getSession(course.id, day, minute);
      if (!session || money < course.cost) continue;
      const minutesUntilStart = session.startAbsoluteMinute - now;
      if (minutesUntilStart < -10 || minutesUntilStart > 45) continue;
      if (course.skill === "exercise" && (energy < 35 || hunger < 25)) continue;
      return {
        id:"community_class",
        course,
        session,
        duration:Math.max(8, course.duration + minutesUntilStart),
        score:48 + socialDeficit * .25 + funDeficit * .2 + social * 16 + curious * 12 + active * 8 - Math.max(0, minutesUntilStart) * .35
      };
    }
    return null;
  }

  function isCitizenCourseArrivalValid(courseId, expectedStartAbsoluteMinute, day, minute, cash) {
    const course = COURSES.find((value) => value.id === courseId);
    const expectedStart = Number(expectedStartAbsoluteMinute);
    if (!course || !Number.isFinite(expectedStart)) return false;
    const session = getSession(courseId, day, minute);
    if (!session || session.startAbsoluteMinute !== expectedStart) return false;
    const now = (safeDay(day) - 1) * MINUTES_PER_DAY + safeMinute(minute);
    return expectedStart - now <= 45 && now <= expectedStart + 10 && Number(cash) >= course.cost;
  }

  return Object.freeze({
    COURSES,
    getClubs,
    getClubSession,
    getNextClubSession,
    getClubAvailability,
    attendClub,
    getCitizenClubOpportunity,
    isCitizenClubArrivalValid,
    getSession,
    listSessions,
    normalizeProgress,
    getCourseAvailability,
    completeCourse,
    getCitizenCourseOpportunity,
    isCitizenCourseArrivalValid
  });
});
