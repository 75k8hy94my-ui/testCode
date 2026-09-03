import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (name) => fs.existsSync(new URL(name, root)) ? fs.readFileSync(new URL(name, root), 'utf8') : '';
const html = read('index-search.html');
const pageJs = read('index-search-page.js');

test('legal index search page is authenticated and vault-gated', () => {
  assert.ok(html, 'index-search.html should exist');
  assert.match(html, /<html[^>]+class=["']auth-pending["']/i);
  assert.match(pageJs, /MangaVault\.loadSession\(\)/);
  assert.match(pageJs, /MangaVault\.loadActive\(\)/);
  assert.match(pageJs, /window\.location\.replace\(['"]index\.html['"]\)/);
  assert.match(pageJs, /window\.location\.replace\(['"]sync\.html['"]\)/);
});

test('legal index search page loads focused schema, search, crypto, cache, sync, and page modules', () => {
  for (const name of ['vault-session.js','vault-payload.js','legal-index-schema.js','legal-index-search.js','encrypted-chunk-crypto.js','encrypted-chunk-cache.js','encrypted-chunk-sync.js','index-search-page.js']) {
    assert.match(html, new RegExp(`<script[^>]+src=["'][^"']*${name.replace('.', '\\.')}[^"']*["']`, 'i'), `${name} should be loaded`);
  }
});

test('search page exposes Google-like query, kind tabs, book/subject filters, and settings', () => {
  for (const id of ['indexQuery','kindAll','kindMatter','kindCase','kindStatute','subjectFilter','bookFilter','indexSettingsBtn','indexManageBtn','indexResults','matchExact','matchPartial','matchAnd','matchFuzzy']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
  }
  assert.match(html, /すべて/);
  assert.match(html, /事項/);
  assert.match(html, /判例/);
  assert.match(html, /条文/);
});

test('management view supports multi-file JSON import, preview, new-or-replace choice, and book list', () => {
  for (const id of ['indexImportFiles','indexImportPreview','indexImportCommit','indexBookList']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
  }
  assert.match(html, /type=["']file["'][^>]*multiple/i);
  assert.match(html, /\.json/);
  assert.match(html, /新規追加/);
  assert.match(html, /既存書籍を置換/);
});

test('page search is local-first and imports persist only encrypted chunk payloads', () => {
  assert.match(pageJs, /LegalIndexSearch\.search\(/);
  assert.match(pageJs, /EncryptedChunkCrypto\.encryptChunk\(/);
  assert.match(pageJs, /EncryptedChunkCrypto\.decryptChunk\(/);
  assert.match(pageJs, /EncryptedChunkCache\.put\(/);
  assert.doesNotMatch(pageJs, /localStorage\.setItem\([^\n]*(?:matterEntries|caseEntries|statuteEntries)/);
});

test('static verifier covers the new protected page and standalone modules', () => {
  const verifier = read('scripts/check-static.mjs');
  assert.match(verifier, /['"]index-search\.html['"]/);
  for (const name of ['legal-index-schema.js','legal-index-search.js','encrypted-chunk-crypto.js','encrypted-chunk-cache.js','encrypted-chunk-sync.js','index-search-page.js']) {
    assert.match(verifier, new RegExp(`["']${name.replace('.', '\\.')}["']`), `${name} should be statically verified`);
  }
});
