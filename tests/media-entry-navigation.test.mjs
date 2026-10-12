import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('shared add page supports manga/video entry while lists hide legacy add buttons', () => {
  assert.match(source('add.html'), /id="mangaAddForm"/);
  assert.match(source('add.html'), /video-edit\.html\?mode=add/);
  assert.match(source('add.html'), /id="mangaBatchImport"/);
  assert.match(source('manga-list.css'), /#exportImportRow/);
  assert.match(source('video-library.js'), /#videoLibraryAdd\{display:none!important\}/);
  assert.match(source('media-add.js'), /markLocalChangesPending/);
});
test('shared nav search only targets current manga or video page', () => {
  const context = source('context-search.js');
  assert.match(context, /testcode-context-search-change/);
  assert.match(context, /name === 'manga\.html'/);
  assert.match(context, /name === 'video\.html'/);
  for (const file of ['app-desktop-rail.js', 'mobile-bottom-nav.js']) {
    assert.match(source(file), /[Ss]earch/);
    assert.match(source(file), /add\.html/);
  }
  assert.match(source('manga-list-route.js'), /testcode-context-search-change/);
  assert.match(source('video-library.js'), /testcode-context-search-change/);
  for (const file of ['home.html', 'profile.html', 'manga.html', 'video.html']) {
    assert.match(source(file), /context-search\.js/);
  }
});