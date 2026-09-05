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
  async function unlockByPasskey(wrappers) {
    if (!passkeySupported()) throw new Error('このブラウザはパスキーに対応していません。');
    const rpId = passkeyRpId();
    const entries = Array.isArray(wrappers) ? wrappers : [wrappers];
    const allowCredentials = entries.map((entry) => ({ type: 'public-key', id: toArrayBuffer(fromB64url(entry.id)) }));
    const evalByCredential = {};
    entries.forEach((entry) => { evalByCredential[entry.id] = { first: toArrayBuffer(fromB64url(entry.salt)) }; });
    const credential = await navigator.credentials.get({ publicKey: {
      challenge: toArrayBuffer(randomBytes(32)), rpId, allowCredentials, userVerification: 'required', timeout: 60000,
      extensions: { prf: { evalByCredential } }
    }});
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
  function getMeta(userId) { return readJSON(META_KEY, {})[userId] || null; }
  function setMeta(userId, value) { const meta = readJSON(META_KEY, {}); meta[userId] = value || null; localStorage.setItem(META_KEY, JSON.stringify(meta)); }
  function assertConfig() { if (!config.url || !config.publishableKey) throw new Error('Supabase の設定が見つかりません。'); }
  async function api(path, options = {}) {
    assertConfig();
    const headers = Object.assign({ apikey: config.publishableKey }, options.headers || {});
    if (options.token) headers.Authorization = 'Bearer ' + options.token;
    if (options.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(config.url + path, Object.assign({}, options, { headers }));
    if (!response.ok) { const detail = await response.text().catch(() => ''); throw new Error('通信に失敗しました (' + response.status + ')' + (detail ? '。' + detail.slice(0, 140) : '')); }
    return response.status === 204 ? null : response.json();
  }
  async function refreshSession() { const current = loadSession(); if (!current || !current.refresh_token) throw new Error('ログインしてください。'); const next = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: current.refresh_token }) }); saveSession(next); return next; }
  async function withSession(work) { let session = loadSession(); if (!session) throw new Error('ログインしてください。'); try { return await work(session.access_token, session.user); } catch (error) { if (!String(error.message || '').includes('(401)')) throw error; session = await refreshSession(); return work(session.access_token, session.user); } }
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
  async function savePayload(payload) {
    return withSession(async (token, user) => {
      const existing = await fetchRecord(token, user); if (existing && existing.legacyRevision) throw new Error('Supabaseのrevision migrationが未適用です。supabase-schema.sqlをSQL Editorで実行してから保存してください。');
      const known = getMeta(user.id); const knownRevision = typeof known === 'object' ? known.revision : null;
      if (existing && knownRevision == null) throw new Error('保管庫の同期状態を確認できません。保管庫を再読込してから変更してください。');
      if (existing && !known) throw new Error('保管庫を読み込んでから変更してください。');
      if (existing) { const rows = await api('/rest/v1/rpc/update_manga_reader_vault', { method: 'POST', token, body: JSON.stringify({ expected_revision: knownRevision, new_payload: await envelope(payload) }) }); if (!rows || !rows.length) throw new Error('別の端末で更新されています。現在の端末の変更はまだ残っています。クラウドを再読込してから再試行してください。'); setMeta(user.id, rows[0]); return Object.assign({}, existing, rows[0]); }
      const rows = await api('/rest/v1/manga_reader_vaults?on_conflict=user_id', { method: 'POST', token, headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ user_id: user.id, payload: await envelope(payload), revision: 1 }) });
      const row = rows && rows[0]; if (row) setMeta(user.id, { revision: row.revision || 1, updatedAt: row.updated_at }); return row;
    });
  }
  async function initialize(passphrase, recoveryCode, applyPayload, createPayload) {
    return withSession(async (token, user) => {
      const record = await fetchRecord(token, user);
      if (!record) { const created = await create(passphrase); await applyPayload(createPayload()); const rows = await api('/rest/v1/manga_reader_vaults', { method: 'POST', token, headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, payload: await envelope(createPayload()), revision: 1 }) }); const row = rows && rows[0]; if (row) setMeta(user.id, { revision: row.revision || 1, updatedAt: row.updated_at }); return { created: true, recoveryCode: created.recoveryCode }; }
      await unlock(record.payload, passphrase, recoveryCode); await applyPayload(await decryptPayload(record.payload)); setMeta(user.id, { revision: record.revision || 1, updatedAt: record.updated_at }); return { created: false };
    });
  }
  async function registerPasskey(passphrase) {
    return withSession(async (token, user) => {
      const record = await fetchRecord(token, user); if (!record) throw new Error('先にパスフレーズで保管庫を作成してください。'); await unlock(record.payload, passphrase, ''); setMeta(user.id, { revision: record.revision || 1, updatedAt: record.updated_at });
      const wrapper = await registerPasskeyCredential(user); const vault = loadActive(); const existing = Array.isArray(vault.keyWraps.passkeys) ? vault.keyWraps.passkeys : (vault.keyWraps.passkey ? [vault.keyWraps.passkey] : []);
      if (existing.some((entry) => entry.id === wrapper.id)) throw new Error('このパスキーは既に登録されています。'); vault.keyWraps.passkeys = existing.concat(wrapper); delete vault.keyWraps.passkey; saveActive(vault); const payload = await decryptPayload(record.payload); await savePayload(payload); return true;
    });
  }
  async function initializeWithPasskey(applyPayload) {
    return withSession(async (token, user) => {
      const record = await fetchRecord(token, user); const keyWraps = record && record.payload && record.payload.keyWraps; const passkeys = keyWraps && (Array.isArray(keyWraps.passkeys) ? keyWraps.passkeys : (keyWraps.passkey ? [keyWraps.passkey] : []));
      if (!passkeys || !passkeys.length) throw new Error('このアカウントには保管庫パスキーが登録されていません。'); const rawKey = await unlockByPasskey(passkeys); const vault = { rawKey, keyWraps: record.payload.keyWraps }; saveActive(vault); await applyPayload(await decryptPayload(record.payload)); setMeta(user.id, { revision: record.revision || 1, updatedAt: record.updated_at }); return { created: false };
    });
  }
  window.MangaVault = { SESSION_KEY, META_KEY, ACTIVE_KEY, loadSession, saveSession, clearActive, loadActive, refreshSession, api, withSession, fetchRecordForUi, initialize, initializeWithPasskey, registerPasskey, savePayload };
})();