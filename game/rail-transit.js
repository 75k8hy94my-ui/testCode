(function initCityDaysRailTransit(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysRailTransit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRailTransitApi() {
  "use strict";

  const SINGLE_TICKET_PRICE = 200;
  const SINGLE_TICKET_DURATION = 2;
  const MAX_SINGLE_TICKETS = 5;
  const DAY_PASS_PRICE = 500;
  const DAY_PASS_DURATION = 3;

  function validDay(value) {
    return Number.isSafeInteger(value) && value >= 1;
  }

  function createProgress() {
    return { singleTickets:0, dayPassDay:null, trips:0 };
  }

  function normalizeProgress(value, day = 1) {
    const currentDay = validDay(day) ? day : 1;
    if (!value || typeof value !== "object") return createProgress();
    const ticketsValue = Number(value.singleTickets);
    const tripsValue = Number(value.trips);
    const passDay = Number(value.dayPassDay);
    return {
      singleTickets:Number.isFinite(ticketsValue) ? Math.max(0, Math.min(MAX_SINGLE_TICKETS, Math.floor(ticketsValue))) : 0,
      dayPassDay:Number.isSafeInteger(passDay) && passDay === currentDay ? currentDay : null,
      trips:Number.isFinite(tripsValue) ? Math.min(1_000_000, Math.max(0, Math.floor(tripsValue))) : 0
    };
  }

  function buySingle(value, cash) {
    const progress = normalizeProgress(value, validDay(Number(value?.dayPassDay)) ? Number(value.dayPassDay) : 1);
    if (!Number.isFinite(cash) || cash < SINGLE_TICKET_PRICE) return { ok:false, reason:"insufficient-funds", progress };
    if (progress.singleTickets >= MAX_SINGLE_TICKETS) return { ok:false, reason:"ticket-limit", progress };
    return {
      ok:true,
      progress:{ ...progress, singleTickets:progress.singleTickets + 1 },
      cashRemaining:cash - SINGLE_TICKET_PRICE,
      cost:SINGLE_TICKET_PRICE,
      duration:SINGLE_TICKET_DURATION
    };
  }

  function validMinute(value) {
    return Number.isSafeInteger(value) && value >= 0 && value < 1440;
  }

  function buyDayPass(value, day, minute, cash) {
    const progress = normalizeProgress(value, day);
    if (!validDay(day)) return { ok:false, reason:"invalid-day", progress };
    if (!validMinute(minute)) return { ok:false, reason:"invalid-time", progress };
    if (progress.dayPassDay === day) return { ok:false, reason:"already-active", progress };
    if (minute + DAY_PASS_DURATION >= 1440) return { ok:false, reason:"too-late", progress };
    if (!Number.isFinite(cash) || cash < DAY_PASS_PRICE) return { ok:false, reason:"insufficient-funds", progress };
    return {
      ok:true,
      progress:{ ...progress, dayPassDay:day },
      cashRemaining:cash - DAY_PASS_PRICE,
      cost:DAY_PASS_PRICE,
      duration:DAY_PASS_DURATION
    };
  }

  function listOptions(value, day, minute, cash) {
    const progress = normalizeProgress(value, day);
    const passActive = validDay(day) && progress.dayPassDay === day;
    const minuteValid = validMinute(minute);
    const affordableSingle = Number.isFinite(cash) && cash >= SINGLE_TICKET_PRICE;
    const affordablePass = Number.isFinite(cash) && cash >= DAY_PASS_PRICE;
    const atTicketLimit = progress.singleTickets >= MAX_SINGLE_TICKETS;
    const tooLate = !minuteValid || minute + DAY_PASS_DURATION >= 1440;
    return {
      singleTicket:{
        price:SINGLE_TICKET_PRICE,
        duration:SINGLE_TICKET_DURATION,
        remaining:progress.singleTickets,
        available:affordableSingle && !atTicketLimit,
        reason:!affordableSingle ? "insufficient-funds" : atTicketLimit ? "ticket-limit" : null
      },
      dayPass:{
        price:DAY_PASS_PRICE,
        duration:DAY_PASS_DURATION,
        active:passActive,
        available:validDay(day) && !passActive && !tooLate && affordablePass,
        reason:!validDay(day) ? "invalid-day" : passActive ? "already-active" : tooLate ? (minuteValid ? "too-late" : "invalid-time") : !affordablePass ? "insufficient-funds" : null
      }
    };
  }

  function board(value, day) {
    const progress = normalizeProgress(value, day);
    if (!validDay(day)) return { ok:false, reason:"invalid-day", progress };
    if (progress.dayPassDay === day) {
      return { ok:true, fare:"day-pass", progress:{ ...progress, trips:Math.min(1_000_000, progress.trips + 1) } };
    }
    if (progress.singleTickets < 1) return { ok:false, reason:"no-fare", progress };
    return {
      ok:true,
      fare:"single-ticket",
      progress:{ ...progress, singleTickets:progress.singleTickets - 1, trips:Math.min(1_000_000, progress.trips + 1) }
    };
  }

  return Object.freeze({
    SINGLE_TICKET_PRICE,
    SINGLE_TICKET_DURATION,
    MAX_SINGLE_TICKETS,
    DAY_PASS_PRICE,
    DAY_PASS_DURATION,
    createProgress,
    normalizeProgress,
    listOptions,
    buySingle,
    buyDayPass,
    board
  });
});
