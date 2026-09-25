import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const settings = require('../image-transfer-settings.js');

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

test('image transfer settings default to VPN required, standard mode, and 150 MB daily limit', () => {
  const state = settings.load(memoryStorage(), new Date('2026-09-25T00:00:00Z'));
  assert.equal(state.vpnRequired, true);
  assert.equal(state.networkMode, 'standard');
  assert.equal(state.dailyLimitBytes, 150 * 1024 * 1024);
  assert.equal(state.limitUsageBytes, 0);
});

test('image transfer settings persist device-local VPN, mode, and daily limit choices', () => {
  const storage = memoryStorage();
  settings.setVpnRequired(false, storage);
  settings.setNetworkMode('data-saver', storage);
  settings.setDailyLimitBytes(300 * 1024 * 1024, storage);
  const state = settings.load(storage);
  assert.equal(state.vpnRequired, false);
  assert.equal(state.networkMode, 'data-saver');
  assert.equal(state.dailyLimitBytes, 300 * 1024 * 1024);
});

test('transfer stats keep estimated and observed byte counts separate', () => {
  const storage = memoryStorage({
    mangaReaderStorageTransferUsageDaily: JSON.stringify({ day: '2026-09-25', bytes: 1234 }),
    mangaReaderImageTransferStats: JSON.stringify({
      day: '2026-09-25',
      estimatedBytes: 2000,
      observedBytes: 1800,
      previewBytes: 900,
      zoomBytes: 900,
      cacheSavedBytes: 5000,
      partialSavedBytes: 7000,
      providerReportedBytes: 1900,
    }),
  });
  const state = settings.load(storage, new Date('2026-09-25T12:00:00Z'));
  assert.equal(state.limitUsageBytes, 1234);
  assert.equal(state.stats.estimatedBytes, 2000);
  assert.equal(state.stats.observedBytes, 1800);
  assert.equal(state.stats.providerReportedBytes, 1900);
});

test('old transfer stats do not leak into a new UTC day', () => {
  const storage = memoryStorage({
    mangaReaderStorageTransferUsageDaily: JSON.stringify({ day: '2026-09-24', bytes: 1234 }),
    mangaReaderImageTransferStats: JSON.stringify({ day: '2026-09-24', estimatedBytes: 2000, observedBytes: 1800 }),
  });
  const state = settings.load(storage, new Date('2026-09-25T12:00:00Z'));
  assert.equal(state.limitUsageBytes, 0);
  assert.equal(state.stats.estimatedBytes, 0);
  assert.equal(state.stats.observedBytes, 0);
});

test('profile image transfer UI exposes VPN toggle, network modes, usage split, and provider slot', () => {
  const ui = fs.readFileSync(new URL('../image-transfer-settings-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /profileImageVpnRequired/);
  assert.match(ui, /data-saver/);
  assert.match(ui, /standard/);
  assert.match(ui, /quality/);
  assert.match(ui, /推計転送量/);
  assert.match(ui, /受信オブジェクト量/);
  assert.match(ui, /キャッシュで節約/);
  assert.match(ui, /部分読込で節約/);
  assert.match(ui, /Provider実測/);
});

test('profile route lazy-loads image transfer settings without changing non-profile entry pages', () => {
  const spa = fs.readFileSync(new URL('../home-profile-spa.js', import.meta.url), 'utf8');
  assert.match(spa, /image-transfer-settings\.js\?v=20260925-image-sync-ui/);
  assert.match(spa, /image-transfer-settings-ui\.js\?v=20260925-image-sync-ui/);
  assert.match(spa, /ImageTransferSettingsUI\.mount/);
});
