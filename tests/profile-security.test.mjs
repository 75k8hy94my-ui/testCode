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

test('profile security controls require the current passphrase and confirm a replacement', () => {
  const spa = read('home-profile-spa.js');
  assert.match(spa, /id="profileCurrentPassphrase"[^>]*type="password"/);
  assert.match(spa, /id="profileNewPassphrase"[^>]*type="password"/);
  assert.match(spa, /id="profileNewPassphraseConfirm"[^>]*type="password"/);
  assert.match(spa, /profileNewPassphraseConfirm/);
});

test('vault session exposes passkey removal and passphrase rewrapping APIs', () => {
  const vault = read('vault-session.js');
  assert.match(vault, /async function removePasskeys\(passphrase\)/);
  assert.match(vault, /async function changePassphrase\(passphrase, nextPassphrase\)/);
  assert.match(vault, /removePasskeys,/);
  assert.match(vault, /changePassphrase,/);
  const reset = vault.slice(vault.indexOf('async function changePassphrase'), vault.indexOf('async function initializeWithPasskey'));
  assert.match(reset, /Object\.assign\(\{\}, vault\.keyWraps, \{ passphrase:/);
  assert.doesNotMatch(reset, /delete nextKeyWraps\.passkeys|delete nextKeyWraps\.passkey/);
  const removal = vault.slice(vault.indexOf('async function removePasskeys'), vault.indexOf('async function changePassphrase'));
  assert.match(removal, /delete nextKeyWraps\.passkeys/);
  assert.match(removal, /delete nextKeyWraps\.passkey/);
});
