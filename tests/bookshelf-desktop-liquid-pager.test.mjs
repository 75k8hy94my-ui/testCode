import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('desktop shelf has only one pair of accessible page buttons with SVG chevrons', () => {
  const scope = {};
  vm.runInNewContext(read('manga-list-template.js'), scope);
  const markup = scope.MangaListTemplate.createMarkup();
  for (const id of ['bookshelfPagination', 'bookshelfPrevBtn', 'bookshelfNextBtn', 'bookshelfPageLabel']) {
    assert.equal((markup.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  }
  assert.match(markup, /id="bookshelfPrevBtn"[^>]*aria-label="前のページ"/);
  assert.match(markup, /id="bookshelfNextBtn"[^>]*aria-label="次のページ"/);
  assert.equal((markup.match(/class="bookshelfPagerGlyph"/g) || []).length, 2);
  assert.match(markup, /id="bookshelfPageLabel"[^>]*aria-live="polite"/);
});

test('Liquid Glass pagination is fixed at desktop bottom, centered, themed and keyboard-accessible', () => {
  const css = read('manga-list.css');
  const desktop = css.slice(css.indexOf('/* Desktop shelf controls:'));
  assert.match(desktop, /@media \(min-width: 900px\)/);
  assert.match(desktop, /#mangaListSection \.bookshelf-pagination\s*\{[^}]*position:\s*fixed;[^}]*bottom:/);
  assert.match(desktop, /left:\s*50%/);
  assert.match(desktop, /transform:\s*translateX\(-50%\)/);
  assert.match(desktop, /backdrop-filter:\s*blur\(30px\)/);
  assert.match(desktop, /html\[data-theme="light"\] #mangaListSection \.bookshelf-pagination/);
  assert.match(desktop, /\.bookshelfPagerButton:focus-visible/);
  assert.match(desktop, /\.bookshelfPagerButton:disabled/);
  assert.match(desktop, /#routeContent > #mangaListSection[^}]*padding-bottom:\s*116px/);
  assert.match(desktop, /@supports not \(\(backdrop-filter/);
});

test('desktop pager reuses shelf pagination events, Reader remains independent', () => {
  const route = read('manga-list-route.js');
  const runtime = read('manga-list-runtime.js');
  assert.match(route, /bindFactory\(MangaListPaginationEventsFactory/);
  assert.match(route, /runtime\.renderSavedList\(delta\)/);
  assert.match(runtime, /desktopPersistentPager:.*min-width: 900px/);
  assert.doesNotMatch(read('reader.html'), /bookshelfPagerGlyph|desktopPersistentPager/);
});
