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
  const SYNC_PROTOCOL_VERSION = 4;
  const LEGACY_SYNC_PROTOCOL_VERSION = 3;
  let pendingConflictChoices = null;
  let vaultHistoryRestorePreview = null;
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
  function saveSession(session) {
    const previous = loadSession();
    const previousUser = previous && previous.user && previous.user.id;
    const nextUser = session && session.user && session.user.id;
    if (!session || previousUser !== nextUser) {
      clearHistoryRestorePreview();
      // A remembered statutes-only local access grant must never outlive logout
      // or a change to a different account.
      try { localStorage.removeItem('testCode.statutes.localAccess.v1'); } catch (_) {}
      try { localStorage.removeItem('testCode.statutes.deviceKey.v1'); localStorage.removeItem('testCode.statutes.independentBase.v1'); } catch (_) {}
    }
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY);
  }
  function serializeVault(vault) { return vault && vault.rawKey && vault.keyWraps ? { rawKey: b64url(vault.rawKey), keyWraps: vault.keyWraps } : null; }
  function restoreVault(saved) { try { if (!saved || !saved.rawKey || !saved.keyWraps) return null; const rawKey = fromB64url(saved.rawKey); return rawKey.length === 32 ? { rawKey, keyWraps: saved.keyWraps } : null; } catch (_) { return null; } }
  function loadActive() { try { return restoreVault(JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || 'null')); } catch (_) { return null; } }
  let vaultChannel = null;
  function channelPost(message) { try { if (vaultChannel) vaultChannel.postMessage(message); } catch (_) {} }
  function saveActive(vault) { const saved = serializeVault(vault); sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(saved)); channelPost({ type: 'vault-response', vault: saved }); }
  function clearHistoryRestorePreview() { vaultHistoryRestorePreview = null; }
  function clearActive() {
    clearHistoryRestorePreview();
    sessionStorage.removeItem(ACTIVE_KEY);
    channelPost({ type: 'vault-cleared' });
    if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent('manga-vault-cleared'));
    }
  }
  function lockVault() { clearActive(); }
  function setupVaultChannel() {
    if (window.TestCodeGuest?.isActive()) return;
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
          clearHistoryRestorePreview();
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
  function setMeta(userId, value, completedPendingToken) {
    const meta = readJSON(META_KEY, {});
    const previous = meta[userId] || {};
    if (!value) { meta[userId] = null; localStorage.setItem(META_KEY, JSON.stringify(meta)); return; }
    const next = Object.assign({}, previous, value);
    const newerChangePending = Boolean(previous.pendingSync && (!completedPendingToken || previous.pendingToken !== completedPendingToken));
    next.pendingSync = newerChangePending;
    if (newerChangePending) {
      next.pendingGeneration = previous.pendingGeneration;
      next.pendingToken = previous.pendingToken;
    } else {
      delete next.pendingGeneration;
      delete next.pendingToken;
    }
    meta[userId] = next;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }
  function markPendingSync(userId) {
    if (!userId) return null;
    const previous = getMeta(userId) || {};
    const pendingGeneration = (Number(previous.pendingGeneration) || 0) + 1;
    const pendingToken = pendingGeneration + ':' + Date.now() + ':' + Math.random().toString(36).slice(2);
    try {
      const meta = readJSON(META_KEY, {});
      meta[userId] = Object.assign({}, previous, { pendingSync: true, pendingGeneration, pendingToken });
      localStorage.setItem(META_KEY, JSON.stringify(meta));
      return pendingToken;
    } catch (_) { return null; }
  }
  function markLocalChangesPending() {
    const session = loadSession();
    return Boolean(markPendingSync(session && session.user && session.user.id));
  }
  function hasPendingLocalChanges() {
    if (window.TestCodeGuest?.isActive()) return false;
    const session = loadSession(); const userId = session && session.user && session.user.id;
    const meta = userId && getMeta(userId);
    return Boolean(meta && meta.pendingSync);
  }
  function guardPendingSyncLeave(event, hasUnpersistedChanges = false) {
    // Cloud-pending changes and in-flight cloud sync are already stored locally.
    // A page-leave warning is justified only for changes that will be lost on navigation.
    if (!hasUnpersistedChanges) return false;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event) event.returnValue = '';
    return true;
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
    if (!access || typeof access.canReadProtectedData !== 'function') {
      throw new Error('VPNアクセス状態を確認できません。ページを再読込して判定を完了してください。');
    }
    if (access.canReadProtectedData() !== true) {
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
  function assertConfig() { if (!config.url || !config.publishableKey) throw new Error('Supabase の設定が見つかりません。'); }
  async function api(path, options = {}) {
    assertConfig();
    const headers = Object.assign({ apikey: config.publishableKey }, options.headers || {});
    if (options.token) headers.Authorization = 'Bearer ' + options.token;
    if (options.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(config.url + path, Object.assign({}, options, { headers }));
    if (!response.ok) { const detail = await response.text().catch(() => ''); let parsed = null; try { parsed = JSON.parse(detail); } catch (_) {} const error = new Error((parsed && (parsed.message || parsed.details)) || ('通信に失敗しました (' + response.status + ')' + (detail ? '。' + detail.slice(0, 140) : ''))); error.status = response.status; error.code = parsed && parsed.code; throw error; }
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
  function assertVaultHistoryAccess() {
    if (window.TestCodeGuest?.isActive()) { clearHistoryRestorePreview(); throw new Error('ゲストモードでは保管庫履歴を利用できません。'); }
    if (!loadActive()) { clearHistoryRestorePreview(); throw new Error('保管庫を開いてから変更履歴を確認してください。'); }
    try { assertSyncAccess(); } catch (error) { clearHistoryRestorePreview(); throw error; }
  }
  function vaultHistoryQuery(userId, filter) {
    return '/rest/v1/manga_reader_vault_history?select=history_id,user_id,revision,updated_at,encrypted_data,encoded_bytes,protected'
      + '&user_id=eq.' + encodeURIComponent(userId) + filter;
  }
  async function decryptVaultHistoryRows(rows) {
    if (!Array.isArray(rows)) throw new Error('変更履歴の応答形式を確認できません。');
    const result = [];
    for (const row of rows) {
      assertVaultHistoryAccess();
      if (!row || typeof row.history_id !== 'string' || !Number.isSafeInteger(Number(row.revision))
          || !row.encrypted_data || typeof row.encrypted_data !== 'object') {
        throw new Error('変更履歴の暗号化データを確認できません。');
      }
      const payload = await decryptPayload({ data: row.encrypted_data });
      assertVaultHistoryAccess();
      const normalized = window.MangaVaultPayload && typeof window.MangaVaultPayload.normalize === 'function'
        ? window.MangaVaultPayload.normalize(payload) : payload;
      result.push({
        historyId: row.history_id,
        revision: Number(row.revision),
        updatedAt: row.updated_at,
        protected: row.protected === true,
        payload: normalized,
      });
    }
    return result;
  }
  async function listVaultHistory(options = {}) {
    assertVaultHistoryAccess();
    const requestedLimit = Number(options && options.limit);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(50, requestedLimit)) : 20;
    const beforeRevision = Number(options && options.beforeRevision);
    const revisionFilter = Number.isSafeInteger(beforeRevision) && beforeRevision > 0
      ? '&revision=lt.' + encodeURIComponent(String(beforeRevision)) : '';
    return withSession(async (token, user) => {
      assertVaultHistoryAccess();
      const rows = await api(vaultHistoryQuery(user.id, revisionFilter + '&order=revision.desc&limit=' + limit), { token });
      assertVaultHistoryAccess();
      return decryptVaultHistoryRows(rows);
    });
  }
  async function getVaultHistorySnapshot(historyId) {
    const id = String(historyId || '').trim();
    if (!id) throw new Error('復元ポイントを指定してください。');
    assertVaultHistoryAccess();
    return withSession(async (token, user) => {
      assertVaultHistoryAccess();
      const rows = await api(vaultHistoryQuery(user.id, '&history_id=eq.' + encodeURIComponent(id) + '&limit=1'), { token });
      assertVaultHistoryAccess();
      const decrypted = await decryptVaultHistoryRows(rows);
      if (decrypted.length !== 1) throw new Error('指定した変更履歴が見つかりません。');
      return decrypted[0];
    });
  }
  async function setVaultHistoryProtected(historyId, protectedState) {
    const id = String(historyId || '').trim();
    if (!id || typeof protectedState !== 'boolean') throw new Error('変更履歴の保護設定を確認してください。');
    assertVaultHistoryAccess();
    return withSession(async (token) => {
      assertVaultHistoryAccess();
      const result = await api('/rest/v1/rpc/set_manga_reader_vault_history_protected', {
        method: 'POST', token,
        body: JSON.stringify({ requested_history_id: id, requested_protected: protectedState }),
      });
      assertVaultHistoryAccess();
      if (result !== true) throw new Error('変更履歴の保護設定を確認できませんでした。');
      return true;
    });
  }
  function createVaultHistoryRestoreId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  async function readVaultHistoryRestoreInputs(token, user) {
    assertVaultHistoryAccess();
    if (await probeSyncProtocol(token) !== SYNC_PROTOCOL_VERSION) {
      throw new Error('変更履歴の復元にはv4同期サーバーが必要です。保管庫と端末の変更は保持されています。');
    }
    const record = await fetchRecord(token, user);
    assertVaultHistoryAccess();
    if (!record || record.legacyRevision || !Number.isSafeInteger(Number(record.revision)) || Number(record.revision) < 1) {
      throw new Error('クラウド保管庫のrevisionを確認できないため、復元を停止しました。');
    }
    const activeVault = loadActive();
    if (!activeVault || stableJson(record.payload && record.payload.keyWraps || {}) !== stableJson(activeVault.keyWraps || {})) {
      throw new Error('別の端末で認証情報が更新されています。再読込して保管庫を開き直してください。');
    }
    const remotePayload = await decryptPayload(record.payload);
    assertVaultHistoryAccess();
    if (hasPendingLocalChanges()) throw new Error('端末に未同期の変更があるため復元を停止しました。先に同期を確認してください。');
    if ((await readDeletionJournal(user.id)).length) {
      throw new Error('未同期の削除journalが残っているため復元を停止しました。端末データは保持されています。');
    }
    if (!window.MangaVaultPayload || typeof window.MangaVaultPayload.buildFromLocalStorage !== 'function') {
      throw new Error('端末の同期データを読み取れないため、復元を停止しました。');
    }
    const localPayload = window.MangaVaultPayload.buildFromLocalStorage();
    const known = getMeta(user.id);
    const recordRevision = Number(record.revision);
    if (known && known.revision !== undefined
        && (!Number.isSafeInteger(Number(known.revision)) || Number(known.revision) !== recordRevision)) {
      throw new Error('端末の同期基準revisionがクラウドと一致しないため、復元を停止しました。最新状態を同期してください。');
    }
    if (known && known.encryptedBaseline) {
      const baseline = await decryptBaseline(known.encryptedBaseline, user.id);
      const normalize = window.MangaVaultPayload.normalize;
      const baselineRevision = Number(known.encryptedBaseline.revision);
      if (!Number.isSafeInteger(baselineRevision) || baselineRevision !== Number(known.revision)
          || baselineRevision !== recordRevision) {
        throw new Error('端末の同期基準revisionがクラウドと一致しないため、復元を停止しました。最新状態を同期してください。');
      }
      if (!sameLocalPayload(normalize(localPayload), normalize(baseline))) {
        throw new Error('端末データと同期基準が一致しないため復元を停止しました。端末データは保持されています。');
      }
    } else if (!sameLocalPayload(window.MangaVaultPayload.normalize(localPayload), window.MangaVaultPayload.normalize(remotePayload))) {
      throw new Error('同期基準が見つからず端末の変更を確認できないため、復元を停止しました。');
    }
    return { record, remotePayload };
  }
  async function previewVaultHistoryRestore(historyId) {
    const id = String(historyId || '').trim();
    if (!id) throw new Error('復元ポイントを指定してください。');
    assertVaultHistoryAccess();
    if (!window.MangaVaultHistory || typeof window.MangaVaultHistory.prepareVaultHistoryRestore !== 'function'
        || typeof window.MangaVaultHistory.diffVaultSnapshots !== 'function') {
      throw new Error('変更履歴の復元機能を読み込めません。ページを再読み込みしてください。');
    }
    return withSession(async (token, user) => {
      const { record, remotePayload } = await readVaultHistoryRestoreInputs(token, user);
      const rows = await api(vaultHistoryQuery(user.id, '&history_id=eq.' + encodeURIComponent(id) + '&limit=1'), { token });
      assertVaultHistoryAccess();
      const snapshots = await decryptVaultHistoryRows(rows);
      if (snapshots.length !== 1) throw new Error('指定した変更履歴が見つかりません。');
      const normalize = window.MangaVaultPayload && window.MangaVaultPayload.normalize;
      const prepared = window.MangaVaultHistory.prepareVaultHistoryRestore(
        snapshots[0].payload, remotePayload, createVaultHistoryRestoreId, normalize,
      );
      const changes = window.MangaVaultHistory.diffVaultSnapshots(remotePayload, prepared.payload, normalize);
      vaultHistoryRestorePreview = {
        historyId: id, userId: user.id, baseRevision: Number(record.revision),
        targetPayload: prepared.payload, idMap: prepared.idMap, changes,
      };
      return { historyId: id, baseRevision: Number(record.revision), idMap: prepared.idMap, changes };
    });
  }
  async function confirmVaultHistoryRestore(historyId, expectedRevision) {
    const id = String(historyId || '').trim();
    const preview = vaultHistoryRestorePreview;
    if (!preview || preview.historyId !== id || Number(expectedRevision) !== preview.baseRevision) {
      clearHistoryRestorePreview();
      throw new Error('復元プレビューを確認できないため、最新状態を読み直して再プレビューしてください。');
    }
    assertVaultHistoryAccess();
    return withSession(async (token, user) => withVaultSaveLock(user.id, async () => {
      assertVaultHistoryAccess();
      if (preview.userId !== user.id) {
        clearHistoryRestorePreview();
        throw new Error('アカウントが変更されたため復元を停止しました。');
      }
      const { record } = await readVaultHistoryRestoreInputs(token, user);
      if (Number(record.revision) !== preview.baseRevision) {
        clearHistoryRestorePreview();
        throw new Error('クラウド保管庫がプレビュー後に更新されました。最新状態を読み直して再プレビューしてください。');
      }
      const activeVault = loadActive();
      if (!activeVault) throw new Error('保管庫がロックされたため復元を停止しました。');
      const nextRevision = preview.baseRevision + 1;
      const encryptedBaseline = await encryptBaseline(preview.targetPayload, user.id, nextRevision);
      const newPayload = await envelope(preview.targetPayload, SYNC_PROTOCOL_VERSION);
      let rows;
      try {
        rows = await api('/rest/v1/rpc/update_manga_reader_vault_v4', {
          method: 'POST', token,
          body: JSON.stringify({ expected_revision: preview.baseRevision, new_payload: newPayload }),
        });
      } catch (error) {
        clearHistoryRestorePreview();
        const uncertain = new Error('復元要求の応答を確認できませんでした。クラウドの最新revisionを読み直してから再試行してください。');
        uncertain.cause = error;
        throw uncertain;
      }
      if (!rows || rows.length !== 1 || Number(rows[0].revision) !== nextRevision) {
        clearHistoryRestorePreview();
        throw new Error('復元CASに失敗しました。最新状態を読み直して再プレビューしてください。');
      }
      assertVaultHistoryAccess();
      try {
        if (!window.MangaVaultPayload || typeof window.MangaVaultPayload.applyToLocalStorage !== 'function') {
          throw new Error('端末の保存領域を更新できません。');
        }
        window.MangaVaultPayload.applyToLocalStorage(preview.targetPayload);
        setMeta(user.id, { revision: nextRevision, updatedAt: rows[0].updated_at, encryptedBaseline });
      } catch (error) {
        clearHistoryRestorePreview();
        const committed = new Error('クラウドへの復元はrevision ' + nextRevision + ' で保存されましたが、この端末へ反映できませんでした。ページを再読み込みしてください。');
        committed.cause = error;
        throw committed;
      }
      clearHistoryRestorePreview();
      emitPayloadApplied();
      return { revision: nextRevision, updatedAt: rows[0].updated_at, idMap: preview.idMap };
    }));
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function probeSyncProtocol(token) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const version = await api('/rest/v1/rpc/manga_reader_vault_sync_capability', { method: 'POST', token, body: '{}' });
        if (Number(version) !== SYNC_PROTOCOL_VERSION) throw new Error('同期サーバーが未対応のprotocolを返しました。同期を停止しました。');
        return SYNC_PROTOCOL_VERSION;
      } catch (error) {
        if (error && error.code === 'PGRST202' && attempt < 2) {
          await wait(25 * (attempt + 1));
          continue;
        }
        if (error && error.code === 'PGRST202') return LEGACY_SYNC_PROTOCOL_VERSION;
        throw error;
      }
    }
    return LEGACY_SYNC_PROTOCOL_VERSION;
  }
  const isLegacyWriteRejected = (error) => [401, 403].includes(Number(error && error.status))
    || error && (['42501', 'PGRST202', 'vault_sync_client_outdated'].includes(error.code)
      || String(error.message || '').includes('vault_sync_client_outdated'));
  async function createVaultRecord(token, user, payload) {
    let protocolVersion = await probeSyncProtocol(token);
    const encrypted = await envelope(payload, protocolVersion);
    try {
      return protocolVersion === SYNC_PROTOCOL_VERSION
        ? await api('/rest/v1/rpc/create_manga_reader_vault_v4', { method: 'POST', token, headers: { Prefer: 'return=representation' }, body: JSON.stringify({ new_payload: encrypted }) })
        : await api('/rest/v1/manga_reader_vaults', { method: 'POST', token, headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, payload: encrypted, revision: 1 }) });
    } catch (error) {
      if (protocolVersion !== LEGACY_SYNC_PROTOCOL_VERSION || !isLegacyWriteRejected(error)) throw error;
      protocolVersion = await probeSyncProtocol(token);
      if (protocolVersion !== SYNC_PROTOCOL_VERSION) throw error;
      if (await fetchRecord(token, user)) throw new Error('別の端末またはタブで保管庫が作成されました。端末データは保持されています。再読込して保管庫を開いてください。');
      return api('/rest/v1/rpc/create_manga_reader_vault_v4', { method: 'POST', token, headers: { Prefer: 'return=representation' }, body: JSON.stringify({ new_payload: await envelope(payload, protocolVersion) }) });
    }
  }
  async function loadPayload() {
    assertSyncAccess();
    return withSession(async (token, user) => {
      assertSyncAccess();
      const record = await fetchRecord(token, user);
      if (!record) { setMeta(user.id, null); return null; }
      const payload = await decryptPayload(record.payload);
      const known = getMeta(user.id);
      if (!(known && known.pendingSync)) {
        const encryptedBaseline = await encryptBaseline(payload, user.id, record.revision || 1);
        setMeta(user.id, { revision: record.revision || 1, updatedAt: record.updated_at, encryptedBaseline });
      }
      return payload;
    });
  }
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
  async function envelope(payload, syncProtocolVersion = SYNC_PROTOCOL_VERSION) { const vault = loadActive(); if (!vault) throw new Error('パスフレーズを入力して保管庫を開いてください。'); return { type: 'manga-reader-vault', version: VERSION, syncProtocolVersion, createdAt: new Date().toISOString(), algorithm: 'AES-256-GCM', keyWraps: vault.keyWraps, data: await encrypt(await importAes(vault.rawKey), new TextEncoder().encode(JSON.stringify(payload))) }; }
  async function decryptPayload(payload) { const vault = loadActive(); if (!vault) throw new Error('パスフレーズを入力して保管庫を開いてください。'); const data = JSON.parse(new TextDecoder().decode(await decrypt(await importAes(vault.rawKey), payload.data))); if (data && data.videoMarkers && window.MangaVaultPayload && typeof window.MangaVaultPayload.normalizeVideoMarkers === 'function') data.videoMarkers = window.MangaVaultPayload.normalizeVideoMarkers(data.videoMarkers); return data; }
  async function encryptBaseline(payload, userId, revision) {
    const vault = loadActive();
    if (!vault) throw new Error('保管庫がロックされているため、同期基準を保存できません。');
    const baseline = { type: 'manga-reader-vault-baseline', version: 1, userId, revision: Number(revision) || 0, iv: b64url(randomBytes(12)) };
    const additionalData = new TextEncoder().encode([baseline.type, baseline.version, baseline.userId, baseline.revision].join(':'));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: fromB64url(baseline.iv), additionalData }, await importAes(vault.rawKey), new TextEncoder().encode(JSON.stringify(payload)));
    baseline.ciphertext = b64url(new Uint8Array(ciphertext));
    return baseline;
  }
  async function decryptBaseline(baseline, userId) {
    if (!baseline || baseline.type !== 'manga-reader-vault-baseline' || baseline.version !== 1 || baseline.userId !== userId
        || !Number.isSafeInteger(Number(baseline.revision)) || !baseline.iv || !baseline.ciphertext) {
      throw new Error('同期基準を確認できないため同期を停止しました。端末データは保持されています。暗号化バックアップから復旧してください。');
    }
    const vault = loadActive();
    if (!vault) throw new Error('保管庫がロックされているため、同期基準を読み取れません。');
    try {
      const additionalData = new TextEncoder().encode([baseline.type, baseline.version, baseline.userId, baseline.revision].join(':'));
      const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(baseline.iv), additionalData }, await importAes(vault.rawKey), fromB64url(baseline.ciphertext));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
      throw new Error('同期基準を復号できないため同期を停止しました。端末データは保持されています。暗号化バックアップから復旧してください。');
    }
  }
  function journalAad(userId) { return new TextEncoder().encode(['manga-reader-vault-deletion-journal', 1, userId].join(':')); }
  function deletionJournalKey() { const keys = window.MangaVaultPayload && window.MangaVaultPayload.LOCAL_ONLY_KEYS; if (!Array.isArray(keys) || typeof keys[0] !== 'string') throw new Error('削除journalの保存先を確認できません。'); return keys[0]; }
  async function readDeletionJournal(userId) {
    const keys = window.MangaVaultPayload && window.MangaVaultPayload.LOCAL_ONLY_KEYS;
    const currentKey = deletionJournalKey();
    const legacyKey = Array.isArray(keys) ? keys[1] : null;
    const serialized = localStorage.getItem(currentKey);
    let entries = [];
    if (serialized) {
      const envelope = JSON.parse(serialized);
      if (!envelope || envelope.type !== 'manga-reader-vault-deletion-journal' || envelope.version !== 1 || envelope.userId !== userId
          || !envelope.iv || !envelope.ciphertext) throw new Error('削除journalの所有者または形式を確認できないため、削除と同期を停止しました。');
      const vault = loadActive();
      if (!vault) throw new Error('保管庫がロックされているため削除journalを復号できません。');
      try {
        const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(envelope.iv), additionalData: journalAad(userId) }, await importAes(vault.rawKey), fromB64url(envelope.ciphertext));
        entries = JSON.parse(new TextDecoder().decode(bytes));
        if (!Array.isArray(entries) || entries.some((entry) => !entry || typeof entry.path !== 'string' || !entry.path.startsWith('/') || typeof entry.operationId !== 'string')) throw new Error('invalid journal');
      } catch (_) { throw new Error('削除journalを復号できないため、削除と同期を停止しました。端末データを保持しています。'); }
    }
    if (legacyKey) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) {
        let paths;
        try { paths = JSON.parse(legacy); } catch (_) { throw new Error('旧削除journalを読み取れないため、削除と同期を停止しました。'); }
        if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string' || !path.startsWith('/'))) throw new Error('旧削除journalの形式を確認できないため、削除と同期を停止しました。');
        const seen = new Set(entries.map((entry) => entry.path));
        paths.forEach((path) => { if (!seen.has(path)) entries.push({ path, operationId: b64url(randomBytes(16)) }); });
        await writeDeletionJournal(userId, entries);
        localStorage.removeItem(legacyKey);
      }
    }
    return entries;
  }
  async function writeDeletionJournal(userId, entries) {
    const vault = loadActive();
    if (!vault) throw new Error('保管庫がロックされているため削除journalを暗号化できません。');
    const iv = randomBytes(12);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: journalAad(userId) }, await importAes(vault.rawKey), new TextEncoder().encode(JSON.stringify(entries)));
    const envelope = { type: 'manga-reader-vault-deletion-journal', version: 1, userId, iv: b64url(iv), ciphertext: b64url(new Uint8Array(ciphertext)) };
    localStorage.setItem(deletionJournalKey(), JSON.stringify(envelope));
  }
  async function recordSyncDeletion(path, mutate) {
    const pointers = (Array.isArray(path) ? path : [path]).map((pointer) => String(pointer || ''));
    if (!pointers.length || pointers.some((pointer) => !pointer.startsWith('/')) || typeof mutate !== 'function') throw new TypeError('削除にはJSON Pointerとデータ変更処理が必要です。');
    const session = loadSession(); const userId = session && session.user && session.user.id;
    if (!userId || !loadActive()) throw new Error('保管庫を開いてから削除してください。');
    const entries = await readDeletionJournal(userId);
    const recorded = pointers.map((pointer) => {
      let entry = entries.find((candidate) => candidate.path === pointer);
      if (!entry) { entry = { path: pointer, operationId: b64url(randomBytes(16)) }; entries.push(entry); }
      return entry;
    });
    await writeDeletionJournal(userId, entries);
    const pendingToken = markPendingSync(userId);
    if (!pendingToken) throw new Error('未同期状態を端末に記録できないため、削除を停止しました。');
    await mutate(recorded.map((entry) => entry.operationId));
    return recorded.map((entry) => entry.operationId);
  }
  function removeAtPointer(root, pointer) {
    const parts = pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      if (!parent || typeof parent !== 'object') return;
      if (Array.isArray(parent)) parent = parent.find((item) => item && String(item.id) === part);
      else parent = parent[part];
    }
    if (!parent || typeof parent !== 'object') return;
    const key = parts.at(-1);
    if (Array.isArray(parent)) {
      const index = parent.findIndex((item, position) => (item && String(item.id) === key) || String(position) === key);
      if (index >= 0) parent.splice(index, 1);
    } else delete parent[key];
  }
  async function prepareJournaledPayload(payload, userId) {
    const entries = await readDeletionJournal(userId);
    if (!entries.length) return { payload, operationIds: [] };
    const next = JSON.parse(JSON.stringify(payload));
    const tombstones = new Set(Array.isArray(next.vaultSyncTombstones) ? next.vaultSyncTombstones : []);
    entries.forEach((entry) => { tombstones.add(entry.path); removeAtPointer(next, entry.path); });
    next.vaultSyncTombstones = [...tombstones];
    return { payload: next, operationIds: entries.map((entry) => entry.operationId) };
  }
  async function acknowledgeDeletionJournal(userId, operationIds) {
    if (!operationIds || !operationIds.length) return;
    const acknowledged = new Set(operationIds);
    const remaining = (await readDeletionJournal(userId)).filter((entry) => !acknowledged.has(entry.operationId));
    if (remaining.length) await writeDeletionJournal(userId, remaining);
    else localStorage.removeItem(deletionJournalKey());
  }
  const samePayload = (left, right) => stableJson(left) === stableJson(right);
  function sameLocalPayload(left, right) {
    const localData = (payload) => {
      const normalized = window.MangaVaultPayload && typeof window.MangaVaultPayload.normalize === 'function'
        ? window.MangaVaultPayload.normalize(payload) : payload;
      if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return normalized;
      const result = Object.assign({}, normalized);
      delete result.vaultSyncTombstones;
      return result;
    };
    return samePayload(localData(left), localData(right));
  }
  function assertMergeAvailable() {
    if (!window.MangaVaultSyncMerge || typeof window.MangaVaultSyncMerge.mergeVaultPayload !== 'function') {
      throw new Error('差分同期機能を読み込めません。ページを再読込してください。');
    }
  }
  async function commitMergedPayload(user, record, payload, localSnapshot, pendingToken, deletionOperationIds) {
    const currentLocal = window.MangaVaultPayload && typeof window.MangaVaultPayload.buildFromLocalStorage === 'function'
      ? window.MangaVaultPayload.buildFromLocalStorage() : localSnapshot;
    const applyMergedPayload = samePayload(currentLocal, localSnapshot)
      && window.MangaVaultPayload && typeof window.MangaVaultPayload.applyToLocalStorage === 'function';
    const receivedRemoteChanges = applyMergedPayload && !samePayload(localSnapshot, payload);
    if (applyMergedPayload) window.MangaVaultPayload.applyToLocalStorage(payload);
    const encryptedBaseline = await encryptBaseline(payload, user.id, record.revision);
    setMeta(user.id, { revision: record.revision, updatedAt: record.updated_at, encryptedBaseline }, pendingToken);
    await acknowledgeDeletionJournal(user.id, deletionOperationIds);
    pendingConflictChoices = null;
    if (receivedRemoteChanges) emitPayloadApplied();
    return record;
  }
  async function persistPayloadWithProtocol(token, user, payload, pendingToken, protocolVersion, journaled, requireVpn) {
    if (requireVpn) assertSyncAccess();
    const localSnapshot = payload;
    payload = journaled.payload;
    if (protocolVersion === LEGACY_SYNC_PROTOCOL_VERSION
        && (journaled.operationIds.length || Array.isArray(payload.vaultSyncTombstones) && payload.vaultSyncTombstones.length)) {
      throw new Error('削除履歴を安全に共有できるv4同期がまだ利用できません。削除と端末の未同期変更を保持しています。');
    }
    const existing = await fetchRecord(token, user);
    if (existing && existing.legacyRevision) throw new Error('Supabaseのrevision migrationが未適用です。supabase-schema.sqlをSQL Editorで実行してから保存してください。');
    const known = getMeta(user.id);
    if (existing) {
      assertMergeAvailable();
      if (Number(existing.payload && existing.payload.syncProtocolVersion) > protocolVersion) {
        throw new Error('この保管庫は新しい同期方式で更新されています。アプリを再読込してから同期してください。');
      }
      let baseline;
      if (known && known.encryptedBaseline) baseline = await decryptBaseline(known.encryptedBaseline, user.id);
      else {
        if (known && known.pendingSync) throw new Error('未同期データの基準が見つからないため上書きを停止しました。端末データを保持したまま暗号化バックアップから復旧してください。');
        const cloudPayload = await decryptPayload(existing.payload);
        if (!samePayload(payload, cloudPayload)) throw new Error('未同期データの基準が見つからないため上書きを停止しました。端末データを保持したまま暗号化バックアップから復旧してください。');
        if (Number(existing.payload && existing.payload.syncProtocolVersion || LEGACY_SYNC_PROTOCOL_VERSION) !== protocolVersion) {
          baseline = cloudPayload;
        } else {
        const initialBaseline = await encryptBaseline(cloudPayload, user.id, existing.revision);
        setMeta(user.id, { revision: existing.revision, updatedAt: existing.updated_at, encryptedBaseline: initialBaseline });
        return existing;
        }
      }

      let current = existing;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (requireVpn) assertSyncAccess();
        const activeVault = loadActive();
        const wrappersMatch = stableJson(current.payload && current.payload.keyWraps || {}) === stableJson(activeVault && activeVault.keyWraps || {});
        if (!wrappersMatch) throw new Error('別の端末で保管庫の認証情報が更新されています。端末データを保持したまま同期を停止しました。再読込して確認してください。');
        const remotePayload = await decryptPayload(current.payload);
        const localWithUnknown = window.MangaVaultSyncMerge.retainUnknownProperties(baseline, payload);
        const mergeResult = window.MangaVaultSyncMerge.mergeVaultPayload(baseline, localWithUnknown, remotePayload);
        if (mergeResult.conflicts.length) {
          const pending = pendingConflictChoices;
          const choices = pending && pending.choices;
          const snapshots = pending && pending.snapshots;
          const staleChoices = !pending || mergeResult.conflicts.some((conflict) =>
            !['local', 'remote'].includes(choices[conflict.path]) || snapshots[conflict.path] !== conflict.snapshot);
          if (staleChoices) {
            pendingConflictChoices = null;
            if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
              window.dispatchEvent(new window.CustomEvent('manga-vault-conflict', { detail: { conflicts: mergeResult.conflicts } }));
            }
            const error = new Error(pending ? '競合後にデータが更新されました。最新の値を確認して選び直してください。' : '同じデータが別の端末で変更されています。画面で端末またはクラウドの値を選択してください。');
            error.conflicts = mergeResult.conflicts;
            throw error;
          }
          mergeResult.payload = window.MangaVaultSyncMerge.applyConflictChoices(mergeResult.payload, mergeResult.conflicts, choices);
        }
        if (samePayload(mergeResult.payload, remotePayload) && Number(current.payload && current.payload.syncProtocolVersion || LEGACY_SYNC_PROTOCOL_VERSION) === protocolVersion) {
          return commitMergedPayload(user, current, remotePayload, localSnapshot, pendingToken, journaled.operationIds);
        }
        const encrypted = await envelope(mergeResult.payload, protocolVersion);
        const rpc = protocolVersion === SYNC_PROTOCOL_VERSION ? 'update_manga_reader_vault_v4' : 'update_manga_reader_vault';
        const rows = await api('/rest/v1/rpc/' + rpc, { method: 'POST', token, body: JSON.stringify({ expected_revision: current.revision, new_payload: encrypted }) });
        if (requireVpn) assertSyncAccess();
        if (rows && rows.length) {
          return commitMergedPayload(user, Object.assign({}, current, rows[0]), mergeResult.payload, localSnapshot, pendingToken, journaled.operationIds);
        }
        current = await fetchRecord(token, user);
        if (!current) throw new Error('クラウド保管庫が見つからないため同期を停止しました。端末の変更は保持されています。');
      }
      throw new Error('同期中にクラウド更新が続いたため自動再試行を停止しました。端末の変更は保持されています。再度同期してください。');
    }
    if (requireVpn) assertSyncAccess();
    const rows = await createVaultRecord(token, user, payload);
    if (requireVpn) assertSyncAccess();
    const row = rows && rows[0];
    if (!row) throw new Error('クラウドへの保存結果を確認できませんでした。再読込して同期状態を確認してください。');
    const revision = row.revision || 1;
    const encryptedBaseline = await encryptBaseline(payload, user.id, revision);
    if (window.MangaVaultPayload && typeof window.MangaVaultPayload.applyToLocalStorage === 'function') window.MangaVaultPayload.applyToLocalStorage(payload);
    setMeta(user.id, { revision, updatedAt: row.updated_at, encryptedBaseline }, pendingToken);
    await acknowledgeDeletionJournal(user.id, journaled.operationIds);
    pendingConflictChoices = null;
    return row;
  }
  async function persistPayload(token, user, payload, pendingToken, options = {}) {
    const requireVpn = options.requireVpn !== false;
    const journaled = await prepareJournaledPayload(payload, user.id);
    let protocolVersion = await probeSyncProtocol(token);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await persistPayloadWithProtocol(token, user, payload, pendingToken, protocolVersion, journaled, requireVpn);
      } catch (error) {
        const legacyWriteRejected = protocolVersion === LEGACY_SYNC_PROTOCOL_VERSION && isLegacyWriteRejected(error);
        if (!legacyWriteRejected || attempt > 0) throw error;
        const detected = await probeSyncProtocol(token);
        if (detected !== SYNC_PROTOCOL_VERSION) throw error;
        protocolVersion = detected;
      }
    }
    throw new Error('同期方式を確認できないため、端末の変更を保留しました。再度同期してください。');
  }
  async function writePayload(payload, pendingToken) {
    assertSyncAccess();
    const session = loadSession(); const userId = session && session.user && session.user.id;
    if (!userId) throw new Error('ログインしてください。');
    return withVaultSaveLock(userId, () => withSession((token, user) => persistPayload(token, user, payload, pendingToken)));
  }
  async function savePayload(payload) {
    let snapshot;
    try { snapshot = JSON.parse(JSON.stringify(payload)); }
    catch (_) { throw new Error('保管庫に保存するデータを読み取れませんでした。'); }
    const session = loadSession(); const userId = session && session.user && session.user.id;
    const pendingToken = markPendingSync(userId);
    if (!pendingToken) throw new Error('未同期状態を端末に記録できません。データは保持されています。保存領域を確認してください。');
    assertSyncAccess();
    return enqueueSave(() => writePayload(snapshot, pendingToken));
  }
  async function writeLocalChanges(pendingToken, options = {}) {
    const requireVpn = options.requireVpn !== false;
    if (requireVpn) assertSyncAccess();
    if (!loadActive()) throw new Error('保管庫がロックされています。端末には保存済みです。保管庫を開いて同期してください。');
    if (!window.MangaVaultPayload || typeof window.MangaVaultPayload.buildFromLocalStorage !== 'function') throw new Error('端末の同期データを読み取れません。');
    const session = loadSession(); const userId = session && session.user && session.user.id;
    if (!userId) throw new Error('ログインしてください。');
    return withVaultSaveLock(userId, () => withSession((token, user) => {
      if (requireVpn) assertSyncAccess();
      if (!loadActive()) throw new Error('保管庫がロックされています。端末には保存済みです。保管庫を開いて同期してください。');
      return persistPayload(token, user, window.MangaVaultPayload.buildFromLocalStorage(), pendingToken, { requireVpn });
    }));
  }
  async function saveLocalChanges() {
    const session = loadSession(); const userId = session && session.user && session.user.id;
    const pendingToken = markPendingSync(userId);
    if (!pendingToken) throw new Error('未同期状態を端末に記録できません。データは保持されています。保存領域を確認してください。');
    return enqueueSave(() => writeLocalChanges(pendingToken, { requireVpn: false }));
  }

  function dispatchVaultEvent(event) {
    const target = window.document && typeof window.document.dispatchEvent === 'function' ? window.document : window;
    if (typeof target.dispatchEvent === 'function') target.dispatchEvent(event);
  }
  function emitPayloadApplied() {
    if (typeof window.CustomEvent !== 'function') return;
    dispatchVaultEvent(new window.CustomEvent('manga-vault-payload-applied'));
  }
  function emitVaultSyncState(state, detail = {}) {
    if (typeof window.CustomEvent !== 'function') return;
    dispatchVaultEvent(new window.CustomEvent('manga-vault-sync-state', { detail: Object.assign({ state }, detail) }));
  }
  function canReceiveVaultPayload() {
    const access = window.MangaReaderMediaAccess;
    return Boolean(access && typeof access.canReadProtectedData === 'function' && access.canReadProtectedData() === true);
  }
  async function syncLatestInternal() {
    if (window.TestCodeGuest?.isActive()) return { state: 'deferred', reason: 'guest' };
    if (!loadActive()) return { state: 'deferred', reason: 'locked' };
    const session = loadSession();
    const userId = session && session.user && session.user.id;
    if (!userId || !session.refresh_token) return { state: 'deferred', reason: 'unauthenticated' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { state: 'deferred', reason: 'offline' };
    const writePendingChanges = async () => {
      const pendingToken = markPendingSync(userId);
      if (!pendingToken) throw new Error('未同期状態を端末に記録できません。データは保持されています。保存領域を確認してください。');
      await writeLocalChanges(pendingToken, { requireVpn: false });
    };
    if (hasPendingLocalChanges()) {
      await writePendingChanges();
      if (!canReceiveVaultPayload()) return { state: 'success', encryptedUpload: true };
    }
    if (!canReceiveVaultPayload()) return { state: 'deferred', reason: 'vpn' };
    if (!window.MangaVaultPayload || typeof window.MangaVaultPayload.buildFromLocalStorage !== 'function'
        || typeof window.MangaVaultPayload.applyToLocalStorage !== 'function') {
      throw new Error('端末の同期データを安全に読み書きできません。');
    }
    const result = await withVaultSaveLock(userId, () => withSession(async (token, user) => {
      const record = await fetchRecord(token, user);
      if (!canReceiveVaultPayload()) return { state: 'deferred', reason: 'vpn' };
      if (!record) throw new Error('クラウド保管庫が見つからないため受信同期を停止しました。端末データは保持されています。');
      if (record.legacyRevision) throw new Error('クラウド保管庫のrevisionを確認できないため受信同期を停止しました。');
      if (Number(record.payload && record.payload.syncProtocolVersion || LEGACY_SYNC_PROTOCOL_VERSION) > SYNC_PROTOCOL_VERSION) {
        throw new Error('この保管庫は新しい同期方式で更新されています。アプリを再読込してから同期してください。');
      }
      const activeVault = loadActive();
      if (!activeVault || stableJson(record.payload && record.payload.keyWraps || {}) !== stableJson(activeVault.keyWraps || {})) {
        throw new Error('別の端末で保管庫の認証情報が更新されています。再読込して保管庫を開き直してください。');
      }
      const localSnapshot = window.MangaVaultPayload.buildFromLocalStorage();
      const known = getMeta(user.id);
      let baseline = null;
      if (known && known.encryptedBaseline) baseline = await decryptBaseline(known.encryptedBaseline, user.id);
      const remotePayload = await decryptPayload(record.payload);
      if (!canReceiveVaultPayload()) return { state: 'deferred', reason: 'vpn' };
      const currentMeta = getMeta(user.id);
      const currentLocal = window.MangaVaultPayload.buildFromLocalStorage();
      if ((currentMeta && currentMeta.pendingSync) || !samePayload(currentLocal, localSnapshot)) return { needsMerge: true };
      if (baseline && !sameLocalPayload(localSnapshot, baseline)) return { needsMerge: true };
      if (!baseline && !sameLocalPayload(localSnapshot, remotePayload)) {
        throw new Error('未同期データの基準が見つからないため受信同期を停止しました。端末データを保持したまま暗号化バックアップから復旧してください。');
      }
      const changed = !sameLocalPayload(localSnapshot, remotePayload);
      if (changed) window.MangaVaultPayload.applyToLocalStorage(remotePayload);
      const encryptedBaseline = await encryptBaseline(remotePayload, user.id, record.revision);
      setMeta(user.id, { revision: record.revision, updatedAt: record.updated_at, encryptedBaseline });
      if (changed) emitPayloadApplied();
      return { state: 'success', applied: changed, revision: record.revision };
    }));
    if (result.needsMerge) {
      await writePendingChanges();
      return { state: 'success', merged: true };
    }
    return result;
  }
  let syncLatestPromise = null;
  let lastAutoSyncAt = 0;
  let autoSyncTimer = null;
  // Statute annotations are non-media data. Receive only this one field when
  // VPN is absent; never apply the rest of the decrypted Vault payload.
  async function syncStatutesLatest() {
    if (window.TestCodeGuest?.isActive()) return { state: 'deferred', reason: 'guest' };
    if (!loadActive()) return { state: 'deferred', reason: 'locked' };
    const session = loadSession();
    const userId = session && session.user && session.user.id;
    if (!userId || !session.refresh_token) return { state: 'deferred', reason: 'unauthenticated' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { state: 'deferred', reason: 'offline' };
    if (hasPendingLocalChanges()) await saveLocalChanges();
    const key = 'testCode.statutes.definitions.v1';
    const noteKey = 'testCode.statutes.articleNotes.v1';
    const historyKey = 'testCode.statutes.articleNoteHistory.v1';
    const reviewsKey = 'testCode.statutes.definitionReviews.v1';
    const readObject = k => { try { const value = JSON.parse(localStorage.getItem(k) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } };
    const readLocal = () => {
      try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
      catch (_) { return []; }
    };
    return withVaultSaveLock(userId, () => withSession(async (token, user) => {
      const record = await fetchRecord(token, user);
      if (!record) throw new Error('クラウド保管庫が見つかりません。');
      if (record.legacyRevision) throw new Error('保管庫のrevisionを検証できません。');
      const active = loadActive();
      if (!active || stableJson(record.payload?.keyWraps || {}) !== stableJson(active.keyWraps || {}))
        throw new Error('認証情報が更新されています。保管庫を開き直してください。');
      const before = readLocal();
      const localNotes = readObject(noteKey);
      const localHistory = readObject(historyKey);
      const localReviews = readObject(reviewsKey);
      const known = getMeta(user.id);
      const baseline = known?.encryptedBaseline ? await decryptBaseline(known.encryptedBaseline, user.id) : null;
      const remote = await decryptPayload(record.payload);
      const remoteNotes = Array.isArray(remote.statuteDefinitions) ? remote.statuteDefinitions : [];
      const previousNotes = baseline && Array.isArray(baseline.statuteDefinitions) ? baseline.statuteDefinitions : [];
      const remoteArticleNotes = remote.articleNotes || {};
      const remoteHistory = remote.articleNoteHistory || {};
      const remoteReviews = remote.definitionReviews || {};
      const previousArticleNotes = baseline?.articleNotes || {};
      const previousHistory = baseline?.articleNoteHistory || {};
      const previousReviews = baseline?.definitionReviews || {};
      // Preserve the most recently reviewed version of each card across devices.
      const mergedReviews = { ...remoteReviews };
      for (const [id, entry] of Object.entries(localReviews)) {
        if (entry && Number.isFinite(entry.lastReviewed) && (!mergedReviews[id] || entry.lastReviewed > Number(mergedReviews[id].lastReviewed || 0))) mergedReviews[id] = entry;
      }
      const changedLocally = !samePayload(localNotes, previousArticleNotes) || !samePayload(localHistory, previousHistory);
      if (!baseline && (Object.keys(localNotes).length || Object.keys(localHistory).length) && (!samePayload(localNotes, remoteArticleNotes) || !samePayload(localHistory, remoteHistory)))
        return {state:'deferred',reason:'local-conflict'};
      if (baseline && changedLocally && (!samePayload(localNotes, remoteArticleNotes) || !samePayload(localHistory, remoteHistory)))
        return {state:'deferred',reason:'local-conflict'};
      // Without a trustworthy common baseline, never overwrite divergent
      // unsynced local annotations. Other Vault fields stay completely untouched.
      if (!baseline && before.length && !samePayload(before, remoteNotes))
        return { state: 'deferred', reason: 'local-conflict' };
      if (baseline && !samePayload(before, previousNotes) && !samePayload(before, remoteNotes))
        return { state: 'deferred', reason: 'local-conflict' };
      if (!samePayload(before, remoteNotes)) {
        if (hasPendingLocalChanges() || !samePayload(before, readLocal()))
          return { state: 'deferred', reason: 'local-conflict' };
        localStorage.setItem(key, JSON.stringify(remoteNotes));
      }
      const applyArticleNotes = !samePayload(localNotes, remoteArticleNotes) || !samePayload(localHistory, remoteHistory);
      if (applyArticleNotes) {
        localStorage.setItem(noteKey, JSON.stringify(remoteArticleNotes));
        localStorage.setItem(historyKey, JSON.stringify(remoteHistory));
      }
      if (!samePayload(localReviews, mergedReviews)) localStorage.setItem(reviewsKey, JSON.stringify(mergedReviews));
      if (!samePayload(before, remoteNotes) || applyArticleNotes || !samePayload(localReviews, mergedReviews)) emitPayloadApplied();
      return { state: 'success', applied: !samePayload(before, remoteNotes) || applyArticleNotes || !samePayload(localReviews, mergedReviews) };
    }));
  }
  function syncLatest() {
    if (syncLatestPromise) return syncLatestPromise;
    if (autoSyncTimer !== null) {
      clearTimeout(autoSyncTimer);
      autoSyncTimer = null;
    }
    emitVaultSyncState('syncing');
    lastAutoSyncAt = Date.now();
    const operation = enqueueSave(syncLatestInternal);
    const tracked = operation.then((result) => {
      if (result && result.state === 'deferred') emitVaultSyncState('deferred', { reason: result.reason });
      else if (result && result.state === 'success' && hasPendingLocalChanges()) {
        result = Object.assign({}, result, { state: 'pending' });
        emitVaultSyncState('pending');
      } else emitVaultSyncState('success', { applied: Boolean(result && result.applied), merged: Boolean(result && result.merged), encryptedUpload: Boolean(result && result.encryptedUpload) });
      return result;
    }).catch((error) => {
      emitVaultSyncState(error && Array.isArray(error.conflicts) ? 'conflict' : 'error', {
        message: error && error.message ? error.message : '同期に失敗しました。',
      });
      throw error;
    }).finally(() => {
      if (syncLatestPromise === tracked) syncLatestPromise = null;
    });
    syncLatestPromise = tracked;
    return tracked;
  }
  function requestAutoVaultSync(immediate = false) {
    if (window.TestCodeGuest?.isActive() || !loadActive()) return;
    const session = loadSession();
    if (!session || !session.refresh_token || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    if (syncLatestPromise) return;
    if (autoSyncTimer !== null) {
      if (!immediate) return;
      clearTimeout(autoSyncTimer);
      autoSyncTimer = null;
    }
    const delay = immediate ? 0 : Math.max(0, 30000 - (Date.now() - lastAutoSyncAt));
    autoSyncTimer = setTimeout(() => {
      autoSyncTimer = null;
      (window.document?.documentElement?.classList.contains('statutes-page') ? syncStatutesLatest() : syncLatest()).catch(() => {});
    }, delay);
    if (autoSyncTimer && typeof autoSyncTimer.unref === 'function') autoSyncTimer.unref();
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('load', () => requestAutoVaultSync(), { once: true });
    window.addEventListener('online', () => requestAutoVaultSync(true));
    window.addEventListener('focus', () => requestAutoVaultSync());
    window.addEventListener('storage', (event) => {
      if (event && event.key === SESSION_KEY) clearHistoryRestorePreview();
    });
  }
  if (window.document && typeof window.document.addEventListener === 'function') {
    window.document.addEventListener('visibilitychange', () => {
      if (window.document.visibilityState === 'visible') requestAutoVaultSync();
    });
    window.document.addEventListener('manga-reader-vpn-status', (event) => {
      if (event && event.detail && event.detail.status === 'allowed') requestAutoVaultSync(true);
      else clearHistoryRestorePreview();
    });
  }


  async function resolveConflicts(choices, conflictSnapshot) {
    if (!choices || typeof choices !== 'object') throw new Error('競合の選択内容を読み取れません。');
    const snapshots = {};
    (Array.isArray(conflictSnapshot) ? conflictSnapshot : []).forEach((conflict) => {
      if (conflict && typeof conflict.path === 'string' && typeof conflict.snapshot === 'string') snapshots[conflict.path] = conflict.snapshot;
    });
    pendingConflictChoices = { choices: Object.assign({}, choices), snapshots };
    try { return await saveLocalChanges(); }
    catch (error) { pendingConflictChoices = null; throw error; }
  }
  async function restoreExistingRecord(record, user, applyPayload, unlockRecord) {
    const known = getMeta(user.id);
    const pendingSync = Boolean(known && known.pendingSync);
    await unlockRecord();
    const payload = await decryptPayload(record.payload);
    if (pendingSync) return { created: false, pendingSync: true, retryPending: true, syncError: '' };
    await applyPayload(payload);
    const encryptedBaseline = await encryptBaseline(payload, user.id, record.revision || 1);
    setMeta(user.id, { revision: record.revision || 1, updatedAt: record.updated_at, encryptedBaseline });
    return { created: false, retryPending: Number(record.payload && record.payload.syncProtocolVersion || LEGACY_SYNC_PROTOCOL_VERSION) < SYNC_PROTOCOL_VERSION };
  }
  async function initialize(passphrase, recoveryCode, applyPayload, createPayload) {
    if (typeof applyPayload !== 'function' || typeof createPayload !== 'function') throw new TypeError('保管庫初期化にはapplyPayloadとcreatePayloadが必要です。');
    const result = await withSession(async (token, user) => {
      const record = await fetchRecord(token, user);
      if (!record) {
        const created = await create(passphrase);
        const initialPayload = createPayload();
        await applyPayload(initialPayload);
        const pendingToken = markPendingSync(user.id);
        if (!pendingToken) throw new Error('未同期状態を端末に記録できません。データは保持されています。保存領域を確認してください。');
        const rows = await withVaultSaveLock(user.id, async () => {
          const latest = await fetchRecord(token, user);
          if (latest) throw new Error('別の端末またはタブで保管庫が作成されました。端末データは保持されています。再読込して保管庫を開いてください。');
          assertSyncAccess();
          return createVaultRecord(token, user, initialPayload);
        });
        const row = rows && rows[0];
        if (!row) throw new Error('クラウドへの保存結果を確認できませんでした。端末データは保持されています。再読込して同期状態を確認してください。');
        const encryptedBaseline = await encryptBaseline(initialPayload, user.id, row.revision || 1);
        setMeta(user.id, { revision: row.revision || 1, updatedAt: row.updated_at, encryptedBaseline }, pendingToken);
        return { created: true, recoveryCode: created.recoveryCode };
      }
      return restoreExistingRecord(record, user, applyPayload, () => unlock(record.payload, passphrase, recoveryCode));
    });
    return retryPendingLocalChanges(result);
  }
  async function persistCredentialUpdate(token, user, expectedPayload, expectedKeyWraps) {
    // Updating key wrappers must not upload the device's local payload. The
    // encrypted cloud data remains unchanged, and pending edits retain their
    // sync marker/baseline for a later ordinary three-way merge.
    const record = await fetchRecord(token, user);
    const currentMeta = getMeta(user.id);
    if (!record || !currentMeta || Number(currentMeta.revision) !== Number(record.revision)) {
      throw new Error('別の端末で保管庫が更新されています。端末データを保持したまま認証方法の変更を停止しました。再読込して確認してください。');
    }
    if (stableJson(expectedKeyWraps || {}) !== stableJson(record.payload && record.payload.keyWraps || {})) {
      throw new Error('別の端末で保管庫の認証情報が更新されています。保管庫を開き直してから再設定してください。');
    }
    const remotePayload = await decryptPayload(record.payload);
    if (expectedPayload && stableJson(expectedPayload) !== stableJson(remotePayload)) {
      throw new Error('保管庫の内容が処理中に更新されました。データを保持したまま認証方法の変更を停止しました。');
    }
    return withVaultSaveLock(user.id, async () => {
      assertSyncAccess();
      let protocolVersion = await probeSyncProtocol(token);
      let encrypted = await envelope(remotePayload, protocolVersion);
      let rpc = protocolVersion === SYNC_PROTOCOL_VERSION ? 'update_manga_reader_vault_v4' : 'update_manga_reader_vault';
      let rows;
      try {
        rows = await api('/rest/v1/rpc/' + rpc, { method: 'POST', token, body: JSON.stringify({ expected_revision: record.revision, new_payload: encrypted }) });
      } catch (error) {
        if (protocolVersion !== LEGACY_SYNC_PROTOCOL_VERSION || !isLegacyWriteRejected(error)) throw error;
        protocolVersion = await probeSyncProtocol(token);
        if (protocolVersion !== SYNC_PROTOCOL_VERSION) throw error;
        encrypted = await envelope(remotePayload, protocolVersion);
        rows = await api('/rest/v1/rpc/update_manga_reader_vault_v4', { method: 'POST', token, body: JSON.stringify({ expected_revision: record.revision, new_payload: encrypted }) });
      }
      assertSyncAccess();
      if (!rows || !rows.length) throw new Error('認証情報の保存中に保管庫が更新されました。認証情報は変更せず、保管庫を再読込してください。');
      const updated = Object.assign({}, record, rows[0]);
      // Never invent a sync baseline for a device that did not have one.
      // Otherwise unknown local edits could be mistaken for safe merged changes.
      const currentMeta = getMeta(user.id);
      const nextMeta = { revision: updated.revision, updatedAt: updated.updated_at };
      if (currentMeta && currentMeta.encryptedBaseline) {
        nextMeta.encryptedBaseline = await encryptBaseline(remotePayload, user.id, updated.revision);
      }
      // setMeta intentionally receives no completedPendingToken: pending edits
      // are still pending even though the credential-only CAS succeeded.
      setMeta(user.id, nextMeta);
      return true;
    });
  }
  async function registerPasskey(passphrase) {
    const previous = loadActive();
    return withSession(async (token, user) => {
      try {
        const record = await fetchRecord(token, user);
        if (!record) throw new Error('先にパスフレーズで保管庫を作成してください。');
        await unlock(record.payload, passphrase, '');
        const cloudPayload = await decryptPayload(record.payload);
        const wrapper = await registerPasskeyCredential(user);
        const vault = loadActive();
        const existing = Array.isArray(vault.keyWraps.passkeys) ? vault.keyWraps.passkeys : (vault.keyWraps.passkey ? [vault.keyWraps.passkey] : []);
        if (existing.some((entry) => entry.id === wrapper.id)) throw new Error('このパスキーは既に登録されています。');
        const nextKeyWraps = Object.assign({}, vault.keyWraps, { passkeys: existing.concat(wrapper) });
        delete nextKeyWraps.passkey;
        saveActive({ rawKey: vault.rawKey, keyWraps: nextKeyWraps });
        await persistCredentialUpdate(token, user, cloudPayload, record.payload.keyWraps);
        return true;
      } catch (error) {
        if (previous) saveActive(previous); else clearActive();
        throw error;
      }
    });
  }
  async function removePasskeys(passphrase) {
    const previous = loadActive();
    return withSession(async (token, user) => {
      try {
        const record = await fetchRecord(token, user);
        if (!record) throw new Error('保管庫が見つかりません。');
        await unlock(record.payload, passphrase, '');
        const cloudPayload = await decryptPayload(record.payload);
        const vault = loadActive();
        const existing = Array.isArray(vault.keyWraps.passkeys) ? vault.keyWraps.passkeys : (vault.keyWraps.passkey ? [vault.keyWraps.passkey] : []);
        if (!existing.length) throw new Error('解除できるパスキーが登録されていません。');
        const keyWrapsBeforeRemoval = vault.keyWraps;
        const nextKeyWraps = Object.assign({}, keyWrapsBeforeRemoval); delete nextKeyWraps.passkeys; delete nextKeyWraps.passkey;
        saveActive({ rawKey: vault.rawKey, keyWraps: nextKeyWraps });
        await persistCredentialUpdate(token, user, cloudPayload, keyWrapsBeforeRemoval);
        return true;
      } catch (error) {
        if (previous) saveActive(previous); else clearActive();
        throw error;
      }
    });
  }
  async function changePassphrase(nextPassphrase) {
    const previous = loadActive();
    return withSession(async (token, user) => {
      try {
        if (!nextPassphrase || nextPassphrase.length < 12) throw new Error('新しいパスフレーズは12文字以上にしてください。');
        const record = await fetchRecord(token, user);
        if (!record) throw new Error('保管庫が見つかりません。');
        if (!previous) throw new Error('先に保管庫を開いてください。');
        const keyWraps = record.payload && record.payload.keyWraps;
        const passkeys = keyWraps && (Array.isArray(keyWraps.passkeys) ? keyWraps.passkeys : (keyWraps.passkey ? [keyWraps.passkey] : []));
        if (!passkeys || !passkeys.length) throw new Error('パスフレーズを再設定するには、保管庫パスキーが必要です。');
        const rawKey = await unlockByPasskey(passkeys);
        if (rawKey.length !== previous.rawKey.length || rawKey.some((byte, index) => byte !== previous.rawKey[index])) throw new Error('パスキーが現在開いている保管庫と一致しません。保管庫を再読込してください。');
        saveActive({ rawKey, keyWraps });
        const cloudPayload = await decryptPayload(record.payload);
        const salt = randomBytes(16); const passphraseKey = await derivePassphrase(nextPassphrase, salt);
        const nextKeyWraps = Object.assign({}, keyWraps, { passphrase: { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64url(salt) }, encryptedKey: await encrypt(passphraseKey, rawKey) } });
        saveActive({ rawKey, keyWraps: nextKeyWraps });
        await persistCredentialUpdate(token, user, cloudPayload, keyWraps);
        return true;
      } catch (error) {
        if (previous) saveActive(previous); else clearActive();
        throw error;
      }
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
  window.MangaVault = { SESSION_KEY, META_KEY, ACTIVE_KEY, loadSession, saveSession, clearActive, lockVault, loadActive, waitForActive, ensureSession, refreshSession, sessionIsFresh, isSessionAuthError, api, withSession, fetchRecordForUi, listVaultHistory, getVaultHistorySnapshot, setVaultHistoryProtected, previewVaultHistoryRestore, confirmVaultHistoryRestore, loadPayload, initialize, initializeWithPasskey, registerPasskey, removePasskeys, changePassphrase, savePayload, saveLocalChanges, syncLatest, syncStatutesLatest, resolveConflicts, recordSyncDeletion, markLocalChangesPending, hasPendingLocalChanges, guardPendingSyncLeave };
})();

