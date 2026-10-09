import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');
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
      MangaVaultPayload: { buildFromLocalStorage: () => JSON.parse(local.getItem('testPayload') || '{}') },
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
  return { vault: context.window.MangaVault, local, session, remote: sharedRemote, rawKey, context };
}

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

test('revision conflict preserves the local edit and never replaces a different remote update', async () => {
  const localPayload = { videos: [{ id: 'v1', url: 'https://example.test/local', title: '端末側' }] };
  const externalPayload = { videos: [{ id: 'v1', url: 'https://example.test/remote', title: '別端末' }], study: { progress: { x: 4 } } };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const remote = { record: { payload: await encryptPayload(rawKey, externalPayload), revision: 2, updated_at: 'remote' } };
  const { vault, local } = await fixture({ initialPayload: localPayload, rawKey, revision: 1, remote, rpc: async () => [] });
  await assert.rejects(vault.saveLocalChanges(), /別の端末で更新されています/);
  assert.deepEqual(JSON.parse(local.getItem('testPayload')), localPayload);
  assert.deepEqual(await decryptPayload(rawKey, remote.record.payload), externalPayload);
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

test('explicit payload saves remain explicit and do not rebuild from localStorage', async () => {
  let buildCount = 0;
  const { vault, context, remote, rawKey } = await fixture({ initialPayload: { local: 'local' } });
  context.window.MangaVaultPayload.buildFromLocalStorage = () => { buildCount++; return { local: 'wrong' }; };
  const explicit = { savedItems: [{ id: 'explicit-item' }], study: { progress: { lesson: 9 } } };
  await vault.savePayload(explicit);
  assert.equal(buildCount, 0);
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
