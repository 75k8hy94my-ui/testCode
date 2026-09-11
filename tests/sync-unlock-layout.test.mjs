import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sync = fs.readFileSync(new URL('../sync.html', import.meta.url), 'utf8');

test('sync unlock screen matches the minimal single-field layout', () => {
  assert.match(sync, /<h1>同期コード<\/h1>/);
  assert.match(sync, /id="accountLogout"[^>]*><span id="accountEmail"><\/span> でログイン中<\/button>/);
  assert.match(sync, /<form id="unlockForm"[\s\S]*<input id="vaultCredential"[^>]*type="password"/);
  assert.doesNotMatch(sync, /id="recoveryKey"/);
  assert.doesNotMatch(sync, /id="passphraseUnlockBtn"/);
  assert.doesNotMatch(sync, /id="passkeyUnlockBtn"/);
  assert.doesNotMatch(sync, /id="createVaultBtn"/);
  assert.doesNotMatch(sync, /id="passkeyRegisterBtn"/);
});

test('sync unlock view does not show copy absent from the supplied layout', () => {
  const unlockView = sync.match(/<div id="unlockView"[\s\S]*?<\/div>\s*<div id="recoveryBox"/);
  assert.ok(unlockView, 'unlockView must exist');
  const html = unlockView[0];
  assert.doesNotMatch(html, /パスフレーズで開く|パスキーで開く|保管庫を作成|パスキーを登録|ログアウト|保管庫パスフレーズ|または復旧キー|入力すると/);
});

test('single credential field accepts recovery keys through the existing unlock API', () => {
  assert.match(sync, /const credential=ui\.credential\.value/);
  assert.match(sync, /const isRecovery=credential\.trim\(\)\.startsWith\('mrk1_'\)/);
  assert.match(sync, /MangaVault\.initialize\(isRecovery \? '' : credential,isRecovery \? credential\.trim\(\) : ''/);
  assert.match(sync, /ui\.unlockForm\.addEventListener\('submit',unlockFromCredential\)/);
});
