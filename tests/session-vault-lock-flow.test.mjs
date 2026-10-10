import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vault = fs.readFileSync('./vault-session.js', 'utf8');
const profileMenu = fs.readFileSync('./profile-menu.js', 'utf8');
const profileSpa = fs.readFileSync('./home-profile-spa.js', 'utf8');
const sync = fs.readFileSync('./sync.html', 'utf8');
const index = fs.readFileSync('./index.html', 'utf8');
const conflictUi = fs.readFileSync('./vault-conflict-ui.js', 'utf8');

test('saved Supabase sessions are reused until the access token nears expiry', () => {
  assert.match(vault, /function sessionIsFresh\(session, skewSeconds = 60\)/);
  assert.match(vault, /async function ensureSession\(\)/);
  assert.match(vault, /window\.MangaVault = \{[^}]*\bensureSession\b/);
  assert.match(vault, /if \(sessionIsFresh\(current\)\) return current;/);
  assert.match(vault, /return refreshSession\(\);/);
  assert.match(index, /MangaVault\.ensureSession\(\)/);
  assert.match(profileSpa, /MangaVault\.ensureSession\(\)/);
  assert.match(sync, /MangaVault\.ensureSession\(\)/);
});

test('vault lock clears only the active vault key and keeps account session intact', () => {
  const start = profileMenu.indexOf('function lock(button)');
  const end = profileMenu.indexOf('function openProfile()', start);
  const body = profileMenu.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /MangaVault\.lockVault\(\)|MangaVault\.clearActive\(\)/);
  assert.match(body, /sync\.html/);
  assert.doesNotMatch(body, /saveSession\(null\)/);
  assert.doesNotMatch(body, /localStorage\.removeItem/);
  assert.match(conflictUi, /manga-vault-cleared/);
  assert.match(conflictUi, /location\.replace\('sync\.html\?next='/);
  assert.match(conflictUi, /TestCodeGuest\?\.isActive\(\)/);
});

test('full logout still clears auth session and device-local protected data', () => {
  const start = profileMenu.indexOf('async function logout(button)');
  const end = profileMenu.indexOf('function lock(button)', start);
  const body = profileMenu.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /MangaVault\.clearActive\(\)/);
  assert.match(body, /MangaVault\.saveSession\(null\)/);
  assert.match(body, /EncryptedChunkCache\.clearAll/);
  assert.match(body, /DEVICE_DATA_KEYS\(\)\.forEach/);
});

test('profile UI distinguishes lock from complete logout', () => {
  assert.match(profileMenu, /data-lock>ロック</);
  assert.match(profileMenu, /アカウントからログアウト/);
  assert.match(profileSpa, /id="profileLockBtn"/);
  assert.match(profileSpa, /id="profileLogoutBtn"/);
});

test('active vault proceeds normally and pending sync offers explicit conflict resolution', () => {
  assert.ok(sync.includes('const alreadyActive=Boolean(MangaVault.loadActive());'));
  assert.ok(sync.includes('if (MangaVault.hasPendingLocalChanges()) showPendingSync'));
  assert.ok(sync.includes('else { goReader(); return; }'));
  assert.match(sync, /vault-conflict-ui\.js\?v=20261010-vault-sync-audit/);
  assert.match(profileMenu, /hasPendingLocalChanges/);
  assert.match(profileMenu, /ログアウトは行いませんでした/);
  assert.ok(sync.includes('if (!alreadyActive) autoUsePasskey();'));
});
