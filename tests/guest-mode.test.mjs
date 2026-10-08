import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function store() {
  const data = new Map();
  return {
    getItem(key) { return data.has(String(key)) ? data.get(String(key)) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    clear() { data.clear(); },
    key(index) { return Array.from(data.keys())[index] ?? null; },
    get length() { return data.size; },
    entries: () => [...data.entries()],
  };
}
function loadGuest(local, session, page = 'home.html') {
  const navigation = [];
  const window = {
    localStorage: local, sessionStorage: session,
    location: { pathname: '/testCode/' + page, replace(path) { navigation.push(path); } },
  };
  const document = { documentElement: { dataset: {} } };
  vm.runInNewContext(read('guest-mode.js'), { window, document, Proxy, Reflect });
  return { window, document, navigation };
}

test('login button enters guest without a Supabase request or an account vault', () => {
  const local = store(), session = store();
  const login = loadGuest(local, session, 'index.html');
  assert.equal(login.window.TestCodeGuest.isActive(), false);
  assert.match(read('index.html'), /id="guestLoginButton"[^>]*>ログインせずに使う/);
  assert.match(read('index.html'), /TestCodeGuest\.begin\(\)/);
  login.window.TestCodeGuest.begin();
  assert.equal(session.getItem('testCode.guestMode.v1'), '1');
  assert.deepEqual(login.navigation, ['home.html']);
});

test('guest localStorage, sessionStorage, enumeration and clear never expose or mutate real account keys', () => {
  const local = store(), session = store();
  local.setItem('mangaReaderSupabaseSession', '{"refresh_token":"ACCOUNT"}');
  local.setItem('mangaReaderSavedItems', '[{"id":"account-secret"}]');
  session.setItem('mangaReaderActiveVault', '{"rawKey":"secret"}');
  session.setItem('testCode.guestMode.v1', '1');

  const guest = loadGuest(local, session);
  assert.equal(guest.window.TestCodeGuest.isActive(), true);
  assert.equal(guest.window.localStorage.getItem('mangaReaderSupabaseSession'), null);
  assert.equal(guest.window.localStorage.getItem('mangaReaderSavedItems'), null);
  assert.equal(guest.window.sessionStorage.getItem('mangaReaderActiveVault'), null);
  guest.window.localStorage.setItem('mangaReaderSavedItems', '[{"id":"guest"}]');
  guest.window.sessionStorage.setItem('mangaReaderActiveVault', 'GUEST');
  guest.window.localStorage.someDebugSetting = 'on';
  assert.equal(guest.window.localStorage.someDebugSetting, 'on');
  const keys = Object.keys(guest.window.localStorage).sort();
  assert.deepEqual(keys, ['mangaReaderSavedItems', 'someDebugSetting']);
  assert.equal(guest.window.localStorage.length, 2);
  assert.ok(guest.window.localStorage.key(0));
  assert.equal(local.getItem('mangaReaderSavedItems'), '[{"id":"account-secret"}]');
  assert.equal(local.getItem('testCode.guest.v1.local.mangaReaderSavedItems'), '[{"id":"guest"}]');
  assert.equal(session.getItem('mangaReaderActiveVault'), '{"rawKey":"secret"}');
  guest.window.localStorage.clear();
  assert.equal(guest.window.localStorage.length, 0);
  assert.equal(local.getItem('mangaReaderSavedItems'), '[{"id":"account-secret"}]');
  assert.equal(session.getItem('mangaReaderActiveVault'), '{"rawKey":"secret"}');
});

test('guest data persists between pages, exit only clears guest mode and login sees original account', () => {
  const local = store(), session = store();
  local.setItem('mangaReaderSupabaseSession', '{"user":"account"}');
  session.setItem('testCode.guestMode.v1', '1');
  const first = loadGuest(local, session, 'manga.html');
  first.window.localStorage.setItem('mangaReaderSavedItems', '["test"]');
  const second = loadGuest(local, session, 'reader.html');
  assert.equal(second.window.localStorage.getItem('mangaReaderSavedItems'), '["test"]');
  second.window.TestCodeGuest.exit();
  assert.equal(session.getItem('testCode.guestMode.v1'), null);
  assert.deepEqual(second.navigation, ['index.html']);
  const normal = loadGuest(local, session, 'index.html');
  assert.equal(normal.window.TestCodeGuest.isActive(), false);
  assert.equal(normal.window.localStorage.getItem('mangaReaderSupabaseSession'), '{"user":"account"}');
  assert.equal(normal.window.localStorage.getItem('mangaReaderSavedItems'), null);
  assert.equal(local.getItem('testCode.guest.v1.local.mangaReaderSavedItems'), '["test"]');
});

test('VPN checker does no network or status probe for an isolated guest', async () => {
  const window = {
    TestCodeGuest: { isActive: () => true },
    fetch() { throw new Error('guest must not check external VPN service'); },
  };
  vm.runInNewContext(read('media-access-gate.js'), { window, globalThis: window });
  const gate = window.MangaReaderMediaAccess;
  assert.equal(gate.canReadProtectedData(), true);
  assert.equal(gate.canLoadExternalMedia(), true);
  assert.equal(gate.getStatus(), 'allowed');
  assert.equal(gate.mediaUrl('https://example.com/picture.jpg'), 'https://example.com/picture.jpg');
  assert.equal(await gate.checkVpn(), true);
  assert.equal(gate.getDiagnostics().final, 'guest');
});

test('guest bootstrap comes before account/vault scripts and sync calls have explicit guards', () => {
  for (const page of ['home.html','profile.html','manga.html','video.html','reader.html','video-player.html','video-edit.html','images.html','drive-gallery.html','sync.html']) {
    const src = read(page);
    assert.ok(src.indexOf('guest-mode.js') < src.indexOf('vault-session.js'), page);
  }
  assert.match(read('game/index.html'), /\.\.\/guest-mode\.js/);
  const spa = read('home-profile-spa.js');
  assert.match(spa, /if\(guestMode\)\{[\s\S]*document\.documentElement\.classList\.remove\('auth-pending'\)/);
  assert.match(spa, /function canSyncProtectedData\(\)\{if\(guestMode\)return false/);
  assert.match(read('reader.html'), /canSync: \(\) => !window\.TestCodeGuest\?\.isActive\(\)/);
  assert.match(read('video-library.js'), /if \(window\.TestCodeGuest\?\.isActive\(\)\) return;/);
  assert.match(read('vault-session.js'), /if \(window\.TestCodeGuest\?\.isActive\(\)\) return;/);
  assert.match(read('public-drive-gallery.js'), /Keep external API credentials in memory only/);
  assert.match(read('images.js'), /window\.GuestPhotoLibrary\.start\(\)/);
  assert.match(read('guest-photos.js'), /testCode-guest-photo-library-v1/);
});
