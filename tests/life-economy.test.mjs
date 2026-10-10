import test from 'node:test';
import assert from 'node:assert/strict';
import economy from '../game/life-economy.js';

test('rent is paid in full when funds cover current rent and prior arrears', () => {
  const result = economy.chargeRent(20000, 12000, economy.createProgress(), 8);
  assert.equal(result.cashRemaining, 8000);
  assert.equal(result.paid, 12000);
  assert.deepEqual(result.progress, { arrears:0, graceEndsDay:null });
  assert.equal(result.status, 'paid');
});

test('insufficient rent funds never make cash negative and create interest-free arrears', () => {
  const result = economy.chargeRent(3000, 12000, economy.createProgress(), 8);
  assert.equal(result.cashRemaining, 0);
  assert.equal(result.paid, 3000);
  assert.deepEqual(result.progress, { arrears:9000, graceEndsDay:22 });
  assert.equal(result.status, 'grace');
  assert.equal(economy.status(result.progress, 22), 'grace');
  assert.equal(economy.status(result.progress, 23), 'overdue');
});

test('later rent adds no interest and repayment can be partial or complete', () => {
  const first = economy.chargeRent(0, 12000, economy.createProgress(), 8);
  const next = economy.chargeRent(5000, 12000, first.progress, 15);
  assert.equal(next.progress.arrears, 19000);
  assert.equal(next.progress.graceEndsDay, 22);
  const partial = economy.payArrears(next.progress, 4000, 2500);
  assert.equal(partial.paid, 2500);
  assert.equal(partial.cashRemaining, 1500);
  assert.equal(partial.progress.arrears, 16500);
  const final = economy.payArrears(partial.progress, 16500);
  assert.equal(final.paid, 16500);
  assert.deepEqual(final.progress, { arrears:0, graceEndsDay:null });
});

test('unpayable arrears do not lock life activities or cause eviction', () => {
  const progress = economy.chargeRent(0, 12000, economy.createProgress(), 8).progress;
  const result = economy.payArrears(progress, 0);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient-funds');
  assert.equal(economy.status(progress, 90), 'overdue');
  assert.equal(progress.arrears, 12000);
});

test('legacy negative cash migrates to visible rent arrears with a fresh grace period', () => {
  assert.deepEqual(economy.migrateLegacyCash(-3500, 12), {
    cash:0,
    progress:{ arrears:3500, graceEndsDay:26 }
  });
  assert.deepEqual(economy.migrateLegacyCash(4200, 12), {
    cash:4200,
    progress:{ arrears:0, graceEndsDay:null }
  });
});
