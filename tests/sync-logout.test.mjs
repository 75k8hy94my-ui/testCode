import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../sync.html', import.meta.url), 'utf8');

test('vault passphrase screen exposes logout in the account dropdown', () => {
  assert.match(html, /id="accountMenuButton"/);
  assert.match(html, /id="accountMenu"/);
  assert.match(html, /id="vaultLogoutBtn"[^>]*>アカウントからログアウト<\/button>/);
  assert.match(html, /vaultLogout\.addEventListener\('click',logout\)/);
});

test('logout asks for confirmation before clearing local/session data', () => {
  assert.match(html, /confirm\('ログアウトしてよろしいですか？'\)/);
  assert.match(html, /if \(!confirm\('ログアウトしてよろしいですか？'\)\) return;/);
  assert.match(html, /encrypted-chunk-cache\.js/);
  assert.match(html, /MangaVault\.saveSession\(null\)/);
  assert.match(html, /MangaVault\.clearActive\(\)/);
  assert.match(html, /EncryptedChunkCache\.clearAll/);
  assert.match(html, /startsWith\('mangaReaderSavedVaultPassphrase:'\)/);
});

test('pending encrypted changes are saved for logout even when VPN access is unavailable', () => {
  const profile = fs.readFileSync(new URL('../profile-menu.js', import.meta.url), 'utf8');
  const profileBody = profile.slice(profile.indexOf('async function logout(button)'), profile.indexOf('function lock(button)'));
  const syncBody = html.slice(html.indexOf('async function logout()'), html.indexOf('async function unlockFromCredential'));
  assert.match(profileBody, /if \(MangaVault\.loadActive\?\.\(\)\) await MangaVault\.saveLocalChanges\(\)/);
  assert.match(syncBody, /if \(MangaVault\.loadActive\(\)\) await MangaVault\.saveLocalChanges\(\)/);
  assert.doesNotMatch(profileBody, /canReadProtectedData/);
  assert.doesNotMatch(syncBody, /canReadProtectedData/);
});

test('transient session refresh errors stay on the vault screen instead of redirecting to login', () => {
  assert.match(html, /if \(typeof MangaVault\.isSessionAuthError === 'function' && MangaVault\.isSessionAuthError\(error\)\) \{\s*MangaVault\.saveSession\(null\);\s*window\.location\.replace\('index\.html'\);\s*return;\s*\}\s*setStatus\('保存済みのログイン状態を確認できませんでした。通信状況を確認して再読み込みしてください。'\);\s*return;/);
});
