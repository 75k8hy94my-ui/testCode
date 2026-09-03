import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('index search page is authenticated, vault-gated and loads focused encrypted-index modules', () => {
  const html = read('index-search.html');
  assert.match(html, /<html[^>]+class=["']auth-pending["']/i);
  assert.match(html, /app-desktop-rail\.js/);
  assert.match(html, /supabase-config\.js/);
  assert.match(html, /vault-session\.js/);
  assert.match(html, /vault-payload\.js/);
  for (const script of ['legal-index-schema.js', 'legal-index-search.js', 'encrypted-chunk-crypto.js', 'encrypted-chunk-cache.js', 'encrypted-chunk-sync.js', 'index-search-page.js']) {
    assert.match(html, new RegExp(script.replace('.', '\\.')));
  }
  const page = read('index-search-page.js');
  assert.match(page, /MangaVault\.loadSession\(\)/);
  assert.match(page, /MangaVault\.loadActive\(\)/);
  assert.match(page, /window\.location\.replace\(['"]index\.html['"]\)/);
  assert.match(page, /window\.location\.replace\(['"]sync\.html['"]\)/);
});

test('search surface exposes live query, kind tabs, book/subject filters and configurable match modes', () => {
  const html = read('index-search.html');
  for (const id of ['indexQuery', 'kindTabs', 'subjectFilters', 'bookFilters', 'searchResults', 'matchExact', 'matchPartial', 'matchAnd', 'matchFuzzy']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const kind of ['all', 'matter', 'case', 'statute']) assert.match(html, new RegExp(`data-kind=["']${kind}["']`));
  const page = read('index-search-page.js');
  assert.match(page, /addEventListener\(['"]input['"]/);
  assert.match(page, /LegalIndexSearch\.search/);
  assert.match(page, /setTimeout\([^,]+,\s*\d+\)/);
});

test('batch import accepts multiple JSON files, validates each and supports new or explicit replacement', () => {
  const html = read('index-search.html');
  assert.match(html, /id=["']indexFiles["'][^>]+multiple/i);
  assert.match(html, /accept=["'][^"']*\.json/i);
  assert.match(html, /id=["']importPreview["']/);
  const page = read('index-search-page.js');
  assert.match(page, /const\s+MAX_IMPORT_CONCURRENCY\s*=\s*4/);
  assert.match(page, /LegalIndexSchema\.validateBookFile/);
  assert.match(page, /new-book/);
  assert.match(page, /replace-book/);
  assert.match(page, /existingBookId/);
  assert.match(page, /Promise\.all/);
});

test('book corpus is encrypted before persistent cache and search settings alone use the monolithic vault', () => {
  const page = read('index-search-page.js');
  assert.match(page, /EncryptedChunkCrypto\.encryptChunk/);
  assert.match(page, /cache\.put/);
  assert.match(page, /MangaVaultPayload\.buildFromLocalStorage/);
  assert.match(page, /MangaVault\.savePayload/);
  assert.doesNotMatch(page, /localStorage\.setItem\([^\n]*(indexBooks|matterEntries|caseEntries|statuteEntries)/i);
  assert.match(page, /rawKey/);
});

test('rendering writes imported legal text through textContent rather than HTML injection', () => {
  const page = read('index-search-page.js');
  assert.match(page, /textContent\s*=/);
  assert.doesNotMatch(page, /innerHTML\s*=\s*[^'"`]/);
});

test('index search page controller is syntactically valid classic JavaScript', () => {
  new vm.Script(read('index-search-page.js'), { filename: 'index-search-page.js' });
});
