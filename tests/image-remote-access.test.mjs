import test from 'node:test';
import assert from 'node:assert/strict';
import settings from '../image-transfer-settings.js';
import ledger from '../image-transfer-ledger.js';
import remote from '../image-remote-access.js';

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

function media(status = 'allowed') {
  return {
    getStatus: () => status,
    canLoadExternalMedia: () => status === 'allowed',
  };
}

const today = new Date('2026-09-25T12:00:00Z');

test('VPN-required remote access fails closed before reserving transfer bytes', () => {
  for (const status of ['pending', 'checking', 'blocked']) {
    const storage = memoryStorage();
    assert.throws(
      () => remote.acquire({ storage, now: today, estimatedBytes: 1024, kind: 'preview', mediaAccess: media(status) }),
      error => error.name === 'ImageVpnRequiredError' && error.code === 'vpn-required'
    );
    const state = settings.load(storage, today);
    assert.equal(state.limitUsageBytes, 0);
    assert.equal(state.stats.blockedByVpn, 1);
  }
});

test('turning image VPN requirement off permits remote reads without a VPN verdict', () => {
  const storage = memoryStorage({ mangaReaderImageVpnRequired: 'false' });
  const ticket = remote.acquire({ storage, now: today, estimatedBytes: 2048, kind: 'preview', mediaAccess: media('blocked') });
  assert.equal(ticket.estimatedBytes, 2048);
  assert.equal(settings.load(storage, today).limitUsageBytes, 2048);
});

test('estimate reservation is refused before exceeding the daily limit', () => {
  const limit = 50 * 1024 * 1024;
  const storage = memoryStorage({
    mangaReaderStorageTransferLimitDaily: String(limit),
    mangaReaderStorageTransferUsageDaily: JSON.stringify({ day: '2026-09-25', bytes: limit - 100 }),
  });
  assert.throws(
    () => remote.acquire({ storage, now: today, estimatedBytes: 101, kind: 'zoom', mediaAccess: media('allowed') }),
    error => error.name === 'ImageTransferLimitError' && error.code === 'transfer-limit'
  );
  assert.equal(settings.load(storage, today).limitUsageBytes, limit - 100);
});

test('crossing half the daily estimate silently returns data-saver mode', () => {
  const limit = 150 * 1024 * 1024;
  const storage = memoryStorage({
    mangaReaderStorageTransferLimitDaily: String(limit),
    mangaReaderStorageTransferUsageDaily: JSON.stringify({ day: '2026-09-25', bytes: limit / 2 }),
    mangaReaderImageTransferStats: JSON.stringify({ day: '2026-09-25', estimatedBytes: limit / 2 }),
  });
  const ticket = remote.acquire({ storage, now: today, estimatedBytes: 1, kind: 'zoom', mediaAccess: media('allowed') });
  assert.equal(ticket.networkMode, 'data-saver');
  assert.equal(settings.load(storage, today).networkMode, 'data-saver');
});

test('observed bytes are recorded separately from estimated usage and split by object kind', () => {
  const storage = memoryStorage();
  const preview = remote.acquire({ storage, now: today, estimatedBytes: 5000, kind: 'preview', mediaAccess: media('allowed') });
  preview.recordObserved(4200);
  const zoom = remote.acquire({ storage, now: today, estimatedBytes: 8000, kind: 'zoom', mediaAccess: media('allowed') });
  zoom.recordObserved(7000);
  const state = settings.load(storage, today);
  assert.equal(state.limitUsageBytes, 13000);
  assert.equal(state.stats.estimatedBytes, 13000);
  assert.equal(state.stats.observedBytes, 11200);
  assert.equal(state.stats.previewBytes, 4200);
  assert.equal(state.stats.zoomBytes, 7000);
  assert.equal(state.stats.previewRequests, 1);
  assert.equal(state.stats.zoomRequests, 1);
});

test('cache hits and partial tile savings do not consume the daily transfer budget', () => {
  const storage = memoryStorage();
  remote.recordCacheHit(9000, { storage, now: today });
  remote.recordPartialSavings(12000, { storage, now: today });
  const state = settings.load(storage, today);
  assert.equal(state.limitUsageBytes, 0);
  assert.equal(state.stats.cacheHits, 1);
  assert.equal(state.stats.cacheSavedBytes, 9000);
  assert.equal(state.stats.partialSavedBytes, 12000);
});

test('provider-reported usage remains a separate nullable statistic', () => {
  const storage = memoryStorage();
  ledger.recordProviderReported(123456, { storage, now: today });
  let state = settings.load(storage, today);
  assert.equal(state.stats.providerReportedBytes, 123456);
  ledger.recordProviderReported(null, { storage, now: today });
  state = settings.load(storage, today);
  assert.equal(state.stats.providerReportedBytes, null);
});

test('tracked remote reads can be aborted centrally when the VPN policy closes', () => {
  const storage = memoryStorage({ mangaReaderImageVpnRequired: 'false' });
  let aborted = 0;
  const controller = { abort() { aborted += 1; } };
  const ticket = remote.acquire({
    storage,
    now: today,
    estimatedBytes: 1000,
    kind: 'zoom',
    mediaAccess: media('blocked'),
    abortController: controller,
  });
  remote.abortActiveRemoteReads();
  assert.equal(aborted, 1);
  ticket.release();
});
