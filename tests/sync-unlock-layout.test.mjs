import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sync = fs.readFileSync(new URL('../sync.html', import.meta.url), 'utf8');

test('sync unlock screen matches the minimal single-field layout', () => {
  assert.match(sync, /<h1>同期コード<\/h1>/);
  assert.match(sync, /id="accountMenuButton"[^>]*><span id="accountEmail"><\/span> でログイン中<\/button>/);
  assert.match(sync, /<form id="unlockForm"[\s\S]*<input id="vaultCredential"[^>]*type="password"/);
  assert.doesNotMatch(sync, /id="recoveryKey"/);
  assert.doesNotMatch(sync, /id="passphraseUnlockBtn"/);
  assert.doesNotMatch(sync, /id="createVaultBtn"/);
});

test('account control opens the requested three-item dropdown only', () => {
  const menu = sync.match(/<div id="accountMenu"[\s\S]*?<\/div>/);
  assert.ok(menu, 'accountMenu must exist');
  assert.match(menu[0], /id="vaultLogoutBtn"[^>]*>ログアウト<\/button>/);
  assert.match(menu[0], /id="passkeyRegisterBtn"[^>]*>パスキー登録<\/button>/);
  assert.match(menu[0], /id="passkeyUseBtn"[^>]*>パスキーを使う<\/button>/);
});

test('sync unlock view does not add explanatory copy absent from the supplied layout', () => {
  const unlockView = sync.match(/<div id="unlockView"[\s\S]*?<\/div>\s*<div id="recoveryBox"/);
  assert.ok(unlockView, 'unlockView must exist');
  const html = unlockView[0];
  assert.doesNotMatch(html, /パスフレーズで開く|保管庫を作成|保管庫パスフレーズ|または復旧キー|入力すると/);
});

test('sync unlock layout stays inside the viewport without page scrolling', () => {
  assert.match(sync, /html, body \{[\s\S]*height:100%;[\s\S]*overflow:hidden;/);
  assert.match(sync, /body \{[\s\S]*height:100dvh;/);
  assert.match(sync, /main \{[\s\S]*height:100dvh;/);
  assert.match(sync, /env\(safe-area-inset-top\)/);
  assert.match(sync, /env\(safe-area-inset-bottom\)/);
});

test('single credential field accepts recovery keys through the existing unlock API', () => {
  assert.match(sync, /const credential=ui\.credential\.value/);
  assert.match(sync, /const isRecovery=credential\.trim\(\)\.startsWith\('mrk1_'\)/);
  assert.match(sync, /MangaVault\.initialize\(isRecovery \? '' : credential,isRecovery \? credential\.trim\(\) : ''/);
  assert.match(sync, /ui\.unlockForm\.addEventListener\('submit',unlockFromCredential\)/);
});

test('passkey can be invoked manually and automatically when a registered wrapper exists', () => {
  assert.match(sync, /MangaVault\.initializeWithPasskey\(applyPayload\)/);
  assert.match(sync, /passkeyUseBtn\.addEventListener\('click',usePasskey\)/);
  assert.match(sync, /async function autoUsePasskey\(\)/);
  assert.match(sync, /keyWraps\.passkeys|keyWraps\.passkey/);
  assert.match(sync, /autoUsePasskey\(\)/);
});

test('passkey registration uses the existing credential field without adding another input', () => {
  assert.match(sync, /async function registerPasskey\(\)/);
  assert.match(sync, /MangaVault\.registerPasskey\(credential\)/);
  assert.match(sync, /passkeyRegisterBtn\.addEventListener\('click',registerPasskey\)/);
});
