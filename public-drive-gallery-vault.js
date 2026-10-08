(function (root) {
  'use strict';
  const VERSION = 1;
  const TYPE = 'testcode-drive-gallery-settings';
  const SALT = new TextEncoder().encode('testCode:DriveGallery:v1');
  const INFO = new TextEncoder().encode('drive-gallery-settings');
  const FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;
  const API_KEY_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
  function base64url(bytes) {
    let value = '';
    for (const byte of bytes) value += String.fromCharCode(byte);
    return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function fromBase64url(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 25000) throw new Error('暗号化設定の形式が不正です。');
    const value64 = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(value64 + '='.repeat((4 - value64.length % 4) % 4)), c => c.charCodeAt(0));
  }
  function validateSettings(input) {
    if (!input || !FOLDER_ID_PATTERN.test(String(input.folderId || ''))) throw new Error('フォルダIDが正しくありません。');
    if (!API_KEY_PATTERN.test(String(input.apiKey || ''))) throw new Error('Google Drive APIキーを確認してください。');
    return { folderId: input.folderId, apiKey: input.apiKey };
  }
  async function deriveKey(rawKey) {
    if (!(rawKey instanceof Uint8Array) || rawKey.byteLength !== 32) throw new Error('保管庫を解錠してください。');
    const keyMaterial = await root.crypto.subtle.importKey('raw', rawKey, 'HKDF', false, ['deriveKey']);
    return root.crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: INFO },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }
  async function encryptSettings(rawKey, input) {
    const settings = validateSettings(input);
    const iv = new Uint8Array(12);
    root.crypto.getRandomValues(iv);
    const key = await deriveKey(rawKey);
    const data = new TextEncoder().encode(JSON.stringify(settings));
    const encrypted = await root.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { type: TYPE, version: VERSION, iv: base64url(iv), ciphertext: base64url(new Uint8Array(encrypted)) };
  }
  async function decryptSettings(rawKey, payload) {
    if (!payload || payload.type !== TYPE || payload.version !== VERSION) throw new Error('暗号化設定の形式が不正です。');
    const iv = fromBase64url(payload.iv);
    if (iv.byteLength !== 12) throw new Error('暗号化設定のIVが不正です。');
    const ciphertext = fromBase64url(payload.ciphertext);
    if (ciphertext.byteLength < 16) throw new Error('暗号化設定の内容が不正です。');
    try {
      const key = await deriveKey(rawKey);
      const bytes = await root.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      return validateSettings(JSON.parse(new TextDecoder().decode(bytes)));
    } catch (_) {
      throw new Error('保存済み設定を復号できません。保管庫を再読込してください。');
    }
  }
  const api = { VERSION, TYPE, encryptSettings, decryptSettings, validateSettings };
  if (typeof module !== 'undefined') module.exports = api;
  root.PublicDriveGalleryVault = api;
})(typeof window === 'undefined' ? globalThis : window);
