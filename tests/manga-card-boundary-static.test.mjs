import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const route = read('manga-list-route.js');
const card = fs.existsSync(new URL('../manga-list-card.js', import.meta.url)) ? read('manga-list-card.js') : '';
const runtime = read('manga-list-runtime.js');

test('manga route loads the card boundary as a shelf dependency', () => {
  assert.match(route, /manga-list-card\.js\?v=/);
  assert.match(route, /MangaListRuntimeFactory\.create\(/);
  assert.doesNotMatch(read('reader.html'), /manga-list-card|MangaListRuntime/);
});

test('manga card boundary exposes only stateless static card creation', () => {
  assert.match(card, /root\.MangaListCardBoundary/);
  assert.match(card, /createStaticCard/);
  assert.doesNotMatch(card, /localStorage|MangaVault|supabase|location\.(assign|href)/i);
});

test('buildBookCard delegates static DOM creation and keeps shelf interaction in its runtime', () => {
  assert.match(runtime, /context\.createStaticCard\(/);
  assert.match(runtime, /state\.bulkSelectedIds\.add\(item\.id\)/);
  assert.match(runtime, /context\.updateBulkEditButton\(\)/);
  assert.match(runtime, /stopPropagation\(\)/);
  assert.match(runtime, /context\.loadLocalCover\(item, img\)/);
  assert.match(runtime, /context\.setupFeedImage\(img, item\.url, item\.numberWidth, item\.pagePattern, item\.id\)/);
});

test('normal manga card clicks use one shelf interaction boundary', () => {
  assert.match(runtime, /function handleMangaCardOpen\(item, list\) \{\s*return context\.openReader\(item, list\);/);
  const buildStart = runtime.indexOf('function buildBookCard(');
  const buildEnd = runtime.indexOf('\n    function renderSavedList(', buildStart);
  const build = runtime.slice(buildStart, buildEnd);
  assert.match(build, /if \(!reorderMode && !state\.bulkEditMode\) \{\s*card\.addEventListener\('click', \(\) => context\.openReader\(item, list\)\);/);
  assert.equal((build.match(/card\.addEventListener\('click'/g) || []).length, 1);
});

test('buildBookCard uses one private cover dependency boundary without changing image branches', () => {
  assert.match(route, /loadLocalCover: host\.loadLocalCover/);
  assert.match(route, /setupFeedImage: host\.setupFeedImage/);
  assert.match(route, /getCoverSourceCache: \(\) => coverSourceCache/);

  const build = runtime;
  assert.match(build, /context\.loadLocalCover\(item, img\)/);
  assert.match(build, /coverSourceCache\.get\(source\)/);
  assert.match(build, /coverSourceCache\.set\(source, img\.currentSrc \|\| img\.src\)/);
  assert.match(build, /context\.setupFeedImage\(img, item\.url, item\.numberWidth, item\.pagePattern, item\.id\)/);
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
