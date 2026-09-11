import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../sync.html', import.meta.url), 'utf8');

test('vault passphrase screen exposes logout in the account dropdown', () => {
  assert.match(html, /id="accountMenuButton"/);
  assert.match(html, /id="accountMenu"/);
  assert.match(html, /id="vaultLogoutBtn"[^>]*>ログアウト<\/button>/);
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
