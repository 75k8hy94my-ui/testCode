import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('profile exposes passkey setup and removal plus passphrase reset controls', () => {
  const spa = read('home-profile-spa.js');
  assert.match(spa, /id="profilePasskeyRegisterBtn"/);
  assert.match(spa, /id="profilePasskeyRemoveBtn"/);
  assert.match(spa, /id="profilePassphraseResetBtn"/);
  assert.match(spa, /MangaVault\.registerPasskey\(/);
  assert.match(spa, /MangaVault\.removePasskeys\(/);
  assert.match(spa, /MangaVault\.changePassphrase\(/);
});

test('profile passphrase reset requires a confirmed replacement and passkey instead of the current passphrase', () => {
  const spa = read('home-profile-spa.js');
  assert.match(spa, /id="profileCurrentPassphrase"[^>]*type="password"/);
  assert.match(spa, /id="profileNewPassphrase"[^>]*type="password"/);
  assert.match(spa, /id="profileNewPassphraseConfirm"[^>]*type="password"/);
  assert.match(spa, /profileNewPassphraseConfirm/);
  assert.match(spa, /パスキーで本人確認/);
  assert.match(spa, /changePassphrase\(next\.value\)/);
  assert.doesNotMatch(spa, /現在と新しいパスフレーズを入力してください/);
});

test('vault session exposes passkey removal and passphrase rewrapping APIs', () => {
  const vault = read('vault-session.js');
  assert.match(vault, /async function removePasskeys\(passphrase\)/);
  assert.match(vault, /async function changePassphrase\(nextPassphrase\)/);
  assert.match(vault, /removePasskeys,/);
  assert.match(vault, /changePassphrase,/);
  const reset = vault.slice(vault.indexOf('async function changePassphrase'), vault.indexOf('async function initializeWithPasskey'));
  assert.match(reset, /Object\.assign\(\{\}, keyWraps, \{ passphrase:/);
  assert.doesNotMatch(reset, /delete nextKeyWraps\.passkeys|delete nextKeyWraps\.passkey/);
  assert.match(reset, /unlockByPasskey\(passkeys/);
  assert.match(reset, /if \(!previous\)/);
  assert.match(reset, /rawKey.*previous\.rawKey|previous\.rawKey.*rawKey/s);
  const removal = vault.slice(vault.indexOf('async function removePasskeys'), vault.indexOf('async function changePassphrase'));
  assert.match(removal, /delete nextKeyWraps\.passkeys/);
  assert.match(removal, /delete nextKeyWraps\.passkey/);
});
