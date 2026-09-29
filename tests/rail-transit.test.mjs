import test from 'node:test';
import assert from 'node:assert/strict';
import transit from '../game/rail-transit.js';

test('rail fare progress begins empty and normalizes tickets and same-day pass safely', () => {
  assert.deepEqual(transit.createProgress(), { singleTickets:0, dayPassDay:null, trips:0 });
  assert.deepEqual(transit.normalizeProgress({ singleTickets:99, dayPassDay:3, trips:-8 }, 3), { singleTickets:5, dayPassDay:3, trips:0 });
  assert.deepEqual(transit.normalizeProgress({ singleTickets:-1, dayPassDay:3.5, trips:4 }, 3), { singleTickets:0, dayPassDay:null, trips:4 });
  assert.deepEqual(transit.normalizeProgress({ singleTickets:2, dayPassDay:3, trips:4 }, 4), { singleTickets:2, dayPassDay:null, trips:4 });
  assert.deepEqual(transit.normalizeProgress(null, 4), transit.createProgress());
});

test('single tickets cost ¥200, take two minutes, and stop at the five-ticket limit', () => {
  const bought = transit.buySingle(transit.createProgress(), 200);
  assert.equal(bought.ok, true);
  assert.equal(bought.cashRemaining, 0);
  assert.equal(bought.duration, 2);
  assert.equal(bought.progress.singleTickets, 1);
  let progress = bought.progress;
  for (let i=0; i<4; i+=1) progress = transit.buySingle(progress, 1000).progress;
  const full = transit.buySingle(progress, 1000);
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'ticket-limit');
  assert.deepEqual(full.progress, progress);
});

test('day pass costs ¥500, is valid only for its purchase day, and cannot be bought too late', () => {
  const bought = transit.buyDayPass(transit.createProgress(), 2, 1436, 500);
  assert.equal(bought.ok, true);
  assert.equal(bought.cashRemaining, 0);
  assert.equal(bought.duration, 3);
  assert.equal(bought.progress.dayPassDay, 2);
  assert.equal(transit.listOptions(bought.progress, 2, 1439, 1000).dayPass.available, false);
  assert.equal(transit.listOptions(bought.progress, 3, 480, 1000).dayPass.available, true);
  assert.equal(transit.normalizeProgress(bought.progress, 3).dayPassDay, null);
  assert.equal(transit.buyDayPass(transit.createProgress(), 2, 1437, 1000).reason, 'too-late');
  assert.equal(transit.buyDayPass(bought.progress, 2, 480, 1000).reason, 'already-active');
});

test('failed purchase reasons preserve cash-side progress for funds, invalid time, and expired pass', () => {
  const empty = transit.createProgress();
  assert.deepEqual(transit.buySingle(empty, 199), { ok:false, reason:'insufficient-funds', progress:empty });
  assert.deepEqual(transit.buyDayPass(empty, 0, 480, 1000), { ok:false, reason:'invalid-day', progress:empty });
  assert.deepEqual(transit.buyDayPass(empty, 1, 480.5, 1000), { ok:false, reason:'invalid-time', progress:empty });
  const previous = { singleTickets:0, dayPassDay:1, trips:0 };
  assert.equal(transit.board(previous, 2).reason, 'no-fare');
  assert.deepEqual(previous, { singleTickets:0, dayPassDay:1, trips:0 });
});

test('boarding spends an active day pass first, otherwise one single ticket, never both', () => {
  const both = { singleTickets:2, dayPassDay:3, trips:4 };
  const passRide = transit.board(both, 3);
  assert.equal(passRide.ok, true);
  assert.equal(passRide.fare, 'day-pass');
  assert.deepEqual(passRide.progress, { singleTickets:2, dayPassDay:3, trips:5 });

  const ticketRide = transit.board(passRide.progress, 4);
  assert.equal(ticketRide.ok, true);
  assert.equal(ticketRide.fare, 'single-ticket');
  assert.deepEqual(ticketRide.progress, { singleTickets:1, dayPassDay:null, trips:6 });

  const noFare = transit.board(ticketRide.progress, 4);
  assert.equal(noFare.ok, true);
  assert.equal(noFare.progress.singleTickets, 0);
  assert.equal(transit.board(noFare.progress, 4).reason, 'no-fare');
});
