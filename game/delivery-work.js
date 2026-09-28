(function initDeliveryWork(global) {
  "use strict";

  const DESTINATIONS = [
    { id: "home", parcel: "日用品の小包", duration: 35, reward: 900 },
    { id: "cafe", parcel: "カフェ備品", duration: 40, reward: 1100 },
    { id: "store", parcel: "食品サンプル便", duration: 45, reward: 1300 },
    { id: "park", parcel: "公園イベント用品", duration: 50, reward: 1500 },
    { id: "gym", parcel: "トレーニング用品", duration: 55, reward: 1600 },
    { id: "library", parcel: "図書館の資料便", duration: 40, reward: 1200 },
    { id: "community-center", parcel: "地域のお知らせ便", duration: 45, reward: 1400 }
  ];
  const MAX_CONSUMED = 300;
  const validDay = (day) => Number.isInteger(day) && day >= 1 && day <= 1000000;
  const validMinute = (minute) => Number.isInteger(minute) && minute >= 0 && minute < 1440;
  const offerIdPattern = /^delivery-(\d+)-([0-2])$/;
  const validOfferId = (id) => typeof id === "string" && offerIdPattern.test(id);
  const cloneProgress = (progress) => ({
    active: progress.active ? { ...progress.active } : null,
    consumedOfferIds: [...progress.consumedOfferIds]
  });

  function createProgress() {
    return { active: null, consumedOfferIds: [] };
  }

  function normalizeProgress(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return createProgress();
    const consumedOfferIds = Array.isArray(raw.consumedOfferIds)
      ? [...new Set(raw.consumedOfferIds.filter(validOfferId))].slice(-MAX_CONSUMED)
      : [];
    let active = null;
    const saved = raw.active;
    if (saved && typeof saved === "object" && !Array.isArray(saved)
      && validOfferId(saved.id)
      && DESTINATIONS.some((destination) => destination.id === saved.destinationPlaceId)
      && typeof saved.parcelName === "string" && saved.parcelName.length <= 60
      && Number.isInteger(saved.reward) && saved.reward >= 100 && saved.reward <= 100000
      && Number.isInteger(saved.deadlineAbsoluteMinute) && saved.deadlineAbsoluteMinute >= 0
      && Number.isInteger(saved.acceptedAbsoluteMinute) && saved.acceptedAbsoluteMinute >= 0
      && saved.deadlineAbsoluteMinute > saved.acceptedAbsoluteMinute
      && Number.isInteger(saved.durationMinutes) && saved.durationMinutes >= 1 && saved.durationMinutes <= 180) {
      active = {
        id: saved.id,
        destinationPlaceId: saved.destinationPlaceId,
        parcelName: saved.parcelName,
        durationMinutes: saved.durationMinutes,
        reward: saved.reward,
        acceptedAbsoluteMinute: saved.acceptedAbsoluteMinute,
        deadlineAbsoluteMinute: saved.deadlineAbsoluteMinute
      };
      if (!consumedOfferIds.includes(active.id)) consumedOfferIds.push(active.id);
    }
    return { active, consumedOfferIds: consumedOfferIds.slice(-MAX_CONSUMED) };
  }

  function listOffers(day, progress) {
    if (!validDay(day)) return [];
    const normalized = normalizeProgress(progress);
    const offset = (day - 1) % DESTINATIONS.length;
    return [0, 1, 2].map((slot) => {
      const destination = DESTINATIONS[(offset + slot) % DESTINATIONS.length];
      return {
        id: `delivery-${day}-${slot}`,
        destinationPlaceId: destination.id,
        parcelName: destination.parcel,
        durationMinutes: destination.duration,
        reward: destination.reward
      };
    }).filter((offer) => !normalized.consumedOfferIds.includes(offer.id));
  }

  function absoluteMinute(day, minute) {
    return (day - 1) * 1440 + minute;
  }

  function acceptDelivery(progress, day, minute, offerId) {
    const normalized = normalizeProgress(progress);
    if (!validDay(day) || !validMinute(minute)) return { ok: false, reason: "invalid-time", progress: normalized };
    if (!validOfferId(offerId) || !offerId.startsWith(`delivery-${day}-`)) return { ok: false, reason: "invalid-offer", progress: normalized };
    if (normalized.consumedOfferIds.includes(offerId)) return { ok: false, reason: "offer-consumed", progress: normalized };
    if (normalized.active) return { ok: false, reason: "active-delivery", progress: normalized };
    const offer = listOffers(day, normalized).find((candidate) => candidate.id === offerId);
    if (!offer) return { ok: false, reason: "invalid-offer", progress: normalized };
    const acceptedAbsoluteMinute = absoluteMinute(day, minute);
    const deadlineAbsoluteMinute = acceptedAbsoluteMinute + offer.durationMinutes;
    const active = { ...offer, acceptedAbsoluteMinute, deadlineAbsoluteMinute };
    const next = cloneProgress(normalized);
    next.active = active;
    next.consumedOfferIds.push(offerId);
    return { ok: true, progress: next, offer: { ...offer }, deadlineAbsoluteMinute };
  }

  function completeDelivery(progress, day, minute, destinationPlaceId) {
    const normalized = normalizeProgress(progress);
    if (!normalized.active) return { ok: false, reason: "no-active-delivery", progress: normalized };
    if (!validDay(day) || !validMinute(minute)) return { ok: false, reason: "invalid-time", progress: normalized };
    if (destinationPlaceId !== normalized.active.destinationPlaceId) return { ok: false, reason: "wrong-destination", progress: normalized };
    const offer = { ...normalized.active };
    const now = absoluteMinute(day, minute);
    const late = now > offer.deadlineAbsoluteMinute;
    const payout = late ? Math.floor((offer.reward * 0.6) / 10) * 10 : offer.reward;
    const next = cloneProgress(normalized);
    next.active = null;
    return { ok: true, progress: next, late, payout, offer };
  }

  function cancelDelivery(progress) {
    const normalized = normalizeProgress(progress);
    if (!normalized.active) return { ok: false, reason: "no-active-delivery", progress: normalized };
    const next = cloneProgress(normalized);
    const consumedOfferId = next.active.id;
    next.active = null;
    return { ok: true, progress: next, consumedOfferId };
  }

  const api = { createProgress, normalizeProgress, listOffers, acceptDelivery, completeDelivery, cancelDelivery };
  if (typeof module === "object" && module.exports) module.exports = api;
  global.DeliveryWork = api;
})(typeof window !== "undefined" ? window : globalThis);
