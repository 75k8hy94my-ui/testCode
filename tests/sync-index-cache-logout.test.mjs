import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const menu = fs.readFileSync(new URL('../profile-menu.js', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../home.html', import.meta.url), 'utf8');

test('home page loads encrypted chunk cache before the shared logout controller', () => {
  assert.match(home, /<script src="encrypted-chunk-cache\.js"><\/script>/);
  const cacheScript = home.indexOf('encrypted-chunk-cache.js');
  const menuScript = home.indexOf('profile-menu.js');
  assert.ok(cacheScript >= 0 && menuScript > cacheScript);
});

test('logout clears the signed-in users encrypted index IndexedDB before redirect', () => {
  assert.match(menu, /async function logout\(/);
  assert.match(menu, /EncryptedChunkCache\.clearAll\(\{\s*dbName:`\$\{EncryptedChunkCache\.DB_NAME\}:\$\{session\.user\.id\}`\s*\}\)/);
  const clearIndex = menu.indexOf('EncryptedChunkCache.clearAll');
  const clearActiveIndex = menu.indexOf('MangaVault.clearActive()', clearIndex);
  const redirectIndex = menu.indexOf("window.location.replace('index.html')", clearActiveIndex);
  assert.ok(clearIndex >= 0 && clearActiveIndex > clearIndex && redirectIndex > clearActiveIndex);
});

test('logout cache cleanup fails closed locally but does not trap the user on the page', () => {
  assert.match(menu, /try\s*\{\s*if \(session && session\.user && session\.user\.id && window\.EncryptedChunkCache\) await EncryptedChunkCache\.clearAll[\s\S]*?\}\s*catch\s*\(_\)\s*\{\}/);
});
