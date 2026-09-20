import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const reader = read('reader.html');
const card = fs.existsSync(new URL('../manga-list-card.js', import.meta.url)) ? read('manga-list-card.js') : '';

test('reader loads the manga card boundary before its inline card consumer', () => {
  const script = 'manga-list-card.js?v=20260921-card-boundary';
  assert.equal((reader.match(/manga-list-card\.js\?v=[^"']+/g) || []).length, 1);
  assert.ok(reader.indexOf(`<script src="${script}"></script>`) < reader.indexOf('function buildBookCard('));
});

test('manga card boundary exposes only stateless static card creation', () => {
  assert.match(card, /root\.MangaListCardBoundary/);
  assert.match(card, /createStaticCard/);
  assert.doesNotMatch(card, /localStorage|MangaVault|supabase|location\.(assign|href)/i);
});

test('buildBookCard delegates static DOM creation and keeps interaction logic in reader', () => {
  assert.match(reader, /MangaListCardBoundary\.createStaticCard\(/);
  assert.match(reader, /bulkSelectedIds\.add\(item\.id\)/);
  assert.match(reader, /updateBulkEditButton\(\)/);
  assert.match(reader, /stopPropagation\(\)/);
  assert.match(reader, /loadLocalCover\(item, img\)/);
  assert.match(reader, /setupFeedImage\(img, item\.url, item\.numberWidth, item\.pagePattern\)/);
});

test('normal manga card clicks use one reader interaction boundary in the original order', () => {
  assert.equal((reader.match(/function handleMangaCardOpen\(/g) || []).length, 1);
  const boundaryStart = reader.indexOf('function handleMangaCardOpen(');
  const boundaryEnd = reader.indexOf('\n  function buildBookCard(', boundaryStart);
  const boundary = reader.slice(boundaryStart, boundaryEnd);
  const expected = [
    'rememberReaderReturnView()',
    "navigateReaderScreen('saved-list', { replace: true })",
    "switchListTab('manga')",
    'closeSavedList()',
    'setReadingListContext(list, list.indexOf(item))',
    "flashStatus('読み込み中…')",
    'openItem(item, false)'
  ];
  let previous = -1;
  for (const expression of expected) {
    const index = boundary.indexOf(expression);
    assert.ok(index > previous, expression);
    previous = index;
  }
  const buildStart = reader.indexOf('function buildBookCard(');
  const buildEnd = reader.indexOf('\n  function normalizeAuthorLinks(', buildStart);
  const build = reader.slice(buildStart, buildEnd);
  assert.match(build, /if \(!reorderMode && !bulkEditMode\) \{\s*card\.addEventListener\('click', \(\) => handleMangaCardOpen\(item, list\)\);/);
  assert.equal((boundary.match(/openItem\(item, false\)/g) || []).length, 1);
  assert.equal((build.match(/card\.addEventListener\('click'/g) || []).length, 1);
});

test('manga card boundary preserves the required card classes and image attributes', () => {
  assert.match(card, /book-card/);
  assert.match(card, /reorder-card/);
  assert.match(card, /just-closed/);
  assert.match(card, /img\.alt/);
  assert.match(card, /img\.loading = 'eager'/);
  assert.match(card, /img\.decoding = 'async'/);
  assert.match(card, /img\.fetchPriority = 'low'/);
  assert.match(card, /bulk-select/);
});
