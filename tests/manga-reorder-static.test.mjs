import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
const card = fs.readFileSync(new URL('../manga-list-card.js', import.meta.url), 'utf8');
const viewModel = fs.readFileSync(new URL('../manga-list-view-model.js', import.meta.url), 'utf8');

test('reorder mode preserves the savedItems-derived display order instead of re-sorting it', () => {
  assert.match(viewModel, /if \(!reorderMode\)\s*\{\s*if \(sort === 'title-asc'\)/);
  assert.match(reader, /MangaListViewModel\.derive\(/);
});

test('moveItemInList swaps only adjacent saved items and persists the result', () => {
  assert.match(reader, /function moveItemInList\(item, list, direction\)/);
  assert.match(reader, /const idx = list\.indexOf\(item\);/);
  assert.match(reader, /const swapIdx = idx \+ direction;/);
  assert.match(reader, /savedItems\[realIdxA\] = other;/);
  assert.match(reader, /savedItems\[realIdxB\] = item;/);
  assert.match(reader, /persistAll\(\);\s*renderSavedList\(\);/);
});

test('reorder controls and manga card boundary remain unchanged', () => {
  assert.match(reader, /e\.stopPropagation\(\); moveItemInList\(item, list, -1\)/);
  assert.match(reader, /e\.stopPropagation\(\); moveItemInList\(item, list, 1\)/);
  assert.match(card, /createStaticCard/);
});

test('manual ordering fix does not change storage or video ownership boundaries', () => {
  assert.match(reader, /const SAVED_ITEMS_KEY\s*=\s*['"]mangaReaderSavedItems['"]/);
  assert.match(reader, /MangaVault\.savePayload\(buildSyncPayload\(\)\)/);
  assert.match(reader, /scheduleCloudSync\(\)/);
  assert.match(reader, /persistItems\(\)/);
});
