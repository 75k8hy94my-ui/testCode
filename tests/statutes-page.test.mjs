import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('statutes page is vault-gated and loads statute, vault and liquid-glass dependencies', () => {
  const page = read('statutes.html');
  assert.match(page, /class=["']auth-pending["']/);
  assert.match(page, /liquid-glass\.css/);
  assert.match(page, /statute-data\.js/);
  assert.match(page, /vault-session\.js/);
  assert.match(page, /vault-payload\.js/);
  assert.match(page, /MangaVault\.loadActive\(\)/);
  assert.match(page, /window\.location\.replace\(['"]sync\.html['"]\)/);
});

test('statutes page exposes search, refresh, article navigation and memo controls', () => {
  const page = read('statutes.html');
  for (const id of ['lawTabs', 'articleSearch', 'refreshLawBtn', 'articleList', 'articleDetail', 'prevArticleBtn', 'nextArticleBtn', 'statuteMemo', 'memoCloseBtn', 'syncStatus']) {
    assert.match(page, new RegExp(`id=["']${id}["']`));
  }
  assert.match(page, /window\.MangaStatutes/);
  assert.match(page, /Statutes\.ensureLaw/);
  assert.match(page, /MangaVault\.savePayload\(MangaVaultPayload\.buildFromLocalStorage\(\)\)/);
  assert.match(page, /mangaReaderStatuteNotes/);
});
