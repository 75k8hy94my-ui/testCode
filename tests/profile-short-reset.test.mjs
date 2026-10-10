import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('profile offers the Shorts queue reset and wires it through the protected state API', () => {
  const spa = read('home-profile-spa.js');
  const reset = read('profile-shorts-reset.js');
  assert.match(spa, /id="profileShortsResetBtn"/);
  assert.match(spa, /id="profileShortsResetStatus"/);
  assert.match(spa, /const shortsReset=window\.MangaReaderProfileShortsReset/);
  assert.match(spa, /shortsReset\.createHandler\(/);
  assert.match(reset, /state\.reset\(\)/);
  assert.match(spa, /canReadProtectedData\(\)/);
  assert.match(spa, /再生順をリセット/);
});

test('profile loads Shorts state support before mounting its SPA settings view', () => {
  const html = read('profile.html');
  assert.ok(html.indexOf('vault-payload.js') < html.indexOf('video-shorts-state.js'));
  assert.ok(html.indexOf('video-shorts-state.js') < html.indexOf('profile-shorts-reset.js'));
  assert.ok(html.indexOf('profile-shorts-reset.js') < html.indexOf('home-profile-spa.js'));
});

test('reset visibly reports the local save and background cloud-sync progress', async () => {
  const source = fs.existsSync(new URL('../profile-shorts-reset.js', import.meta.url))
    ? read('profile-shorts-reset.js')
    : '';
  const module = { exports: {} };
  vm.runInNewContext(source, { module, setTimeout, clearTimeout });
  const createHandler = module.exports.createHandler;
  assert.equal(typeof createHandler, 'function', 'profile reset handler should expose its observable operation');
  if (typeof createHandler !== 'function') return;

  const listeners = new Map();
  const eventTarget = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  };
  const documentRef = { addEventListener() {}, removeEventListener() {} };
  const button = {
    disabled: false,
    textContent: '再生順をリセット',
  };
  const status = { textContent: '', dataset: {} };
  let releasePaint;
  const resetHandler = createHandler({
    button,
    status,
    documentRef,
    eventTarget,
    getAccess: () => ({ canReadProtectedData: () => true }),
    getState: () => ({ reset: () => {
      eventTarget.dispatchEvent({ type: 'manga-video-shorts-state-saved', detail: { pending: true, state: { generation: 3 } } });
      return { generation: 3 };
    } }),
    isGuestMode: () => false,
    yieldToPaint: () => new Promise((resolve) => { releasePaint = resolve; }),
    syncTimeoutMs: 1000,
  });
  const operation = resetHandler();
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'リセット中…');
  assert.match(status.textContent, /再生順をリセットしています/);

  releasePaint();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(status.textContent, /クラウドに保存中/);
  eventTarget.dispatchEvent({ type: 'manga-video-shorts-sync', detail: { status: 'saved' } });
  await operation;
  assert.match(status.textContent, /クラウドにも保存しました/);
  assert.equal(button.textContent, '再生順をリセット');
  assert.equal(button.disabled, false);
});

test('disabled reset button explains VPN checking and blocked access', () => {
  const module = { exports: {} };
  vm.runInNewContext(read('profile-shorts-reset.js'), { module, setTimeout, clearTimeout });
  const refreshAccess = module.exports.refreshAccess;
  assert.equal(typeof refreshAccess, 'function', 'profile should expose the reset access-state presentation');
  if (typeof refreshAccess !== 'function') return;

  const button = { disabled: false };
  const status = { textContent: '', dataset: {} };
  refreshAccess({ button, status, access: { getStatus: () => 'checking', canReadProtectedData: () => false }, resetAvailable: true });
  assert.equal(button.disabled, true);
  assert.match(status.textContent, /VPN接続を確認中/);

  refreshAccess({ button, status, access: { getStatus: () => 'blocked', canReadProtectedData: () => false }, resetAvailable: true });
  assert.equal(button.disabled, true);
  assert.match(status.textContent, /VPNアクセスが許可されると/);

  refreshAccess({ button, status, access: { getStatus: () => 'allowed', canReadProtectedData: () => true }, resetAvailable: true });
  assert.equal(button.disabled, false);
  assert.equal(status.textContent, '');
});
