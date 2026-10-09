import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../manga-list-route.js', import.meta.url), 'utf8');
const card = fs.readFileSync(new URL('../manga-list-card.js', import.meta.url), 'utf8');
const viewModel = fs.readFileSync(new URL('../manga-list-view-model.js', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../manga-list-runtime.js', import.meta.url), 'utf8');

test('reorder mode preserves the savedItems-derived display order instead of re-sorting it', () => {
  assert.match(viewModel, /if \(!reorderMode\)\s*\{\s*if \(sort === 'title-asc'\)/);
  assert.match(route, /deriveViewModel: \(input\) => MangaListViewModel\.derive\(input\)/);
});

test('moveItemInList swaps only adjacent saved items and persists the result', () => {
  assert.match(route, /const moveItemInList = \(item, list, direction\)/);
  assert.match(route, /const index = list\.indexOf\(item\)/);
  assert.match(route, /host\.persistAll\(\); renderList\(\);/);
});

test('reorder controls and manga card boundary remain unchanged', () => {
  assert.match(runtime, /e\.stopPropagation\(\); context\.moveItemInList\(item, list, -1\)/);
  assert.match(runtime, /e\.stopPropagation\(\); context\.moveItemInList\(item, list, 1\)/);
  assert.match(card, /createStaticCard/);
});

test('manual ordering fix does not change storage or video ownership boundaries', () => {
  assert.match(route, /savedItems: 'mangaReaderSavedItems'/);
  assert.match(route, /saveLocalChanges: \(\) => windowRef\.MangaVault\.saveLocalChanges\(\)/);
  assert.match(route, /host\.persistAll\(\)/);
  assert.match(route, /scheduleCloudSync: host\.scheduleCloudSync/);
  assert.match(route, /persistItems: host\.persistItems/);
  assert.doesNotMatch(fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8'), /manga-list-runtime|MangaListViewModel/);
});
