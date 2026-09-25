import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import settings from '../image-transfer-settings.js';
import ledger from '../image-transfer-ledger.js';
import remoteAccess from '../image-remote-access.js';
import mediaGate from '../media-access-gate.js';

function memoryStorage() {
  const values = new Map();
  return { getItem(key) { return values.has(key) ? values.get(key) : null; }, setItem(key, value) { values.set(key, String(value)); } };
}
const now = new Date('2026-09-25T00:00:00.000Z');
const allowed = { getStatus: () => 'allowed', canLoadExternalMedia: () => true };
const blocked = { getStatus: () => 'blocked', canLoadExternalMedia: () => false };

test('settings defaults and UTC legacy compatibility are stable', () => {
  const storage = memoryStorage();
  const loaded = settings.load(storage, now);
  assert.equal(loaded.vpnRequired, true);
  assert.equal(loaded.dailyLimitBytes, 150 * 1024 * 1024);
  assert.equal(loaded.stats.providerReportedBytes, null);
  assert.equal(settings.dayKey(now), '2026-09-25');
  storage.setItem(settings.KEYS.legacyUsage, JSON.stringify({ day: '2026-09-25', bytes: 20 }));
  storage.setItem(settings.KEYS.stats, JSON.stringify({ day: '2026-09-25', estimatedBytes: 10 }));
  assert.equal(settings.load(storage, now).limitUsageBytes, 20);
});

test('storage omission uses browser localStorage for VPN and usage settings', async () => {
  const original = globalThis.localStorage;
  const storage = memoryStorage();
  storage.setItem(settings.KEYS.vpnRequired, 'false');
  storage.setItem(settings.KEYS.dailyLimit, '100');
  storage.setItem(settings.KEYS.legacyUsage, JSON.stringify({ day: settings.dayKey(now), bytes: 20 }));
  storage.setItem(settings.KEYS.stats, JSON.stringify({ day: settings.dayKey(now), estimatedBytes: 30, providerReportedBytes: null }));
  globalThis.localStorage = storage;
  try {
    let called = 0;
    await remoteAccess.runRemoteRead({ estimatedBytes: 50, now, mediaAccess: { getStatus: () => 'blocked', canLoadExternalMedia: () => false } }, async () => { called += 1; });
    assert.equal(called, 1);
    assert.equal(settings.load(undefined, now).limitUsageBytes, 80);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test('network mode changes only after the exact half-limit boundary', () => {
  const storage = memoryStorage();
  const limit = settings.DEFAULT_DAILY_LIMIT_BYTES;
  storage.setItem(settings.KEYS.stats, JSON.stringify({ day: settings.dayKey(now), estimatedBytes: limit / 2 }));
  assert.equal(settings.load(storage, now).networkMode, settings.STANDARD_NETWORK_MODE);
  storage.setItem(settings.KEYS.stats, JSON.stringify({ day: settings.dayKey(now), estimatedBytes: limit / 2 + 1 }));
  assert.equal(settings.load(storage, now).networkMode, settings.SAVER_NETWORK_MODE);
});

test('ledger separates estimate, observed, kind totals, cache and partial savings', () => {
  const storage = memoryStorage();
  assert.equal(ledger.reserveEstimate(100, { storage, now }).ok, true);
  ledger.recordObserved(80, 'preview', { storage, now });
  ledger.recordObserved(30, 'zoom', { storage, now });
  ledger.recordCacheHit(500, { storage, now });
  ledger.recordPartialSavings(20, { storage, now });
  const stats = ledger.currentStats(storage, now);
  assert.equal(stats.estimatedBytes, 100);
  assert.equal(stats.observedBytes, 110);
  assert.equal(stats.previewBytes, 80);
  assert.equal(stats.zoomBytes, 30);
  assert.equal(stats.previewRequests, 1);
  assert.equal(stats.zoomRequests, 1);
  assert.equal(stats.cacheHits, 1);
  assert.equal(stats.cacheSavedBytes, 500);
  assert.equal(stats.partialSavedBytes, 20);
});

test('providerReportedBytes null survives writes while zero remains numeric', () => {
  const storage = memoryStorage();
  ledger.reserveEstimate(1, { storage, now });
  ledger.recordObserved(1, 'preview', { storage, now });
  assert.equal(ledger.currentStats(storage, now).providerReportedBytes, null);
  ledger.recordProviderReported(0, { storage, now });
  assert.equal(ledger.currentStats(storage, now).providerReportedBytes, 0);
});

test('limit equality is allowed and one byte over is rejected before operation', async () => {
  const storage = memoryStorage();
  storage.setItem(settings.KEYS.dailyLimit, '100');
  storage.setItem(settings.KEYS.stats, JSON.stringify({ day: settings.dayKey(now), estimatedBytes: 99 }));
  let calls = 0;
  await remoteAccess.runRemoteRead({ storage, now, estimatedBytes: 1, mediaAccess: allowed }, async () => { calls += 1; return true; });
  await assert.rejects(remoteAccess.runRemoteRead({ storage, now, estimatedBytes: 1, mediaAccess: allowed }, async () => { calls += 1; }), error => error.name === 'ImageTransferLimitError');
  assert.equal(calls, 1);
});

test('VPN blocked fails closed, records blocked, and VPN off permits the operation', async () => {
  const storage = memoryStorage();
  let calls = 0;
  await assert.rejects(remoteAccess.runRemoteRead({ storage, now, estimatedBytes: 1, mediaAccess: blocked }, async () => { calls += 1; }), error => error.name === 'ImageVpnRequiredError');
  assert.equal(calls, 0);
  assert.equal(ledger.currentStats(storage, now).blockedByVpn, 1);
  settings.setVpnRequired(false, storage);
  await remoteAccess.runRemoteRead({ storage, now, estimatedBytes: 1, mediaAccess: blocked }, async () => { calls += 1; });
  assert.equal(calls, 1);
});

test('missing media access fails closed when VPN is required', async () => {
  await assert.rejects(remoteAccess.runRemoteRead({ storage: memoryStorage(), now, estimatedBytes: 1, mediaAccess: null }, async () => {}), error => error.name === 'ImageVpnRequiredError');
});

test('runRemoteRead reserves before operation, records observed, and supports external abort', async () => {
  const storage = memoryStorage();
  let observedAtStart = 0;
  await remoteAccess.runRemoteRead({ storage, now, estimatedBytes: 7, kind: 'zoom', mediaAccess: allowed }, async ({ recordObserved }) => {
    observedAtStart = ledger.currentStats(storage, now).estimatedBytes;
    recordObserved(5);
  });
  assert.equal(observedAtStart, 7);
  assert.equal(ledger.currentStats(storage, now).zoomBytes, 5);
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(remoteAccess.runRemoteRead({ storage, now, estimatedBytes: 1, mediaAccess: allowed, signal: controller.signal }, async () => { calls += 1; }), error => error.name === 'AbortError');
  assert.equal(calls, 0);
});

test('central abort releases active remote operation tracking', async () => {
  const storage = memoryStorage();
  let aborted = false;
  const promise = remoteAccess.runRemoteRead({ storage, now, estimatedBytes: 1, mediaAccess: allowed }, ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
  }));
  await new Promise((resolve) => setImmediate(resolve));
  remoteAccess.abortActiveRemoteReads();
  await assert.rejects(promise, error => error.name === 'AbortError');
  assert.equal(aborted, true);
});

test('external abort listener is removed when acquire rejects', async () => {
  const listeners = new Map();
  const signal = { aborted: false, addEventListener(name, callback) { listeners.set(name, callback); }, removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); } };
  await assert.rejects(remoteAccess.runRemoteRead({ storage: memoryStorage(), now, estimatedBytes: 1, mediaAccess: blocked, signal }, async () => {}), error => error.name === 'ImageVpnRequiredError');
  assert.equal(listeners.size, 0);
});

test('media gate exposes status and dispatches status changes', () => {
  const events = [];
  const source = fs.readFileSync(new URL('../media-access-gate.js', import.meta.url), 'utf8');
  const document = { dispatchEvent(event) { events.push(event); }, addEventListener() {}, querySelectorAll() { return []; }, getElementById() { return null; }, body: null, readyState: 'loading' };
  const CustomEvent = function (name, init) { this.type = name; this.detail = init.detail; };
  const sandbox = { module: { exports: {} }, document, CustomEvent, setTimeout() {}, clearTimeout() {}, location: {}, console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  const api = sandbox.module.exports;
  assert.equal(api.getStatus(), 'pending');
  api.setAllowedForTesting(true);
  assert.equal(api.getStatus(), 'allowed');
  assert.equal(events.at(-1).type, 'manga-reader-vpn-status');
  assert.equal(events.at(-1).detail.status, 'allowed');
});
