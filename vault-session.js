/* Shared encrypted-vault session for the manga reader.
   The vault key is kept only in sessionStorage so automatic sync works while
   this browser tab is open. Same-origin testCode tabs can hand the active key
   to each other through BroadcastChannel; the passphrase is never stored. */
(() => {
  'use strict';
  const SESSION_KEY = 'mangaReaderSupabaseSession';
  const META_KEY = 'mangaReaderSupabaseSyncMeta';
  const ACTIVE_KEY = 'mangaReaderActiveVault';
  const CHANNEL_NAME = 'mangaReaderVaultSession';
  const VERSION = 1;
  const ITERATIONS = 600000;
  const config = window.MANGA_READER_SUPABASE || {};

  const b64url = (bytes) => { let text = ''; bytes.forEach((byte) => { text += String.fromCharCode(byte); }); return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); };
  const fromB64url = (value) => { const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(normalized + '==='.slice((normalized.length + 3) % 4)); return Uint8Array.from(raw, (char) => char.charCodeAt(0)); };
  const randomBytes = (length) => { const bytes = new Uint8Array(length); crypto.getRandomValues(bytes); return bytes; };
  const toArrayBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  function passkeyRpId() {
    const host = String(location.hostname || '').toLowerCase();
    const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');
    const isLocalhost = host === 'localhost' || host.endsWith('.localhost');
    if (isIpAddress || (!isLocalhost && location.protocol !== 'https:')) throw new Error('Passkeyを使うには、localhostまたはHTTPSのドメインで開いてください。127.0.0.1では登録できません。');
    return host;
  }
  const importAes = (raw) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  async function derivePassphrase(passphrase, salt) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(key, bytes) { const iv = randomBytes(12); const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes); return { iv: b64url(iv), ciphertext: b64url(new Uint8Array(ciphertext)) }; }
  async function decrypt(key, encrypted) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(encrypted.iv) }, key, fromB64url(encrypted.ciphertext))); }
  async function passkeyKey(output) { return importAes(new Uint8Array(await crypto.subtle.digest('SHA-256', output))); }
  function passkeySupported() { return Boolean(window.PublicKeyCredential && navigator.credentials && typeof navigator.credentials.create === 'function' && typeof navigator.credentials.get === 'function'); }
  async function registerPasskeyCredential(user) {
    if (!passkeySupported()) throw new Error('このブラウザはパスキーに対応していません。');
    const rpId = passkeyRpId();
    const salt = randomBytes(32);
    const credential = await navigator.credentials.create({ publicKey: {
      challenge: toArrayBuffer(randomBytes(32)),
      rp: { name: '漫画リーダー', id: rpId },
      user: { id: toArrayBuffer(new TextEncoder().encode(user.id)), name: user.email, displayName: user.email },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      timeout: 60000,
      extensions: { prf: { eval: { first: toArrayBuffer(salt) } } }
    }});
    const result = credential && credential.getClientExtensionResults && credential.getClientExtensionResults();
    const first = result && result.prf && result.prf.results && result.prf.results.first;
    let prfOutput = first;
    if (!prfOutput) {
      const fallback = await navigator.credentials.get({ publicKey: { challenge: toArrayBuffer(randomBytes(32)), rpId, allowCredentials: [{ type: 'public-key', id: credential.rawId }], userVerification: 'required', timeout: 60000, extensions: { prf: { evalByCredential: { [b64url(new Uint8Array(credential.rawId))]: { first: toArrayBuffer(salt) } } } } } });
      const fallbackResult = fallback && fallback.getClientExtensionResults && fallback.getClientExtensionResults();
      prfOutput = fallbackResult && fallbackResult.prf && fallbackResult.prf.results && fallbackResult.prf.results.first;
    }
    if (!prfOutput) throw new Error('このパスキーまたはブラウザは保管庫解除用PRFに対応していません。');
    const key = await passkeyKey(new Uint8Array(prfOutput));
    return { id: b64url(new Uint8Array(credential.rawId)), salt: b64url(salt), encryptedKey: await encrypt(key, loadActive().rawKey) };
  }
  async function unlockByPasskey(wrappers, signal) {
    if (!passkeySupported()) throw new Error('このブラウザはパスキーに対応していません。');
    const rpId = passkeyRpId();
    const entries = Array.isArray(wrappers) ? wrappers : [wrappers];
    const allowCredentials = entries.map((entry) => ({ type: 'public-key', id: toArrayBuffer(fromB64url(entry.id)) }));
    const evalByCredential = {};
    entries.forEach((entry) => { evalByCredential[entry.id] = { first: toArrayBuffer(fromB64url(entry.salt)) }; });
    const credential = await navigator.credentials.get({ publicKey: {
      challenge: toArrayBuffer(randomBytes(32)), rpId, allowCredentials, userVerification: 'required', timeout: 60000,
      extensions: { prf: { evalByCredential } }
    }, signal });
    const result = credential && credential.getClientExtensionResults && credential.getClientExtensionResults();
    const first = result && result.prf && result.prf.results && result.prf.results.first;
    if (!first) throw new Error('パスキーから保管庫解除情報を取得できませんでした。');
    const selectedId = b64url(new Uint8Array(credential.rawId));
    const selected = entries.find((entry) => entry.id === selectedId);
    if (!selected) throw new Error('登録済みパスキーを特定できませんでした。');
    return new Uint8Array(await decrypt(await passkeyKey(new Uint8Array(first)), selected.encryptedKey));
  }
  function readJSON(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key) || ''); return value == null ? fallback : value; } catch (_) { return fallback; } }
  function loadSession() { return readJSON(SESSION_KEY, null); }
  function saveSession(session) { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); }
  function serializeVault(vault) { return vault && vault.rawKey && vault.keyWraps ? { rawKey: b64url(vault.rawKey), keyWraps: vault.keyWraps } : null; }
  function restoreVault(saved) { try { if (!saved || !saved.rawKey || !saved.keyWraps) return null; const rawKey = fromB64url(saved.rawKey); return rawKey.length === 32 ? { rawKey, keyWraps: saved.keyWraps } : null; } catch (_) { return null; } }
  function loadActive() { try { return restoreVault(JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || 'null')); } catch (_) { return null; } }
  let vaultChannel = null;
  function channelPost(message) { try { if (vaultChannel) vaultChannel.postMessage(message); } catch (_) {} }
  function saveActive(vault) { const saved = serializeVault(vault); sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(saved)); channelPost({ type: 'vault-response', vault: saved }); }
  function clearActive() { sessionStorage.removeItem(ACTIVE_KEY); channelPost({ type: 'vault-cleared' }); }
  function lockVault() { clearActive(); }
  function setupVaultChannel() {
    if (typeof BroadcastChannel !== 'function') return;
    try {
      vaultChannel = new BroadcastChannel(CHANNEL_NAME);
      vaultChannel.addEventListener('message', (event) => {
        const message = event && event.data;
        if (!message || typeof message !== 'object') return;
        if (message.type === 'vault-request') {
          const active = loadActive();
          if (active) channelPost({ type: 'vault-response', vault: serializeVault(active) });
          return;
        }
        if (message.type === 'vault-response' && !loadActive()) {
          const vault = restoreVault(message.vault);
          if (vault) {
            sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(serializeVault(vault)));
            window.dispatchEvent(new CustomEvent('manga-vault-active'));
          }
          return;
        }
        if (message.type === 'vault-cleared') {
          sessionStorage.removeItem(ACTIVE_KEY);
          window.dispatchEvent(new CustomEvent('manga-vault-cleared'));
        }
      });
      if (!loadActive()) channelPost({ type: 'vault-request' });
    } catch (_) { vaultChannel = null; }
  }
  setupVaultChannel();
  async function waitForActive(timeoutMs = 2500) {
    const existing = loadActive();
    if (existing) return existing;
    if (!vaultChannel) setupVaultChannel();
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      let interval = null;
      const cleanup = () => {
        if (timer !== null) clearTimeout(timer);
        if (interval !== null) clearInterval(interval);
        window.removeEventListener('manga-vault-active', onActive);
      };
      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value || null);
      };
      const check = () => {
        const active = loadActive();
        if (active) { finish(active); return true; }
        return false;
      };
      const request = () => {
        if (!check()) channelPost({ type: 'vault-request' });
      };
      const onActive = () => { check(); };
      window.addEventListener('manga-vault-active', onActive);
      request();
      interval = setInterval(request, 200);
      timer = setTimeout(() => finish(loadActive()), Math.max(0, Number(timeoutMs) || 2500));
    });
  }
  function getMeta(userId) { return readJSON(META_KEY, {})[userId] || null; }
  function setMeta(userId, value) { const meta = readJSON(META_KEY, {}); meta[userId] = value ? Object.assign({}, value, { pendingSync: false }) : null; localStorage.setItem(META_KEY, JSON.stringify(meta)); }
  function markPendingSync(userId) {
    if (!userId) return false;
    const previous = getMeta(userId) || {};
    try { const meta = readJSON(META_KEY, {}); meta[userId] = Object.assign({}, previous, { pendingSync: true }); localStorage.setItem(META_KEY, JSON.stringify(meta)); return true; }
    catch (_) { return false; }
  }
  function markLocalChangesPending() {
    const session = loadSession();
    return markPendingSync(session && session.user && session.user.id);
  }
  function stableJson(value) {
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  let saveQueue = Promise.resolve();
  function enqueueSave(work) {
    const pending = saveQueue.catch(() => {}).then(work);
    saveQueue = pending.catch(() => {});
    return pending;
  }
  function assertSyncAccess() {
    const access = window.MangaReaderMediaAccess;
    if (access && typeof access.canReadProtectedData === 'function' && access.canReadProtectedData() !== true) {
      throw new Error('VPN接続を確認できるまでクラウド同期を停止しています。');
    }
  }
  async function withVaultSaveLock(userId, work) {
    const locks = typeof navigator !== 'undefined' && navigator.locks;
    if (locks && typeof locks.request === 'function') return locks.request('manga-reader-vault-save:' + userId, { mode: 'exclusive' }, work);
    return work();
  }
  async function retryPendingLocalChanges(result) {
    if (!result || !result.retryPending) return result;
    const next = Object.assign({}, result);
    delete next.retryPending;
    try { await saveLocalChanges(); next.pendingSync = false; }
    catch (error) { next.pendingSync = true; next.syncError = error && error.message ? error.message : '同期に失敗しました。'; }
    return next;
  }
  let lastOnlineRetryAt = 0;
  if (typeof window.addEventListener === 'function') window.addEventListener('online', () => {
    const session = loadSession(); const userId = session && session.user && session.user.id; const meta = userId && getMeta(userId);
    const access = window.MangaReaderMediaAccess;
    if (!loadActive() || !meta || !meta.pendingSync || (access && typeof access.canReadProtectedData === 'function' && access.canReadProtectedData() !== true)) return;
    if (Date.now() - lastOnlineRetryAt < 30000) return;
    lastOnlineRetryAt = Date.now();
    saveLocalChanges().catch(() => {});
  });
  function assertConfig() { if (!config.url || !config.publishableKey) throw new Error('Supabase の設定が見つかりません。'); }
  async function api(path, options = {}) {
    assertConfig();
    const headers = Object.assign({ apikey: config.publishableKey }, options.headers || {});
    if (options.token) headers.Authorization = 'Bearer ' + options.token;
    if (options.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(config.url + path, Object.assign({}, options, { headers }));
    if (!response.ok) { const detail = await response.text().catch(() => ''); const error = new Error('通信に失敗しました (' + response.status + ')' + (detail ? '。' + detail.slice(0, 140) : '')); error.status = response.status; throw error; }
    return response.status === 204 ? null : response.json();
  }
  async function refreshSession() { const current = loadSession(); if (!current || !current.refresh_token) throw new Error('ログインしてください。'); const next = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: current.refresh_token }) }); saveSession(next); return next; }
  function sessionIsFresh(session, skewSeconds = 60) {
    const expiresAt = Number(session && session.expires_at);
    return Boolean(session && session.access_token && Number.isFinite(expiresAt) && expiresAt > (Date.now() / 1000) + Math.max(0, Number(skewSeconds) || 0));
  }
  function isSessionAuthError(error) { return [400, 401, 403].includes(Number(error && error.status)); }
  async function ensureSession() {
    const current = loadSession();
    if (!current || !current.refresh_token) throw new Error('ログインしてください。');
    if (sessionIsFresh(current)) return current;
    return refreshSession();
  }
  async function withSession(work) {
    let session = await ensureSession();
    try { return await work(session.access_token, session.user); }
    catch (error) {
      if (Number(error && error.status) !== 401 && !String(error && error.message || '').includes('(401)')) throw error;
      session = await refreshSession();
      return work(session.access_token, session.user);
    }
  }
  async function fetchRecord(token, user) {
    let rows; let legacyRevision = false;
    try { rows = await api('/rest/v1/manga_reader_vaults?select=payload,revision,updated_at&user_id=eq.' + encodeURIComponent(user.id) + '&limit=2', { token }); }
    catch (error) { if (!String(error.message || '').includes('(400)')) throw error; rows = await api('/rest/v1/manga_reader_vaults?select=payload,updated_at&user_id=eq.' + encodeURIComponent(user.id) + '&limit=2', { token }); legacyRevision = true; }
    if (rows && rows.length > 1) throw new Error('このアカウントに複数の保管庫が存在します。安全のため処理を停止しました。');
    return rows && rows[0] ? Object.assign({}, rows[0], legacyRevision ? { legacyRevision: true, revision: 1 } : {}) : null;
  }
  async function fetchRecordForUi(token, user) { return fetchRecord(token, user); }
  async function create(passphrase) {
    if (!window.crypto || !crypto.subtle) throw new Error('このブラウザは暗号化機能に対応していません。');
    if ((passphrase || '').length < 12) throw new Error('保管庫パスフレーズは12文字以上にしてください。');
    const rawKey = randomBytes(32), recoveryBytes = randomBytes(32), salt = randomBytes(16);
    const passphraseKey = await derivePassphrase(passphrase, salt); const recoveryKey = await importAes(recoveryBytes);
    const vault = { rawKey, keyWraps: { passphrase: { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64url(salt) }, encryptedKey: await encrypt(passphraseKey, rawKey) }, recovery: { encryptedKey: await encrypt(recoveryKey, rawKey) } } };
    saveActive(vault); return { vault, recoveryCode: 'mrk1_' + b64url(recoveryBytes) };
  }
  async function unlock(envelope, passphrase, recoveryCode) {
    if (!envelope || envelope.type !== 'manga-reader-vault' || envelope.version !== VERSION || !envelope.keyWraps) throw new Error('保管庫の形式が正しくありません。');
    let rawKey;
    try {
      if ((recoveryCode || '').trim()) rawKey = await decrypt(await importAes(fromB64url(recoveryCode.trim().replace(/^mrk1_/, ''))), envelope.keyWraps.recovery.encryptedKey);
      else { if (!passphrase) throw new Error('パスフレーズまたは復旧キーを入力してください。'); const kdf = envelope.keyWraps.passphrase && envelope.keyWraps.passphrase.kdf; if (!kdf || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256') throw new Error('対応していない保管庫です。'); rawKey = await decrypt(await derivePassphrase(passphrase, fromB64url(kdf.salt)), envelope.keyWraps.passphrase.encryptedKey); }
      if (rawKey.length !== 32) throw new Error('保管庫の鍵が正しくありません。'); const key = await importAes(rawKey); JSON.parse(new TextDecoder().decode(await decrypt(key, envelope.data)));
    } catch (error) { if (rawKey) rawKey.fill(0); throw error.message ? error : new Error('パスフレーズ、復旧キー、または保管庫の内容を確認してください。'); }
    const vault = { rawKey, keyWraps: envelope.keyWraps }; saveActive(vault); return vault;
  }
  async function envelope(payload) { const vault = loadActive(); if (!vault) throw new Error('パスフレーズを入力して保管庫を開いてください。'); return { type: 'manga-reader-vault', version: VERSION, createdAt: new Date().toISOString(), algorithm: 'AES-256-GCM', keyWraps: vault.keyWraps, data: await encrypt(await importAes(vault.rawKey), new TextEncoder().encode(JSON.stringify(payload))) }; }
  async function decryptPayload(payload) { const vault = loadActive(); if (!vault) throw new Error('パスフレーズを入力して保管庫を開いてください。'); return JSON.parse(new TextDecoder().decode(await decrypt(await importAes(vault.rawKey), payload.data))); }
  async function persistPayload(token, user, payload) {
    assertSyncAccess();
    const existing = await fetchRecord(token, user);
    if (existing && existing.legacyRevision) throw new Error('Supabaseのrevision migrationが未適用です。supabase-schema.sqlをSQL Editorで実行してから保存してください。');
    const known = getMeta(user.id); const knownRevision = typeof known === 'object' ? known.revision : null;
    if (existing && knownRevision == null) throw new Error('保管庫の同期状態を確認できません。保管庫を再読込してから変更してください。');
    if (existing && !known) throw new Error('保管庫を読み込んでから変更してください。');
    if (existing) {
      const encrypted = await envelope(payload);
      assertSyncAccess();
      const rows = await api('/rest/v1/rpc/update_manga_reader_vault', { method: 'POST', token, body: JSON.stringify({ expected_revision: knownRevision, new_payload: encrypted }) });
      if (!rows || !rows.length) {
        // A lost response after a successful CAS is safe to recognize only when
        // the current encrypted record decrypts to this exact payload.
        const current = await fetchRecord(token, user);
        if (current && current.revision > knownRevision) {
          try {
            const remotePayload = await decryptPayload(current.payload);
            if (stableJson(remotePayload) === stableJson(payload)) { setMeta(user.id, { revision: current.revision, updatedAt: current.updated_at }); return current; }
          } catch (_) {}
        }
        throw new Error('別の端末で更新されています。端末の変更は保持されています。クラウドを再読込して競合を確認してください。');
      }
      setMeta(user.id, rows[0]); return Object.assign({}, existing, rows[0]);
    }
    assertSyncAccess();
    const rows = await api('/rest/v1/manga_reader_vaults', { method: 'POST', token, headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, payload: await envelope(payload), revision: 1 }) });
    const row = rows && rows[0];
    if (!row) throw new Error('クラウドへの保存結果を確認できませんでした。再読込して同期状態を確認してください。');
    setMeta(user.id, { revision: row.revision || 1, updatedAt: row.updated_at }); return row;
  }
  async function writePayload(payload) {
    assertSyncAccess();
    const session = loadSession(); const userId = session && session.user && session.user.id;
    if (!userId) throw new Error('ログインしてください。');
    return withVaultSaveLock(userId, () => withSession((token, user) => persistPayload(token, user, payload)));
  }
  async function savePayload(payload) {
    let snapshot;
    try { snapshot = JSON.parse(JSON.stringify(payload)); }
    catch (_) { throw new Error('保管庫に保存するデータを読み取れませんでした。'); }
    markLocalChangesPending();
    return enqueueSave(() => writePayload(snapshot));
  }
  async function saveLocalChanges() {
    assertSyncAccess();
    markLocalChangesPending();
    return enqueueSave(() => {
      assertSyncAccess();
      if (!loadActive()) throw new Error('保管庫がロックされています。端末には保存済みです。保管庫を開いて同期してください。');
      if (!window.MangaVaultPayload || typeof window.MangaVaultPayload.buildFromLocalStorage !== 'function') throw new Error('端末の同期データを読み取れません。');
      return writePayload(window.MangaVaultPayload.buildFromLocalStorage());
    });
  }
  async function restoreExistingRecord(record, user, applyPayload, unlockRecord) {
    const known = getMeta(user.id);
    const pendingSync = Boolean(known && known.pendingSync);
    await unlockRecord();
    const payload = await decryptPayload(record.payload);
    if (pendingSync) {
      const revisionMatches = known && Number(known.revision) === Number(record.revision);
      return { created: false, pendingSync: true, retryPending: Boolean(revisionMatches) };
    }
    await applyPayload(payload);
    setMeta(user.id, { revision: record.revision || 1, updatedAt: record.updated_at });
    return { created: false };
  }
  async function initialize(passphrase, recoveryCode, applyPayload, createPayload) {
    if (typeof applyPayload !== 'function' || typeof createPayload !== 'function') throw new TypeError('保管庫初期化にはapplyPayloadとcreatePayloadが必要です。');
    const result = await withSession(async (token, user) => {
      const record = await fetchRecord(token, user);
      if (!record) {
        const created = await create(passphrase);
        const initialPayload = createPayload();
        await applyPayload(initialPayload);
        markPendingSync(user.id);
        const rows = await withVaultSaveLock(user.id, async () => {
          const latest = await fetchRecord(token, user);
          if (latest) throw new Error('別の端末またはタブで保管庫が作成されました。端末データは保持されています。再読込して保管庫を開いてください。');
          assertSyncAccess();
          return api('/rest/v1/manga_reader_vaults', { method: 'POST', token, headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, payload: await envelope(initialPayload), revision: 1 }) });
        });
        const row = rows && rows[0];
        if (!row) throw new Error('クラウドへの保存結果を確認できませんでした。端末データは保持されています。再読込して同期状態を確認してください。');
        setMeta(user.id, { revision: row.revision || 1, updatedAt: row.updated_at });
        return { created: true, recoveryCode: created.recoveryCode };
      }
      return restoreExistingRecord(record, user, applyPayload, () => unlock(record.payload, passphrase, recoveryCode));
    });
    return retryPendingLocalChanges(result);
  }
  async function registerPasskey(passphrase) {
    return withSession(async (token, user) => {
      const record = await fetchRecord(token, user); if (!record) throw new Error('先にパスフレーズで保管庫を作成してください。'); await unlock(record.payload, passphrase, ''); setMeta(user.id, { revision: record.revision || 1, updatedAt: record.updated_at });
      const wrapper = await registerPasskeyCredential(user); const vault = loadActive(); const existing = Array.isArray(vault.keyWraps.passkeys) ? vault.keyWraps.passkeys : (vault.keyWraps.passkey ? [vault.keyWraps.passkey] : []);
      if (existing.some((entry) => entry.id === wrapper.id)) throw new Error('このパスキーは既に登録されています。'); vault.keyWraps.passkeys = existing.concat(wrapper); delete vault.keyWraps.passkey; saveActive(vault); const payload = await decryptPayload(record.payload); await savePayload(payload); return true;
    });
  }
  async function removePasskeys(passphrase) {
    return withSession(async (token, user) => {
      const record = await fetchRecord(token, user); if (!record) throw new Error('保管庫が見つかりません。');
      const previous = loadActive(); await unlock(record.payload, passphrase, '');
      const vault = loadActive(); const existing = Array.isArray(vault.keyWraps.passkeys) ? vault.keyWraps.passkeys : (vault.keyWraps.passkey ? [vault.keyWraps.passkey] : []);
      if (!existing.length) throw new Error('解除できるパスキーが登録されていません。');
      const nextKeyWraps = Object.assign({}, vault.keyWraps); delete nextKeyWraps.passkeys; delete nextKeyWraps.passkey;
      saveActive({ rawKey: vault.rawKey, keyWraps: nextKeyWraps });
      try { const payload = await decryptPayload(record.payload); await savePayload(payload); return true; }
      catch (error) { if (previous) saveActive(previous); throw error; }
    });
  }
  async function changePassphrase(nextPassphrase) {
    return withSession(async (token, user) => {
      if (!nextPassphrase || nextPassphrase.length < 12) throw new Error('新しいパスフレーズは12文字以上にしてください。');
      const record = await fetchRecord(token, user); if (!record) throw new Error('保管庫が見つかりません。');
      const previous = loadActive(); if (!previous) throw new Error('先に保管庫を開いてください。');
      const keyWraps = record.payload && record.payload.keyWraps;
      const passkeys = keyWraps && (Array.isArray(keyWraps.passkeys) ? keyWraps.passkeys : (keyWraps.passkey ? [keyWraps.passkey] : []));
      if (!passkeys || !passkeys.length) throw new Error('パスフレーズを再設定するには、保管庫パスキーが必要です。');
      const rawKey = await unlockByPasskey(passkeys);
      if (rawKey.length !== previous.rawKey.length || rawKey.some((byte, index) => byte !== previous.rawKey[index])) throw new Error('パスキーが現在開いている保管庫と一致しません。保管庫を再読込してください。');
      const payload = JSON.parse(new TextDecoder().decode(await decrypt(await importAes(rawKey), record.payload.data)));
      const salt = randomBytes(16); const passphraseKey = await derivePassphrase(nextPassphrase, salt);
      const nextKeyWraps = Object.assign({}, keyWraps, { passphrase: { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64url(salt) }, encryptedKey: await encrypt(passphraseKey, rawKey) } });
      saveActive({ rawKey, keyWraps: nextKeyWraps });
      try { await savePayload(payload); return true; }
      catch (error) { if (previous) saveActive(previous); throw error; }
    });
  }
  async function initializeWithPasskey(applyPayload, options = {}) {
    const result = await withSession(async (token, user) => {
      const record = await fetchRecord(token, user);
      const keyWraps = record && record.payload && record.payload.keyWraps;
      const passkeys = keyWraps && (Array.isArray(keyWraps.passkeys) ? keyWraps.passkeys : (keyWraps.passkey ? [keyWraps.passkey] : []));
      if (!passkeys || !passkeys.length) throw new Error('このアカウントには保管庫パスキーが登録されていません。');
      const rawKey = await unlockByPasskey(passkeys, options.signal);
      saveActive({ rawKey, keyWraps: record.payload.keyWraps });
      return restoreExistingRecord(record, user, applyPayload, async () => {});
    });
    return retryPendingLocalChanges(result);
  }
  window.MangaVault = { SESSION_KEY, META_KEY, ACTIVE_KEY, loadSession, saveSession, clearActive, lockVault, loadActive, waitForActive, refreshSession, ensureSession, sessionIsFresh, isSessionAuthError, api, withSession, fetchRecordForUi, initialize, initializeWithPasskey, registerPasskey, removePasskeys, changePassphrase, savePayload, saveLocalChanges, markLocalChangesPending };
})();
