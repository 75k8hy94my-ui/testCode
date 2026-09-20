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
