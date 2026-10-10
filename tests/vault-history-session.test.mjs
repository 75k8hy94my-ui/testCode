import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import payloadApi from '../vault-payload.js';
import historyApi from '../vault-history.js';

const source = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');
const encode = (bytes) => Buffer.from(bytes).toString('base64url');
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    entries() { return [...values.entries()]; },
  };
}
async function encryptSnapshot(keyBytes, value) {
  const key = await webcrypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
}
function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

async function fixture({ locked = false, authenticated = true, canRead = true, historyRows = [], remoteRecord = null, rawKey: suppliedRawKey, onUpdate } = {}) {
  const rawKey = suppliedRawKey || webcrypto.getRandomValues(new Uint8Array(32));
  const local = storage();
  const session = storage();
  if (authenticated) local.setItem('mangaReaderSupabaseSession', JSON.stringify({
    access_token: 'test-access', refresh_token: 'test-refresh', expires_at: Date.now() / 1000 + 3600,
    user: { id: 'user-1' },
  }));
  if (!locked) session.setItem('mangaReaderActiveVault', JSON.stringify({ rawKey: encode(rawKey), keyWraps: remoteRecord?.payload?.keyWraps || { passphrase: { marker: 'current' } } }));
  const payloadApiForContext = {
    ...payloadApi,
    buildFromLocalStorage: () => payloadApi.buildFromLocalStorage(local),
    applyToLocalStorage: (payload) => payloadApi.applyToLocalStorage(payload, local),
  };
  if (remoteRecord && remoteRecord.payload?.data) payloadApi.applyToLocalStorage(await decryptEnvelope(rawKey, remoteRecord.payload.data), local);
  const requests = [];
  let servedHistoryRows = historyRows;
  const documentListeners = new Map();
  const windowListeners = new Map();
  const addListener = (map, type, handler) => map.set(type, [...(map.get(type) || []), handler]);
  const documentRef = {
    visibilityState: 'visible',
    addEventListener(type, handler) { addListener(documentListeners, type, handler); },
    dispatchEvent() {},
  };
  const gate = { canReadProtectedData: () => canRead };
  const context = {
    window: {
      MANGA_READER_SUPABASE: { url: 'https://vault.test', publishableKey: 'public-key' },
      MangaVaultPayload: payloadApiForContext,
      MangaVaultHistory: historyApi,
      MangaReaderMediaAccess: gate,
      document: documentRef,
      addEventListener(type, handler) { addListener(windowListeners, type, handler); },
      dispatchEvent(event) { (windowListeners.get(event.type) || []).forEach((handler) => handler(event)); },
      CustomEvent: class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    },
    document: documentRef,
    navigator: { onLine: true },
    location: { hostname: 'vault.test', protocol: 'https:' },
    crypto: webcrypto,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    localStorage: local, sessionStorage: session,
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).includes('/rest/v1/manga_reader_vault_history?')) return response(servedHistoryRows);
      if (String(url).includes('/rest/v1/rpc/set_manga_reader_vault_history_protected')) return response(true);
      if (String(url).includes('/rest/v1/rpc/manga_reader_vault_sync_capability')) return response(4);
      if (String(url).includes('/rest/v1/rpc/update_manga_reader_vault_v4')) {
        const body = JSON.parse(options.body);
        if (onUpdate) return response(await onUpdate(body, remoteRecord));
        if (!remoteRecord || Number(body.expected_revision) !== Number(remoteRecord.revision)) return response([]);
        remoteRecord.payload = body.new_payload;
        remoteRecord.revision += 1;
        remoteRecord.updated_at = '2026-10-11T01:00:00Z';
        return response([{ revision: remoteRecord.revision, updated_at: remoteRecord.updated_at }]);
      }
      if (String(url).includes('/rest/v1/manga_reader_vaults?')) return response(remoteRecord ? [remoteRecord] : []);
      throw new Error('Unexpected request to ' + String(url));
    },
    Date, Math, JSON, TextEncoder, TextDecoder, Uint8Array, setTimeout, clearTimeout, setInterval, clearInterval,
  };
  vm.runInNewContext(source, context, { filename: 'vault-session.js' });
  if (remoteRecord) await context.window.MangaVault.loadPayload();
  return { vault: context.window.MangaVault, window: context.window, local, session, rawKey, requests, gate, remoteRecord, setHistoryRows(rows) { servedHistoryRows = rows; } };
}
async function decryptEnvelope(keyBytes, encrypted) {
  const key = await webcrypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const bytes = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(encrypted.iv, 'base64url') }, key, Buffer.from(encrypted.ciphertext, 'base64url'));
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function makeVaultRecord(rawKey, data, wrappers, revision = 8) {
  const encrypted = await encryptSnapshot(rawKey, data);
  return { payload: { type: 'manga-reader-vault', version: 1, syncProtocolVersion: 4, createdAt: 'old', algorithm: 'AES-256-GCM', keyWraps: wrappers, data: encrypted }, revision, updated_at: '2026-10-10T00:00:00Z' };
}

test('history reads are blocked before any request while locked', async () => {
  const state = await fixture({ locked: true });
  await assert.rejects(state.vault.listVaultHistory(), /ロック|開いて/);
  assert.equal(state.requests.length, 0);
});

test('history reads are blocked before any request while unauthenticated', async () => {
  const state = await fixture({ authenticated: false });
  await assert.rejects(state.vault.listVaultHistory(), /ログイン/);
  assert.equal(state.requests.length, 0);
});

test('history reads are blocked before any request while protected-data access is denied', async () => {
  const state = await fixture({ canRead: false });
  await assert.rejects(state.vault.listVaultHistory(), /VPN接続/);
  assert.equal(state.requests.length, 0);
});

test('authorized history is bounded, owner-filtered, decrypted in memory, and not persisted', async () => {
  const key = webcrypto.getRandomValues(new Uint8Array(32));
  const data = { items: [{ id: 'secret-id', title: 'history-only-title' }], videos: [] };
  const state = await fixture({ historyRows: [{
    history_id: 'history-1', user_id: 'user-1', revision: 12, updated_at: '2026-10-11T00:00:00Z',
    encrypted_data: await encryptSnapshot(key, data), encoded_bytes: 128, protected: false,
  }] });
  state.session.setItem('mangaReaderActiveVault', JSON.stringify({ rawKey: encode(key), keyWraps: {} }));
  const beforeLocal = state.local.entries();
  const result = await state.vault.listVaultHistory({ limit: 500 });
  assert.equal(result.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result[0].payload)).items, data.items);
  assert.equal(result[0].revision, 12);
  assert.match(state.requests[0].url, /user_id=eq\.user-1/);
  assert.match(state.requests[0].url, /limit=50/);
  assert.doesNotMatch(state.requests[0].url, /history-only-title|secret-id/);
  assert.deepEqual(state.local.entries(), beforeLocal);
  assert.ok(!JSON.stringify(state.local.entries()).includes('history-only-title'));
});

test('history pagination uses revisions and a caller-supplied bounded limit', async () => {
  const state = await fixture();
  await state.vault.listVaultHistory({ beforeRevision: 40, limit: 7 });
  assert.match(state.requests[0].url, /revision=lt\.40/);
  assert.match(state.requests[0].url, /limit=7/);
});

test('history protection changes use the owner RPC and do not alter sync state', async () => {
  const state = await fixture();
  const before = state.local.entries();
  state.requests.length = 0;
  assert.equal(await state.vault.setVaultHistoryProtected('history-1', true), true);
  assert.match(state.requests[0].url, /set_manga_reader_vault_history_protected/);
  assert.deepEqual(JSON.parse(state.requests[0].options.body), { requested_history_id: 'history-1', requested_protected: true });
  assert.deepEqual(state.local.entries(), before);
});

test('history reads stop after the Vault is locked or protected access is lost', async () => {
  const state = await fixture();
  await state.vault.listVaultHistory();
  state.vault.lockVault();
  await assert.rejects(state.vault.listVaultHistory(), /ロック|開いて/);
  state.session.setItem('mangaReaderActiveVault', JSON.stringify({ rawKey: encode(state.rawKey), keyWraps: {} }));
  state.gate.canReadProtectedData = () => false;
  await assert.rejects(state.vault.listVaultHistory(), /VPN接続/);
  assert.equal(state.requests.length, 1);
});

test('locking the active Vault emits a local cleanup event for decrypted views', async () => {
  const state = await fixture();
  let cleared = 0;
  state.window.addEventListener('manga-vault-cleared', () => { cleared++; });
  state.vault.lockVault();
  assert.equal(cleared, 1);
  assert.equal(state.vault.loadActive(), null);
});

test('restore preview compares a selected encrypted snapshot with the latest cloud revision', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const wrappers = { passphrase: { marker: 'keep-current-wrapper' } };
  const current = { items: [{ id: 'm1', title: 'current' }], vaultSyncTombstones: [] };
  const historical = payloadApi.normalize({ items: [{ id: 'm1', title: 'historical' }], vaultSyncTombstones: [] });
  const row = { history_id: 'history-restore', revision: 4, updated_at: '2026-10-09T00:00:00Z', encrypted_data: await encryptSnapshot(rawKey, historical), protected: false };
  const state = await fixture({ rawKey, remoteRecord: await makeVaultRecord(rawKey, current, wrappers), historyRows: [row] });
  assert.deepEqual(payloadApi.normalize(payloadApi.buildFromLocalStorage(state.local)), payloadApi.normalize(current));
  const preview = await state.vault.previewVaultHistoryRestore(row.history_id);
  assert.equal(preview.baseRevision, 8);
  assert.equal(preview.historyId, row.history_id);
  assert.ok(preview.changes.some((change) => change.path === '/items/m1/title' && change.type === 'change'));
  assert.equal(state.remoteRecord.revision, 8);
});

test('restore confirmation creates one new v4 revision with current wrappers and applies only after CAS success', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const wrappers = { passphrase: { marker: 'current-wrapper' }, recovery: { marker: 'current-recovery' } };
  const current = payloadApi.normalize({ items: [{ id: 'm1', title: 'current' }], vaultSyncTombstones: [] });
  const historical = payloadApi.normalize({ items: [{ id: 'm1', title: 'historical' }], vaultSyncTombstones: [] });
  const row = { history_id: 'history-confirm', revision: 3, updated_at: 'then', encrypted_data: await encryptSnapshot(rawKey, historical), protected: false };
  let submitted;
  const state = await fixture({ rawKey, remoteRecord: await makeVaultRecord(rawKey, current, wrappers, 12), historyRows: [row], onUpdate: async (body, remote) => {
    submitted = body;
    remote.payload = body.new_payload;
    remote.revision += 1;
    remote.updated_at = 'restored-now';
    return [{ revision: remote.revision, updated_at: remote.updated_at }];
  } });
  const beforeLocal = payloadApi.buildFromLocalStorage(state.local);
  await state.vault.previewVaultHistoryRestore(row.history_id);
  const result = await state.vault.confirmVaultHistoryRestore(row.history_id, 12);
  assert.equal(result.revision, 13);
  assert.equal(state.remoteRecord.revision, 13);
  assert.equal(submitted.expected_revision, 12);
  assert.equal(submitted.new_payload.syncProtocolVersion, 4);
  assert.deepEqual(submitted.new_payload.keyWraps, wrappers);
  assert.deepEqual(await decryptEnvelope(rawKey, submitted.new_payload.data), historical);
  assert.notDeepEqual(payloadApi.buildFromLocalStorage(state.local), beforeLocal);
  assert.equal(payloadApi.buildFromLocalStorage(state.local).items[0].title, 'historical');
  const undo = { history_id: 'history-before-restore', revision: 12, updated_at: 'before', encrypted_data: await encryptSnapshot(rawKey, current), protected: false };
  state.setHistoryRows([undo]);
  state.remoteRecord.revision = 13;
  // The mock serves history from a mutable list so the restored pre-state can be selected as a new point.
  await state.vault.previewVaultHistoryRestore(undo.history_id);
  await state.vault.confirmVaultHistoryRestore(undo.history_id, 13);
  assert.equal(state.remoteRecord.revision, 14);
  assert.equal((await decryptEnvelope(rawKey, state.remoteRecord.payload.data)).items[0].title, 'current');
});

test('restore confirmation aborts when the cloud revision changed after preview', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const wrappers = { passphrase: { marker: 'current' } };
  const current = payloadApi.normalize({ items: [{ id: 'm1', title: 'current' }] });
  const historical = payloadApi.normalize({ items: [{ id: 'm1', title: 'past' }] });
  const row = { history_id: 'history-stale', revision: 2, updated_at: 'then', encrypted_data: await encryptSnapshot(rawKey, historical), protected: false };
  const state = await fixture({ rawKey, remoteRecord: await makeVaultRecord(rawKey, current, wrappers), historyRows: [row] });
  await state.vault.previewVaultHistoryRestore(row.history_id);
  state.remoteRecord.revision += 1;
  const updateCalls = state.requests.filter((request) => request.url.includes('update_manga_reader_vault_v4')).length;
  await assert.rejects(state.vault.confirmVaultHistoryRestore(row.history_id, 8), /更新|再確認|プレビュー/);
  assert.equal(state.requests.filter((request) => request.url.includes('update_manga_reader_vault_v4')).length, updateCalls);
});

test('restore with a tombstoned entity previews and saves a fresh ID while retaining the tombstone', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const wrappers = { passphrase: { marker: 'current' } };
  const current = payloadApi.normalize({ folders: [], items: [], vaultSyncTombstones: ['/items/deleted-manga'] });
  const previouslyLoaded = payloadApi.normalize({ folders: [], items: [], vaultSyncTombstones: [] });
  const historical = payloadApi.normalize({ items: [{ id: 'deleted-manga', title: 'restored' }], vaultSyncTombstones: [] });
  const row = { history_id: 'history-tombstone', revision: 1, updated_at: 'then', encrypted_data: await encryptSnapshot(rawKey, historical), protected: false };
  const state = await fixture({ rawKey, remoteRecord: await makeVaultRecord(rawKey, previouslyLoaded, wrappers), historyRows: [row] });
  state.remoteRecord.payload.data = await encryptSnapshot(rawKey, current);
  state.remoteRecord.revision = 9;
  await state.vault.previewVaultHistoryRestore(row.history_id);
  const result = await state.vault.confirmVaultHistoryRestore(row.history_id, 9);
  const saved = await decryptEnvelope(rawKey, state.remoteRecord.payload.data);
  assert.notEqual(saved.items[0].id, 'deleted-manga');
  assert.deepEqual(saved.vaultSyncTombstones, ['/items/deleted-manga']);
  assert.equal(result.idMap['items:deleted-manga'], saved.items[0].id);
});

test('restore refuses to overwrite local pending changes and does not call CAS', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const wrappers = { passphrase: { marker: 'current' } };
  const current = payloadApi.normalize({ items: [{ id: 'm1', title: 'current' }] });
  const historical = payloadApi.normalize({ items: [{ id: 'm1', title: 'past' }] });
  const row = { history_id: 'history-pending', revision: 1, updated_at: 'then', encrypted_data: await encryptSnapshot(rawKey, historical), protected: false };
  const state = await fixture({ rawKey, remoteRecord: await makeVaultRecord(rawKey, current, wrappers), historyRows: [row] });
  await state.vault.previewVaultHistoryRestore(row.history_id);
  state.local.setItem(payloadApi.DATA_KEYS.items, JSON.stringify([{ id: 'local-only', title: 'pending' }]));
  await assert.rejects(state.vault.confirmVaultHistoryRestore(row.history_id, 8), /未同期|端末|保留/);
  assert.equal(state.requests.some((request) => request.url.includes('update_manga_reader_vault_v4')), false);
});

test('restore with an unknown network outcome leaves local payload and pending metadata untouched', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const wrappers = { passphrase: { marker: 'current' } };
  const current = payloadApi.normalize({ items: [{ id: 'm1', title: 'current' }] });
  const historical = payloadApi.normalize({ items: [{ id: 'm1', title: 'past' }] });
  const row = { history_id: 'history-unknown', revision: 1, updated_at: 'then', encrypted_data: await encryptSnapshot(rawKey, historical), protected: false };
  let state;
  state = await fixture({ rawKey, remoteRecord: await makeVaultRecord(rawKey, current, wrappers), historyRows: [row], onUpdate: async () => {
    state.vault.markLocalChangesPending();
    throw new Error('connection lost after request');
  } });
  const localBefore = payloadApi.buildFromLocalStorage(state.local);
  await state.vault.previewVaultHistoryRestore(row.history_id);
  await assert.rejects(state.vault.confirmVaultHistoryRestore(row.history_id, 8), /応答を確認できません/);
  assert.deepEqual(payloadApi.buildFromLocalStorage(state.local), localBefore);
  assert.equal(state.vault.hasPendingLocalChanges(), true);
  assert.equal(state.remoteRecord.revision, 8);
});
