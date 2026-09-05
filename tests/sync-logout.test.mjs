import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../sync.html', import.meta.url), 'utf8');

test('vault passphrase screen exposes logout using the full local cleanup flow', () => {
  assert.match(html, /id="vaultLogoutBtn"[^>]*>ログアウト<\/button>/);
  assert.match(html, /encrypted-chunk-cache\.js/);
  assert.match(html, /MangaVault\.saveSession\(null\)/);
  assert.match(html, /MangaVault\.clearActive\(\)/);
  assert.match(html, /EncryptedChunkCache\.clearAll/);
  assert.match(html, /startsWith\('mangaReaderSavedVaultPassphrase:'\)/);
  assert.match(html, /vaultLogout\.addEventListener\('click',logout\)/);
});
