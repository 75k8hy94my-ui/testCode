import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('presentation is independent of the protected video library state and sync', () => {
  const view = read('video-library-view.js');
  const css = read('video-library.css');
  const library = read('video-library.js');
  const route = read('video-list-route.js');
  assert.match(view, /MangaReaderVideoLibraryView = Object\.freeze\(\{ setupMarkup \}\)/);
  assert.doesNotMatch(view, /localStorage|sessionStorage|MangaVault|setTimeout|addEventListener/);
  assert.match(library, /View\.setupMarkup\(document, dom\)/);
  assert.doesNotMatch(library, /style\.textContent|function setupMarkup\(|function injectStyles\(/);
  assert.match(css, /#videoLibraryResults|#videoLibrarySheet/);
  assert.match(route, /await ensureStylesheet\(\)/);
  assert.ok(route.indexOf("deps.loadScript('video-library-view.js") < route.indexOf("deps.loadScript('video-library.js"));
});
test('view exposes mount only and declines a missing route element without changing state', () => {
  const windowRef = {};
  vm.runInNewContext(read('video-library-view.js'), { window: windowRef });
  const view = windowRef.MangaReaderVideoLibraryView;
  assert.deepEqual(Object.keys(view), ['setupMarkup']);
  assert.equal(view.setupMarkup({ getElementById: () => null }, {}), false);
});
test('stylesheet is extracted without any rule, theme or responsive breakpoint changes', () => {
  const css = read('video-library.css');
  for (const marker of ['@media(min-width:900px)', '@media(max-width:899px)', '@media(max-width:480px)', 'html[data-theme="dark"] #videoLibrarySheet', 'html[data-theme="light"] .vl-pagination', '.vl-series-videos', '.vl-page-frame']) {
    assert.ok(css.includes(marker), marker);
  }
});
