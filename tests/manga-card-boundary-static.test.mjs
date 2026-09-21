import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const reader = read('reader.html');
const card = fs.existsSync(new URL('../manga-list-card.js', import.meta.url)) ? read('manga-list-card.js') : '';
const runtime = read('manga-list-runtime.js');

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
  assert.match(runtime, /context\.createStaticCard\(/);
  assert.match(runtime, /state\.bulkSelectedIds\.add\(item\.id\)/);
  assert.match(runtime, /context\.updateBulkEditButton\(\)/);
  assert.match(runtime, /stopPropagation\(\)/);
  assert.match(runtime, /context\.loadLocalCover\(item, img\)/);
  assert.match(runtime, /context\.setupFeedImage\(img, item\.url, item\.numberWidth, item\.pagePattern\)/);
});

test('normal manga card clicks use one reader interaction boundary in the original order', () => {
  assert.equal((reader.match(/function handleMangaCardOpen\(/g) || []).length, 1);
  const boundary = runtime;
  const expected = [
    'context.rememberReaderReturnView()',
    "context.navigateReaderScreen('saved-list', { replace: true })",
    "context.switchListTab('manga')",
    'context.closeSavedList()',
    'context.setReadingListContext(list, list.indexOf(item))',
    "context.flashStatus('読み込み中…')",
    'context.openItem(item, false)'
  ];
  let previous = -1;
  for (const expression of expected) {
    const index = boundary.indexOf(expression);
    assert.ok(index > previous, expression);
    previous = index;
  }
  const buildStart = runtime.indexOf('function buildBookCard(');
  const buildEnd = runtime.indexOf('\n    function renderSavedList(', buildStart);
  const build = runtime.slice(buildStart, buildEnd);
  assert.match(build, /if \(!reorderMode && !state\.bulkEditMode\) \{\s*card\.addEventListener\('click', \(\) => context\.openReader\(item, list\)\);/);
  const openStart = boundary.indexOf('function handleMangaCardOpen(');
  const openEnd = boundary.indexOf('\n    function buildFolderCard(', openStart);
  assert.equal((boundary.slice(openStart, openEnd).match(/context\.openItem\(item, false\)/g) || []).length, 1);
  assert.equal((build.match(/card\.addEventListener\('click'/g) || []).length, 1);
});

test('buildBookCard uses one private cover dependency boundary without changing image branches', () => {
  assert.equal((reader.match(/const mangaListCoverDeps = Object\.freeze\(/g) || []).length, 1);
  const start = reader.indexOf('const mangaListCoverDeps = Object.freeze(');
  const end = reader.indexOf('\n  function handleMangaCardOpen(', start);
  const deps = reader.slice(start, end);
  assert.match(deps, /loadLocalCover/);
  assert.match(deps, /setupFeedImage/);
  assert.match(deps, /coverSourceCache/);
  assert.doesNotMatch(deps, /checkVpn|media-access-gate|MangaVault|localStorage|new Map|new Set/);

  const build = runtime;
  assert.match(build, /context\.loadLocalCover\(item, img\)/);
  assert.match(build, /coverSourceCache\.get\(source\)/);
  assert.match(build, /coverSourceCache\.set\(source, img\.currentSrc \|\| img\.src\)/);
  assert.match(build, /context\.setupFeedImage\(img, item\.url, item\.numberWidth, item\.pagePattern\)/);
  assert.equal((build.match(/context\.loadLocalCover\(item, img\)/g) || []).length, 1);
  assert.equal((build.match(/context\.setupFeedImage\(/g) || []).length, 1);
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
