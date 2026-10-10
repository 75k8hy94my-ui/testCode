import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../game/cloud-save.js', import.meta.url), 'utf8');

function createCloudSave({ active = true, session = true, remote = null } = {}) {
  const events = new Map();
  const storage = new Map();
  const status = [];
  let savedPayload = null;
  const window = {
    MangaVault: {
      loadSession: () => session ? { user: { id: 'u1' } } : null,
      loadActive: () => active ? {} : null,
      waitForActive: async () => active ? {} : null,
      loadPayload: async () => remote,
      savePayload: async (payload) => { savedPayload = payload; }
    },
    MangaVaultPayload: {
      DATA_KEYS: { gameSave: 'mangaReaderCityDaysSave' },
      buildFromLocalStorage: () => ({ gameSave: JSON.parse(storage.get('mangaReaderCityDaysSave') || 'null') })
    },
    localStorage: {
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name) => events.delete(name)
  };
  vm.runInNewContext(source, { window, document: { getElementById: () => null, addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' }, location: { hostname: 'example.test', href: 'https://example.test/game/' }, URL, setTimeout, clearTimeout });
  return { api: window.CityDaysCloudSave, window, storage, status, events, getSavedPayload: () => savedPayload };
}

test('cloud save restores the remote game snapshot and writes it through the existing Vault payload', async () => {
  const snapshot = { version: 1, day: 4, cash: 6200 };
  const cloud = createCloudSave({ remote: { gameSave: snapshot } });
  let restored = null;
  await cloud.api.initialize({ restore: (value) => { restored = value; return true; }, capture: () => snapshot, setStatus: (value) => cloud.status.push(value) });
  await cloud.api.flush();
  assert.deepEqual(restored, snapshot);
  assert.deepEqual(JSON.parse(cloud.storage.get('mangaReaderCityDaysSave')), snapshot);
  assert.deepEqual(cloud.getSavedPayload(), { gameSave: snapshot });
});

test('cloud save does not persist or sync when the Vault is locked', async () => {
  const cloud = createCloudSave({ active: false });
  await cloud.api.initialize({ restore() {}, capture: () => ({ version: 1, day: 1 }), setStatus: (value) => cloud.status.push(value) });
  assert.equal(await cloud.api.flush(), false);
  assert.equal(cloud.storage.has('mangaReaderCityDaysSave'), false);
  assert.equal(cloud.getSavedPayload(), null);
});
