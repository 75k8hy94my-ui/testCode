import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../home.html', import.meta.url), 'utf8');

test('home page loads encrypted chunk cache before inline logout controller', () => {
  assert.match(html, /<script src="encrypted-chunk-cache\.js"><\/script>/);
  const cacheScript = html.indexOf('encrypted-chunk-cache.js');
  const inlineController = html.indexOf("const config=window.MANGA_READER_SUPABASE");
  assert.ok(cacheScript >= 0 && cacheScript < inlineController);
});

test('logout clears the signed-in users encrypted index IndexedDB before redirect', () => {
  assert.match(html, /async function logout\(\)/);
  assert.match(html, /EncryptedChunkCache\.clearAll\(\{\s*dbName:\s*`\$\{EncryptedChunkCache\.DB_NAME\}:\$\{session\.user\.id\}`\s*\}\)/);
  const clearIndex = html.indexOf('EncryptedChunkCache.clearAll');
  const clearActiveIndex = html.indexOf('MangaVault.clearActive()', clearIndex);
  const redirectIndex = html.indexOf('showLogin()', clearActiveIndex);
  assert.ok(clearIndex >= 0 && clearActiveIndex > clearIndex && redirectIndex > clearActiveIndex);
});

test('logout cache cleanup fails closed locally but does not trap the user on the page', () => {
  assert.match(html, /try\s*\{\s*if\(session\.user&&session\.user\.id\)await EncryptedChunkCache\.clearAll[\s\S]*?\}\s*catch\s*\(_\)\s*\{\}/);
});
