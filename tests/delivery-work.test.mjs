import test from 'node:test';
import assert from 'node:assert/strict';
import deliveryWork from '../game/delivery-work.js';

const { createProgress, normalizeProgress, listOffers, acceptDelivery, completeDelivery, cancelDelivery } = deliveryWork;

test('creates and safely normalizes empty, legacy, and malformed progress', () => {
  assert.deepEqual(createProgress(), { active: null, consumedOfferIds: [] });
  assert.deepEqual(normalizeProgress(undefined), createProgress());
  assert.deepEqual(normalizeProgress({ active: { id: 'bad' }, consumedOfferIds: ['bad', 4] }), createProgress());
  const fabricated = {
    id: 'delivery-1-0', destinationPlaceId: 'home', parcelName: '日用品の小包',
    durationMinutes: 35, reward: 100000, acceptedAbsoluteMinute: 480, deadlineAbsoluteMinute: 515
  };
  assert.deepEqual(normalizeProgress({ active: fabricated }), createProgress());
});

test('offers three distinct, deterministic daily destinations and rotate by day', () => {
  const dayOne = listOffers(1, createProgress());
  assert.equal(dayOne.length, 3);
  assert.deepEqual(dayOne, listOffers(1, createProgress()));
  assert.equal(new Set(dayOne.map((offer) => offer.destinationPlaceId)).size, 3);
  assert.ok(dayOne.every((offer) => /^delivery-1-[0-2]$/.test(offer.id)));
  assert.notDeepEqual(dayOne.map((offer) => offer.destinationPlaceId), listOffers(2, createProgress()).map((offer) => offer.destinationPlaceId));
});

test('accepts a daily offer once and rejects a second active or consumed offer', () => {
  const offer = listOffers(1, createProgress())[0];
  const accepted = acceptDelivery(createProgress(), 1, 100, offer.id);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.deadlineAbsoluteMinute, 100 + offer.durationMinutes);
  assert.deepEqual(normalizeProgress(accepted.progress), accepted.progress);
  assert.equal(listOffers(1, accepted.progress).length, 2);
  assert.equal(acceptDelivery(accepted.progress, 1, 100, listOffers(1, createProgress())[1].id).reason, 'active-delivery');
  assert.equal(acceptDelivery(accepted.progress, 1, 100, offer.id).reason, 'offer-consumed');
});

test('wrong destination does not change progress; correct on-time handoff pays full reward once', () => {
  const offer = listOffers(1, createProgress())[0];
  const accepted = acceptDelivery(createProgress(), 1, 100, offer.id);
  const wrong = completeDelivery(accepted.progress, 1, 110, 'not-the-destination');
  assert.equal(wrong.ok, false);
  assert.deepEqual(wrong.progress, accepted.progress);
  const result = completeDelivery(accepted.progress, 1, accepted.deadlineAbsoluteMinute, offer.destinationPlaceId);
  assert.equal(result.ok, true);
  assert.equal(result.late, false);
  assert.equal(result.payout, offer.reward);
  assert.equal(result.progress.active, null);
  assert.equal(completeDelivery(result.progress, 1, accepted.deadlineAbsoluteMinute, offer.destinationPlaceId).ok, false);
});

test('late handoff after midnight pays 60 percent rounded down to the nearest ten yen', () => {
  const offer = listOffers(1, createProgress())[0];
  const accepted = acceptDelivery(createProgress(), 1, 1430, offer.id);
  const result = completeDelivery(accepted.progress, 2, 40, offer.destinationPlaceId);
  assert.equal(result.ok, true);
  assert.equal(result.late, true);
  assert.equal(result.payout, Math.floor((offer.reward * .6) / 10) * 10);
});

test('snapshot normalization rejects an active offer with an inconsistent deadline', () => {
  const offer = listOffers(1, createProgress())[0];
  const accepted = acceptDelivery(createProgress(), 1, 100, offer.id);
  const tampered = {
    ...accepted.progress,
    active: { ...accepted.progress.active, deadlineAbsoluteMinute: accepted.deadlineAbsoluteMinute + 1 }
  };
  const normalized = normalizeProgress(tampered);
  assert.equal(normalized.active, null);
  assert.ok(normalized.consumedOfferIds.includes(offer.id));
});

test('cancellation consumes the accepted offer and cannot be repeated', () => {
  const offer = listOffers(1, createProgress())[0];
  const accepted = acceptDelivery(createProgress(), 1, 100, offer.id);
  const cancelled = cancelDelivery(accepted.progress);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.progress.active, null);
  assert.ok(cancelled.progress.consumedOfferIds.includes(offer.id));
  assert.equal(cancelDelivery(cancelled.progress).ok, false);
  assert.equal(acceptDelivery(cancelled.progress, 1, 200, offer.id).reason, 'offer-consumed');
});
