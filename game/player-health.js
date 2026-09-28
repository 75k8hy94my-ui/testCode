(function initPlayerHealthModel(global) {
  "use strict";

  const OPEN_MINUTE = 8 * 60;
  const CLOSE_MINUTE = 20 * 60;
  const TREATMENTS = Object.freeze([
    Object.freeze({ id:"standard", name:"診察・処置", cost:1200, duration:45, threshold:80, restore:45 }),
    Object.freeze({ id:"intensive", name:"点滴・集中治療", cost:2800, duration:90, threshold:45, restore:100 })
  ]);

  function boundedHealth(value) {
    const health = Number(value);
    return Number.isFinite(health) ? Math.max(0, Math.min(100, health)) : 100;
  }

  function conditionFor(value) {
    const health = boundedHealth(value);
    if (health >= 80) return "健康";
    if (health >= 55) return "やや不調";
    if (health >= 30) return "体調不良";
    return "重い不調";
  }

  function advanceHealth(value, needs, minutes) {
    const health = boundedHealth(value);
    const elapsed = Number(minutes);
    if (!Number.isFinite(elapsed) || elapsed <= 0 || !needs) return health;
    const basicNeeds = [needs.hunger, needs.energy, needs.hygiene].map(Number);
    if (!basicNeeds.every(Number.isFinite)) return health;
    const criticalCount = basicNeeds.filter((need) => need < 15).length;
    if (criticalCount >= 2) return boundedHealth(health - elapsed * 0.025);
    if (basicNeeds.every((need) => need >= 60)) return boundedHealth(health + elapsed * 0.006);
    return health;
  }

  function treatmentReason(input, treatment) {
    const minute = Number(input.minute);
    if (!Number.isFinite(minute) || minute < OPEN_MINUTE || minute >= CLOSE_MINUTE) return "not-open";
    const health = boundedHealth(input.health);
    if (health > treatment.threshold) return "not-needed";
    const cash = Number(input.cash);
    if (!Number.isFinite(cash) || cash < treatment.cost) return "insufficient-funds";
    if (minute + treatment.duration > CLOSE_MINUTE) return "closing-time";
    return null;
  }

  function listTreatments(input = {}) {
    return TREATMENTS.map((treatment) => ({
      id:treatment.id,
      name:treatment.name,
      cost:treatment.cost,
      duration:treatment.duration,
      healthAfter:treatment.restore === 100
        ? 100
        : Math.min(100, boundedHealth(input.health) + treatment.restore),
      available:treatmentReason(input, treatment) === null,
      reason:treatmentReason(input, treatment)
    }));
  }

  function completeTreatment(input = {}, treatmentId) {
    const treatment = TREATMENTS.find((option) => option.id === treatmentId);
    if (!treatment) return { ok:false, reason:"unknown-treatment" };
    const reason = treatmentReason(input, treatment);
    if (reason) return { ok:false, reason };
    return {
      ok:true,
      cost:treatment.cost,
      duration:treatment.duration,
      health:treatment.restore === 100
        ? 100
        : Math.min(100, boundedHealth(input.health) + treatment.restore)
    };
  }

  const api = Object.freeze({ advanceHealth, conditionFor, listTreatments, completeTreatment });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysPlayerHealth = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
