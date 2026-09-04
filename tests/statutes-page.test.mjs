import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('statutes page is vault-gated and loads statute, vault and liquid-glass dependencies', () => {
  const page = read('statutes.html');
  const behavior = read('statutes-page.js');
  assert.match(page, /class=["']auth-pending["']/);
  assert.match(page, /liquid-glass\.css/);
  assert.match(page, /statute-data\.js/);
  assert.match(page, /statutes-page\.js/);
  assert.match(page, /vault-session\.js/);
  assert.match(page, /vault-payload\.js/);
  assert.match(behavior, /MangaVault\.loadActive\(\)/);
  assert.match(behavior, /window\.location\.replace\(['"]sync\.html['"]\)/);
});

test('statutes page exposes search, refresh, article navigation and memo controls', () => {
  const page = read('statutes.html');
  const behavior = read('statutes-page.js');
  for (const id of ['lawTabs', 'articleSearch', 'refreshLawBtn', 'articleList', 'articleDetail', 'prevArticleBtn', 'nextArticleBtn', 'statuteMemo', 'memoCloseBtn', 'syncStatus']) {
    assert.match(page, new RegExp(`id=["']${id}["']`));
  }
  assert.match(behavior, /window\.MangaStatutes/);
  assert.match(behavior, /Statutes\.ensureLaw/);
  assert.match(behavior, /MangaVault\.savePayload\(MangaVaultPayload\.buildFromLocalStorage\(\)\)/);
  assert.match(behavior, /mangaReaderStatuteNotes/);
});

test('pending memo input is flushed before navigation changes article identity', () => {
  const behavior = read('statutes-page.js');
  assert.match(behavior, /function\s+flushPendingMemo\s*\(/);
  assert.match(behavior, /function\s+renderList\s*\(\)\s*\{\s*flushPendingMemo\(\)/);
  assert.match(behavior, /function\s+selectArticle\s*\(article\)\s*\{\s*flushPendingMemo\(\)/);
  assert.match(behavior, /async\s+function\s+selectLaw\s*\(id,force=false\)\s*\{\s*flushPendingMemo\(\)/);
  assert.match(behavior, /pagehide['"],\(\)=>flushPendingMemo\(\)/);
});
