(function initCityDaysWeatherSystem(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CityDaysWeatherSystem = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCityDaysWeatherSystem() {
  "use strict";

  const SLOT_MINUTES = 180;
  const SLOTS_PER_DAY = 1440 / SLOT_MINUTES;
  const RAIN_HYGIENE_PER_MINUTE = 0.012;

  function finiteNumber(value) {
    try {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    } catch (_) {
      return null;
    }
  }

  function normalizeClock(day, minute) {
    const requestedDay = finiteNumber(day);
    const wholeDay = requestedDay == null ? 1 : Math.floor(requestedDay);
    const safeDay = Number.isSafeInteger(wholeDay) && wholeDay >= 1 ? wholeDay : 1;
    const requestedMinute = finiteNumber(minute);
    const wholeMinute = requestedMinute == null || requestedMinute < 0 ? 0 : Math.floor(requestedMinute);
    const dayOffset = Math.floor(wholeMinute / 1440);
    const normalizedDay = safeDay + dayOffset;
    return {
      day:Number.isSafeInteger(normalizedDay) ? normalizedDay : Number.MAX_SAFE_INTEGER,
      minute:wholeMinute % 1440
    };
  }

  function conditionForSlot(day, slot) {
    let hash = Math.imul(day ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(slot + 1, 0xc2b2ae35);
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d);
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x846ca68b);
    hash ^= hash >>> 16;
    const roll = (hash >>> 0) / 0x100000000;
    return roll < 0.54 ? "clear" : roll < 0.78 ? "cloudy" : "rain";
  }

  function getWeatherAt(day, minute) {
    const clock = normalizeClock(day, minute);
    return conditionForSlot(clock.day, Math.floor(clock.minute / SLOT_MINUTES));
  }

  function getForecast(day, minute, count = 4) {
    const clock = normalizeClock(day, minute);
    const requestedCount = finiteNumber(count);
    const length = requestedCount == null ? 4 : Math.max(1, Math.min(SLOTS_PER_DAY, Math.floor(requestedCount)));
    const currentSlot = Math.floor(clock.minute / SLOT_MINUTES);
    const currentSlotOffset = clock.minute % SLOT_MINUTES;
    const firstAbsoluteSlot = (clock.day - 1) * SLOTS_PER_DAY + currentSlot;
    return Array.from({ length }, (_, index) => {
      const absoluteSlot = firstAbsoluteSlot + index;
      const slotDay = Math.floor(absoluteSlot / SLOTS_PER_DAY) + 1;
      const slot = absoluteSlot % SLOTS_PER_DAY;
      return {
        day:slotDay,
        startMinute:slot * SLOT_MINUTES,
        offsetMinutes:index === 0 ? 0 : SLOT_MINUTES - currentSlotOffset + (index - 1) * SLOT_MINUTES,
        condition:conditionForSlot(slotDay, slot)
      };
    });
  }

  function getOutdoorHygienePenalty(day, minute, durationMinutes, options = {}) {
    const duration = finiteNumber(durationMinutes);
    if (
      duration == null || duration <= 0 ||
      options?.sheltered === true ||
      options?.umbrellaOwned === true
    ) return 0;

    let remaining = duration;
    let elapsed = 0;
    let rainyMinutes = 0;
    while (remaining > 0) {
      const clock = normalizeClock(day, (finiteNumber(minute) ?? 0) + elapsed);
      const minutesUntilBoundary = SLOT_MINUTES - (clock.minute % SLOT_MINUTES);
      const step = Math.min(remaining, minutesUntilBoundary);
      if (conditionForSlot(clock.day, Math.floor(clock.minute / SLOT_MINUTES)) === "rain") rainyMinutes += step;
      remaining -= step;
      elapsed += step;
    }
    return rainyMinutes * RAIN_HYGIENE_PER_MINUTE;
  }

  return Object.freeze({ getWeatherAt, getForecast, getOutdoorHygienePenalty });
});
