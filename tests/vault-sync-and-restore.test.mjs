import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import mergeModule from '../vault-sync-merge.js';

const source = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');
const syncPage = fs.readFileSync(new URL('../sync.html', import.meta.url), 'utf8');
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const fromB64url = (value) => new Uint8Array(Buffer.from(value, 'base64url'));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function makeStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}
async function encrypt(key, bytes) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: b64url(iv), ciphertext: b64url(new Uint8Array(ciphertext)) };
}
async function encryptPayload(rawKey, payload, keyWraps = {}) {
  const key = await webcrypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { type: 'manga-reader-vault', version: 1, createdAt: 'test', algorithm: 'AES-256-GCM', keyWraps, data: await encrypt(key, new TextEncoder().encode(JSON.stringify(payload))) };
}
async function decryptPayload(rawKey, envelope) {
  const key = await webcrypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const bytes = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(envelope.data.iv) }, key, fromB64url(envelope.data.ciphertext));
  return JSON.parse(new TextDecoder().decode(bytes));
}
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => '' }; }
function lockManager() {
  let tail = Promise.resolve();
  return { request(_name, _options, work) {
    const previous = tail; let release;
    tail = new Promise((resolve) => { release = resolve; });
    return previous.then(work).finally(release);
  } };
}
async function fixture({ initialPayload = {}, rawKey = webcrypto.getRandomValues(new Uint8Array(32)), revision = 1, remote, localStorage, sessionStorage, locks, rpc, gate, credentials, passkeySupported = false } = {}) {
  const sharedRemote = remote || { record: null };
  const local = localStorage || makeStorage();
  const session = sessionStorage || makeStorage();
  local.setItem('mangaReaderSupabaseSession', JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_at: Date.now() / 1000 + 3600, user: { id: 'user-1' } }));
  if (!local.getItem('mangaReaderSupabaseSyncMeta')) local.setItem('mangaReaderSupabaseSyncMeta', JSON.stringify({ 'user-1': { revision, updatedAt: 'before' } }));
  if (!session.getItem('mangaReaderActiveVault')) session.setItem('mangaReaderActiveVault', JSON.stringify({ rawKey: b64url(rawKey), keyWraps: {} }));
  local.setItem('testPayload', JSON.stringify(initialPayload));
  if (sharedRemote.record === null && revision > 0) sharedRemote.record = {
    payload: await encryptPayload(rawKey, {}), revision, updated_at: 'before',
  };
  const context = {
    window: {
      MANGA_READER_SUPABASE: { url: 'https://vault.test', publishableKey: 'public' },
      crypto: webcrypto,
      PublicKeyCredential: passkeySupported ? function PublicKeyCredential() {} : undefined,
      addEventListener() {},
      dispatchEvent() {},
      MangaVaultPayload: { buildFromLocalStorage: () => JSON.parse(local.getItem('testPayload') || '{}'), applyToLocalStorage: payload => local.setItem('testPayload', JSON.stringify(payload)) },
      MangaVaultSyncMerge: mergeModule,
    },
    navigator: { locks, credentials: credentials || {} },
    location: { hostname: 'vault.test', protocol: 'https:' },
    crypto: webcrypto,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    TextEncoder, TextDecoder, Uint8Array, Date, Math, JSON,
    localStorage: local, sessionStorage: session,
    fetch: async (url, options = {}) => {
      const address = String(url);
      if (address.includes('/rest/v1/rpc/update_manga_reader_vault')) {
        const body = JSON.parse(options.body);
        if (rpc) return response(await rpc(body, sharedRemote));
        if (!sharedRemote.record || body.expected_revision !== sharedRemote.record.revision) return response([]);
        sharedRemote.record = { payload: body.new_payload, revision: sharedRemote.record.revision + 1, updated_at: 'after' };
        return response([{ revision: sharedRemote.record.revision, updated_at: sharedRemote.record.updated_at }]);
      }
      if (address.includes('/rest/v1/manga_reader_vaults?')) return response(sharedRemote.record ? [sharedRemote.record] : []);
      if (address.endsWith('/rest/v1/manga_reader_vaults') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        if (sharedRemote.record) return response({ message: 'duplicate' }, 409);
        sharedRemote.record = { payload: body.payload, revision: 1, updated_at: 'created' };
        return response([{ revision: 1, updated_at: 'created' }], 201);
      }
      throw new Error('Unexpected request: ' + address);
    },
  };
  if (gate) context.window.MangaReaderMediaAccess = gate;
  vm.runInNewContext(source, context, { filename: 'vault-session.js' });
  if (sharedRemote.record) await context.window.MangaVault.loadPayload();
  return { vault: context.window.MangaVault, local, session, remote: sharedRemote, rawKey, context };
}

test('CAS retry merges a stale device addition into the latest cloud payload', async () => {
  const base = { items: [], videos: [] };
  const fromDeviceA = { items: [{ id: 'manga-x', title: '漫画X' }], videos: [] };
  const fromDeviceB = { items: [], videos: [{ id: 'video-y', title: '動画Y' }] };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const remote = { record: { payload: await encryptPayload(rawKey, base), revision: 1, updated_at: 'base' } };
  const deviceAPayload = await encryptPayload(rawKey, fromDeviceA);
  let calls = 0;
  const { vault, local } = await fixture({ initialPayload: base, rawKey, revision: 1, remote, rpc: async (body, state) => {
    calls += 1;
    if (calls === 1) {
      state.record = { payload: deviceAPayload, revision: 2, updated_at: 'device-a' };
      return [];
    }
    if (body.expected_revision !== state.record.revision) return [];
    state.record = { payload: body.new_payload, revision: state.record.revision + 1, updated_at: 'saved-' + calls };
    return [{ revision: state.record.revision, updated_at: state.record.updated_at }];
  } });
  local.setItem('testPayload', JSON.stringify(fromDeviceB));

  await vault.saveLocalChanges();

  const saved = await decryptPayload(rawKey, remote.record.payload);
  assert.equal(calls, 2);
  assert.deepEqual(saved.items, fromDeviceA.items);
  assert.deepEqual(saved.videos, fromDeviceB.videos);
});

test('successful cloud read stores the baseline encrypted and bound to the account', async () => {
  const protectedValue = { items: [{ id: 'private-work', title: '非公開タイトル' }] };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const remote = { record: { payload: await encryptPayload(rawKey, protectedValue), revision: 4, updated_at: 'remote' } };
  const { local } = await fixture({ initialPayload: protectedValue, rawKey, revision: 4, remote });
  const serialized = local.getItem('mangaReaderSupabaseSyncMeta');
  const meta = JSON.parse(serialized)['user-1'];
  assert.equal(meta.encryptedBaseline.type, 'manga-reader-vault-baseline');
  assert.equal(meta.encryptedBaseline.userId, 'user-1');
  assert.equal(meta.encryptedBaseline.revision, 4);
  assert.equal(typeof meta.encryptedBaseline.ciphertext, 'string');
  assert.equal(serialized.includes('非公開タイトル'), false);
  assert.equal(serialized.includes('private-work'), false);
});

test('a corrupt encrypted baseline stops sync and retains the local edit', async () => {
  const base = { items: [{ id: 'private-work', title: '基準' }] };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const remote = { record: { payload: await encryptPayload(rawKey, base), revision: 1, updated_at: 'base' } };
  const { vault, local } = await fixture({ initialPayload: base, rawKey, remote });
  const metas = JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'));
  metas['user-1'].encryptedBaseline.ciphertext = 'tampered';
  local.setItem('mangaReaderSupabaseSyncMeta', JSON.stringify(metas));
  const localEdit = { items: [{ id: 'private-work', title: '端末変更' }] };
  local.setItem('testPayload', JSON.stringify(localEdit));

  await assert.rejects(vault.saveLocalChanges(), /同期基準を復号できないため同期を停止しました/);

  assert.deepEqual(JSON.parse(local.getItem('testPayload')), localEdit);
  assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].pendingSync, true);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), base);
});

test('sync page passes applyPayload before createPayload to initialize', () => {
  const html = fs.readFileSync(new URL('../sync.html', import.meta.url), 'utf8');
  assert.match(html, /MangaVault\.initialize\(isRecovery \? '' : credential,isRecovery \? credential\.trim\(\) : '',applyPayload,buildPayload\)/);
});

test('serial saves read the newest local snapshot when each queued write starts', async () => {
  const started = deferred(); const release = deferred(); let calls = 0;
  const { vault, local, remote, rawKey } = await fixture({
    initialPayload: { videos: [{ id: 'v1', url: 'https://example.test/1', title: '旧題' }] },
    rpc: async (body, state) => {
      calls++;
      if (calls === 1) { started.resolve(); await release.promise; }
      if (body.expected_revision !== state.record.revision) return [];
      state.record = { payload: body.new_payload, revision: state.record.revision + 1, updated_at: 'updated-' + calls };
      return [{ revision: state.record.revision, updated_at: state.record.updated_at }];
    },
  });
  const first = vault.saveLocalChanges();
  await started.promise;
  local.setItem('testPayload', JSON.stringify({ videos: [
    { id: 'v1', url: 'https://example.test/1', title: '最新タイトル' },
    { id: 'v2', url: 'https://example.test/2', title: '追加動画' },
  ], videoMeta: { v1: { folderId: 'folder-2', watchStatus: 'watching' } }, items: [{ id: 'manga-1' }] }));
  const second = vault.saveLocalChanges();
  release.resolve();
  await Promise.all([first, second]);
  const saved = await decryptPayload(rawKey, remote.record.payload);
  assert.equal(calls, 2);
  assert.deepEqual(saved.videos.map((video) => video.id), ['v1', 'v2']);
  assert.equal(saved.videos[0].title, '最新タイトル');
  assert.deepEqual(saved.videoMeta.v1, { folderId: 'folder-2', watchStatus: 'watching' });
  assert.deepEqual(saved.items, [{ id: 'manga-1' }]);
});

test('cross-tab saves use Web Locks when available and keep revision CAS valid', async () => {
  const locks = lockManager(); const local = makeStorage(); const sessionA = makeStorage(); const sessionB = makeStorage();
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const remote = { record: { payload: await encryptPayload(rawKey, { videos: [] }), revision: 1, updated_at: 'before' } };
  const payload = { videos: [{ id: 'v1', url: 'https://example.test/1', title: '同じ最新状態' }] };
  const a = await fixture({ initialPayload: payload, rawKey, remote, localStorage: local, sessionStorage: sessionA, locks });
  const b = await fixture({ initialPayload: payload, rawKey, remote, localStorage: local, sessionStorage: sessionB, locks });
  await Promise.all([a.vault.saveLocalChanges(), b.vault.saveLocalChanges()]);
  assert.equal(remote.record.revision, 3);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), payload);
  assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].pendingSync, false);
});

test('a waiting tab snapshots localStorage only after it acquires the shared lock', async () => {
  const locks = lockManager(); const local = makeStorage(); const sessionA = makeStorage(); const sessionB = makeStorage();
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const remote = { record: { payload: await encryptPayload(rawKey, { videos: [] }), revision: 1, updated_at: 'before' } };
  const started = deferred(); const release = deferred(); let calls = 0;
  const rpc = async (body, state) => {
    calls++;
    if (calls === 1) { started.resolve(); await release.promise; }
    if (body.expected_revision !== state.record.revision) return [];
    state.record = { payload: body.new_payload, revision: state.record.revision + 1, updated_at: 'locked-' + calls };
    return [{ revision: state.record.revision, updated_at: state.record.updated_at }];
  };
  const a = await fixture({ initialPayload: { videos: [{ id: 'v1', title: '先行保存' }] }, rawKey, remote, localStorage: local, sessionStorage: sessionA, locks, rpc });
  const b = await fixture({ initialPayload: { videos: [{ id: 'v1', title: '先行保存' }] }, rawKey, remote, localStorage: local, sessionStorage: sessionB, locks, rpc });
  const first = a.vault.saveLocalChanges();
  await started.promise;
  const second = b.vault.saveLocalChanges();
  await Promise.resolve();
  const latest = { videos: [{ id: 'v1', url: 'https://example.test/1', title: 'ロック待ち後の最新' }, { id: 'v2', url: 'https://example.test/2', title: '追加' }] };
  local.setItem('testPayload', JSON.stringify(latest));
  release.resolve();
  await Promise.all([first, second]);
  assert.equal(calls, 2);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), latest);
});

test('same-property edits from two devices are reported as a conflict and retained', async () => {
  const base = { videos: [{ id: 'v1', url: 'https://example.test/base', title: '基準' }] };
  const localPayload = { videos: [{ id: 'v1', url: 'https://example.test/base', title: '端末側' }] };
  const externalPayload = { videos: [{ id: 'v1', url: 'https://example.test/base', title: '別端末' }], study: { progress: { x: 4 } } };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const remote = { record: { payload: await encryptPayload(rawKey, base), revision: 1, updated_at: 'base' } };
  let calls = 0;
  const { vault, local } = await fixture({ initialPayload: base, rawKey, revision: 1, remote, rpc: async (body, state) => {
    calls++;
    if (calls === 1 || body.expected_revision !== state.record.revision) return [];
    state.record = { payload: body.new_payload, revision: state.record.revision + 1, updated_at: 'local-wins' };
    return [{ revision: state.record.revision, updated_at: state.record.updated_at }];
  } });
  local.setItem('testPayload', JSON.stringify(localPayload));
  remote.record = { payload: await encryptPayload(rawKey, externalPayload), revision: 2, updated_at: 'remote' };
  await assert.rejects(vault.saveLocalChanges(), error => {
    assert.match(error.message, /同じデータが別の端末で変更されています/);
    assert.equal(error.conflicts[0].path, 'videos.v1.title');
    return true;
  });
  assert.equal(calls, 0);
  assert.deepEqual(JSON.parse(local.getItem('testPayload')), localPayload);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), externalPayload);
  assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].pendingSync, true);
});

test('a deletion and edit from two devices are reported as a conflict and retained', async () => {
  const original = { videos: [{ id: 'v1', url: 'https://example.test/old.mp4', title: '旧題' }], videoMeta: {}, items: [{ id: 'manga-1' }] };
  const localDeletion = { videos: [], videoMeta: {}, items: [{ id: 'manga-1' }] };
  const external = { videos: [{ id: 'v1', url: 'https://example.test/old.mp4', title: '別端末で更新' }], videoMeta: {}, items: [{ id: 'manga-1' }] };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const remote = { record: { payload: await encryptPayload(rawKey, original), revision: 1, updated_at: 'before' } };
  let calls = 0;
  const { vault, local } = await fixture({ initialPayload: original, rawKey, revision: 1, remote, rpc: async (body, state) => {
    calls++;
    if (body.expected_revision !== state.record.revision) return [];
    state.record = { payload: body.new_payload, revision: state.record.revision + 1, updated_at: 'merged-delete' };
    return [{ revision: state.record.revision, updated_at: state.record.updated_at }];
  } });
  remote.record = { payload: await encryptPayload(rawKey, external), revision: 2, updated_at: 'external-edit' };
  local.setItem('testPayload', JSON.stringify(localDeletion));
  await assert.rejects(vault.saveLocalChanges(), error => {
    assert.match(error.message, /同じデータが別の端末で変更されています/);
    assert.equal(error.conflicts[0].type, 'delete-edit');
    return true;
  });
  assert.equal(calls, 0);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), external);
  assert.deepEqual(JSON.parse(local.getItem('testPayload')), localDeletion);
});

test('a non-conflicting local deletion merges after re-reading the latest revision', async () => {
  const original = { videos: [{ id: 'v1', url: 'https://example.test/old.mp4', title: '旧題' }], videoMeta: {}, items: [{ id: 'manga-1' }] };
  const localDeletion = { videos: [], videoMeta: {}, items: [{ id: 'manga-1' }] };
  const external = { videos: [{ id: 'v2', url: 'https://example.test/newer.mp4', title: '別端末で追加' }], videoMeta: { v2: { favorite: true } }, items: [{ id: 'manga-1' }] };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const remote = { record: { payload: await encryptPayload(rawKey, original), revision: 1, updated_at: 'before' } };
  let calls = 0;
  const { vault, local } = await fixture({ initialPayload: original, rawKey, revision: 1, remote, rpc: async (body, state) => {
    calls++;
    if (calls === 1) { state.record = { payload: await encryptPayload(rawKey, external), revision: 2, updated_at: 'external-add' }; return []; }
    if (body.expected_revision !== state.record.revision) return [];
    state.record = { payload: body.new_payload, revision: state.record.revision + 1, updated_at: 'merged-delete' };
    return [{ revision: state.record.revision, updated_at: state.record.updated_at }];
  } });
  local.setItem('testPayload', JSON.stringify(localDeletion));
  await vault.saveLocalChanges();
  assert.equal(calls, 2);
  const expected = { videos: external.videos, videoMeta: external.videoMeta, items: localDeletion.items };
  assert.deepEqual(JSON.parse(local.getItem('testPayload')), expected);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), expected);
});

test('a missing Vault row is not recreated after a failed revision update', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const remote = { record: { payload: await encryptPayload(rawKey, { remote: true }), revision: 2, updated_at: 'remote' } };
  const { vault, local } = await fixture({
    initialPayload: { local: true }, rawKey, revision: 1, remote,
    rpc: async (_body, state) => { state.record = null; return []; },
  });
  await assert.rejects(vault.saveLocalChanges(), /クラウド保管庫が見つからないため同期を停止しました/);
  assert.equal(remote.record, null);
  assert.deepEqual(JSON.parse(local.getItem('testPayload')), { local: true });
  assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].pendingSync, true);
});

test('a locked Vault leaves a pending marker instead of reporting a cloud save', async () => {
  const { vault, local } = await fixture({ initialPayload: { videos: [{ id: 'v1' }] } });
  vault.lockVault();
  await assert.rejects(vault.saveLocalChanges(), /保管庫がロックされています/);
  assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].pendingSync, true);
});

test('failed saves retain a retry marker and a later explicit sync stores the latest data', async () => {
  let fail = true;
  const localPayload = { videos: [{ id: 'v1', url: 'https://example.test/1', title: '保持された変更' }] };
  const { vault, local, remote, rawKey } = await fixture({
    initialPayload: localPayload,
    rpc: async (body, state) => {
      if (fail) throw new Error('offline');
      if (body.expected_revision !== state.record.revision) return [];
      state.record = { payload: body.new_payload, revision: state.record.revision + 1, updated_at: 'retry' };
      return [{ revision: state.record.revision, updated_at: 'retry' }];
    },
  });
  await assert.rejects(vault.saveLocalChanges(), /offline/);
  assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].pendingSync, true);
  local.setItem('testPayload', JSON.stringify({ videos: [{ id: 'v1', url: 'https://example.test/1', title: '再試行時の最新' }] }));
  fail = false;
  await vault.saveLocalChanges();
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), { videos: [{ id: 'v1', url: 'https://example.test/1', title: '再試行時の最新' }] });
  assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].pendingSync, false);
});

test('explicit payload saves remain explicit while checking local state before applying a merge', async () => {
  let buildCount = 0;
  const { vault, context, remote, rawKey } = await fixture({ initialPayload: { local: 'local' } });
  context.window.MangaVaultPayload.buildFromLocalStorage = () => { buildCount++; return { local: 'wrong' }; };
  const explicit = { savedItems: [{ id: 'explicit-item' }], study: { progress: { lesson: 9 } } };
  await vault.savePayload(explicit);
  assert.equal(buildCount, 1);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), explicit);
});

test('VPN access loss during an in-flight CAS leaves the local sync marker for a safe retry', async () => {
  let allowed = true; const started = deferred(); const release = deferred();
  const gate = { canReadProtectedData: () => allowed };
  const payload = { videos: [{ id: 'v1', url: 'https://example.test/1', title: 'タイトル' }] };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const { vault, local, remote } = await fixture({
    initialPayload: payload, rawKey, gate,
    rpc: async (body, state) => {
      started.resolve(); await release.promise;
      if (body.expected_revision !== state.record.revision) return [];
      state.record = { payload: body.new_payload, revision: state.record.revision + 1, updated_at: 'vpn-race' };
      return [{ revision: state.record.revision, updated_at: 'vpn-race' }];
    },
  });
  const saving = vault.saveLocalChanges();
  await started.promise;
  allowed = false;
  release.resolve();
  await assert.rejects(saving, /VPN接続を確認できるまで/);
  assert.equal(remote.record.revision, 2);
  assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].pendingSync, true);
  allowed = true;
  await vault.saveLocalChanges();
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), payload);
  assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].pendingSync, false);
});

test('unlock restores existing data with either passphrase or recovery code without changing video records', async () => {
  const saved = {
    videos: [{ id: 'v-1', url: 'https://example.test/movie.mp4', title: '保存済み動画', a: 'legacy', b: '42' }],
    videoMeta: { 'v-1': { folderId: 'folder-1', tags: ['法律'], watchStatus: 'watching', thumbnailTimeSeconds: 12 } },
    videoFolders: [{ id: 'folder-1', name: '資料' }],
    items: [{ id: 'manga-1', title: '漫画' }],
    study: { progress: { civil: 3 } },
  };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode('valid passphrase 123'), 'PBKDF2', false, ['deriveKey']);
  const passKey = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const recoveryBytes = webcrypto.getRandomValues(new Uint8Array(32));
  const recoveryKey = await webcrypto.subtle.importKey('raw', recoveryBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const keyWraps = {
    passphrase: { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: b64url(salt) }, encryptedKey: await encrypt(passKey, rawKey) },
    recovery: { encryptedKey: await encrypt(recoveryKey, rawKey) },
  };
  const record = { payload: await encryptPayload(rawKey, saved, keyWraps), revision: 7, updated_at: 'saved' };
  for (const credential of ['valid passphrase 123', 'mrk1_' + b64url(recoveryBytes)]) {
    const remote = { record: structuredClone(record) };
    const { vault, local } = await fixture({ rawKey, revision: 7, remote });
    let restored;
    const result = await vault.initialize(credential.startsWith('mrk1_') ? '' : credential, credential.startsWith('mrk1_') ? credential : '', (payload) => { restored = payload; }, () => { throw new Error('existing vault must not create defaults'); });
    assert.equal(result.created, false);
    assert.deepEqual(restored, saved);
    assert.deepEqual(JSON.parse(local.getItem('testPayload')), {});
    assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].revision, 7);
  }
});


test('unlock retries a pending local deletion against the latest cloud revision', async () => {
  const saved = { videos: [{ id: 'v-1', url: 'https://example.test/old.mp4', title: 'クラウド旧版' }], videoMeta: {}, items: [{ id: 'm1' }], study: { progress: { x: 2 } } };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode('valid passphrase 123'), 'PBKDF2', false, ['deriveKey']);
  const passKey = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const keyWraps = { passphrase: { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: b64url(salt) }, encryptedKey: await encrypt(passKey, rawKey) } };
  const remote = { record: { payload: await encryptPayload(rawKey, saved, keyWraps), revision: 7, updated_at: 'newer-cloud' } };
  let calls = 0;
  const { vault, local } = await fixture({ rawKey, revision: 6, remote, rpc: async (body, state) => {
    calls++;
    if (body.expected_revision !== state.record.revision) return [];
    state.record = { payload: body.new_payload, revision: state.record.revision + 1, updated_at: 'pending-delete-synced' };
    return [{ revision: state.record.revision, updated_at: state.record.updated_at }];
  } });
  const deleted = { videos: [], videoMeta: {}, items: [{ id: 'm1' }], study: { progress: { x: 2 } } };
  local.setItem('testPayload', JSON.stringify(deleted));
  const existingMeta = JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'));
  local.setItem('mangaReaderSupabaseSyncMeta', JSON.stringify({ 'user-1': { ...existingMeta['user-1'], revision: 6, updatedAt: 'before', pendingSync: true } }));
  let applied = false;
  const result = await vault.initialize('valid passphrase 123', '', () => { applied = true; }, () => ({}));
  assert.equal(applied, false);
  assert.equal(result.pendingSync, false);
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(local.getItem('testPayload')), deleted);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), deleted);
});

test('passkey unlock restores the same cloud payload and video metadata', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const prfOutput = webcrypto.getRandomValues(new Uint8Array(32));
  const credentialId = new Uint8Array([2, 4, 6, 8]);
  const salt = webcrypto.getRandomValues(new Uint8Array(32));
  const digest = await webcrypto.subtle.digest('SHA-256', prfOutput);
  const passkeyKey = await webcrypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const saved = { videos: [{ id: 'v-passkey', url: 'https://example.test/key.mp4', title: 'パスキー動画' }], videoMeta: { 'v-passkey': { memo: 'passkey metadata', folderId: 'f1' } }, items: [{ id: 'm1' }] };
  const keyWraps = { passkeys: [{ id: b64url(credentialId), salt: b64url(salt), encryptedKey: await encrypt(passkeyKey, rawKey) }] };
  const remote = { record: { payload: await encryptPayload(rawKey, saved, keyWraps), revision: 4, updated_at: 'passkey' } };
  const { vault } = await fixture({
    rawKey, revision: 4, remote, passkeySupported: true,
    credentials: { create: async () => null, get: async () => ({ rawId: credentialId.buffer, getClientExtensionResults: () => ({ prf: { results: { first: prfOutput } } }) }) },
  });
  let restored;
  const result = await vault.initializeWithPasskey((payload) => { restored = payload; });
  assert.equal(result.created, false);
  assert.deepEqual(restored, saved);
});

test('new Vault creation builds and applies the existing local payload exactly once', async () => {
  const localPayload = {
    videos: [{ id: 'v-new', url: 'https://example.test/new.mp4', title: '端末の動画' }],
    videoMeta: { 'v-new': { memo: '保持するメタデータ' } }, items: [{ id: 'item-1' }],
  };
  const remote = { record: null };
  const { vault, rawKey } = await fixture({ initialPayload: localPayload, revision: 0, remote });
  let builds = 0; let applied;
  await vault.initialize('valid passphrase 123', '', (payload) => { applied = payload; }, () => { builds++; return localPayload; });
  assert.equal(builds, 1);
  assert.deepEqual(applied, localPayload);
  assert.deepEqual(await decryptPayload(vault.loadActive().rawKey, remote.record.payload), localPayload);
});

test('unlock page reports pending sync and offers local data access', () => {
  assert.match(syncPage, /function showPendingSync\(result\)/);
  assert.match(syncPage, /端末には未同期の変更があります。/);
  assert.match(syncPage, /端末データを開く/);
  assert.match(syncPage, /result\.pendingSync/);
});

test('a failed follow-up save keeps changes made during the earlier successful save pending', async () => {
  const firstStarted = deferred();
  const releaseFirst = deferred();
  let calls = 0;
  const newest = { local: 'newest edit' };
  const { vault, local, remote, rawKey } = await fixture({
    initialPayload: { local: 'first edit' },
    rpc: async (body, state) => {
      calls++;
      if (calls === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
        state.record = { payload: body.new_payload, revision: 2, updated_at: 'first success' };
        return [{ revision: 2, updated_at: 'first success' }];
      }
      throw new Error('temporary second save failure');
    },
  });
  const firstSave = vault.saveLocalChanges();
  await firstStarted.promise;
  local.setItem('testPayload', JSON.stringify(newest));
  const secondSave = vault.saveLocalChanges();
  releaseFirst.resolve();
  const results = await Promise.allSettled([firstSave, secondSave]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  const meta = JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'];
  assert.equal(meta.pendingSync, true);
  assert.deepEqual(JSON.parse(local.getItem('testPayload')), newest);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), { local: 'first edit' });
});

test('passkey registration refuses to replace a newer cloud payload with stale local data', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const prfOutput = webcrypto.getRandomValues(new Uint8Array(32));
  const credentialId = new Uint8Array([4, 3, 2, 1]);
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const passphrase = 'valid passphrase 123';
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const passphraseKey = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const keyWraps = { passphrase: { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: b64url(salt) }, encryptedKey: await encrypt(passphraseKey, rawKey) } };
  const cloudPayload = { items: [{ id: 'newer-cloud-item' }], videos: [{ id: 'cloud-video', title: 'Cloud title', url: 'https://example.test/cloud.mp4' }], study: { progress: 8 } };
  const localPayload = { items: [{ id: 'stale-local-item' }], videos: [{ id: 'cloud-video', title: 'Old title', url: 'https://example.test/cloud.mp4' }], study: { progress: 3 } };
  const { vault, local, remote } = await fixture({
    initialPayload: localPayload, rawKey, revision: 1, passkeySupported: true,
    credentials: { create: async () => ({ rawId: credentialId.buffer, getClientExtensionResults: () => ({ prf: { results: { first: prfOutput } } }) }), get: async () => null },
  });
  remote.record = { payload: await encryptPayload(rawKey, cloudPayload, keyWraps), revision: 2, updated_at: 'newer cloud revision' };
  await assert.rejects(vault.registerPasskey(passphrase), /別の端末で保管庫が更新されています/);
  assert.equal(remote.record.revision, 2);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), cloudPayload);
  assert.deepEqual(JSON.parse(local.getItem('testPayload')), localPayload);
});

test('same data with different remote credential wrappers is not treated as a lost successful save', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const expectedPayload = { items: [{ id: 'same-data' }], study: { progress: 5 } };
  const remoteKeyWraps = { passkeys: [{ id: 'different-credential' }] };
  const { vault, local, remote } = await fixture({
    rawKey, initialPayload: expectedPayload, revision: 1,
    rpc: async (_body, state) => {
      state.record = {
        payload: await encryptPayload(rawKey, expectedPayload, remoteKeyWraps),
        revision: 2, updated_at: 'credential changed elsewhere',
      };
      return [];
    },
  });
  await assert.rejects(vault.savePayload(expectedPayload), /別の端末で保管庫の認証情報が更新されています/);
  assert.equal(remote.record.revision, 2);
  assert.deepEqual(remote.record.payload.keyWraps, remoteKeyWraps);
  assert.equal(JSON.parse(local.getItem('mangaReaderSupabaseSyncMeta'))['user-1'].pendingSync, true);
});
test('pending Vault sync blocks document unload but clears the warning after success', async () => {
  const { vault } = await fixture({ initialPayload: { videos: [{ id: 'pending' }] } });
  assert.equal(typeof vault.guardPendingSyncLeave, 'function');
  let prevented = false;
  const event = { preventDefault() { prevented = true; } };
  assert.equal(vault.guardPendingSyncLeave(event, false), false);
  assert.equal(prevented, false);
  vault.markLocalChangesPending();
  assert.equal(vault.guardPendingSyncLeave(event, false), true);
  assert.equal(prevented, true);
  assert.equal(event.returnValue, '');
  assert.equal(vault.guardPendingSyncLeave(event, true), true);
  await vault.saveLocalChanges();
  assert.equal(vault.guardPendingSyncLeave(event, false), false);
});

test('guest local edits never count as pending cloud sync for the leave guard', async () => {
  const { vault, context } = await fixture({ initialPayload: { videos: [{ id: 'guest-local' }] } });
  vault.markLocalChangesPending();
  context.window.TestCodeGuest = { isActive: () => true };
  let prevented = false;
  assert.equal(vault.hasPendingLocalChanges(), false);
  assert.equal(vault.guardPendingSyncLeave({ preventDefault() { prevented = true; } }, false), false);
  assert.equal(prevented, false);
});
