'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../manga-spreadsheet.js');
const model = globalThis.MangaSpreadsheetModel;
const column = key => model.COLUMNS.find(c => c.key === key);
const sample = { id:'i-123', title:'本', url:'https://example.com/1.webp' };
const folders = [{id:'folder-a',name:'漫画'},{id:'folder-b',name:'資料'}];

test('worksheet columns include editable metadata and protected identity', () => {
  assert.equal(model.COLUMNS.length, 15);
  assert.equal(model.cellAddress(0, 0), 'A2');
  assert.equal(model.cellAddress(4, 14), 'O6');
  assert.equal(column('id').readOnly, true);
  assert.equal(column('addedAt').readOnly, true);
  assert.throws(() => model.parseValue(sample, column('id'), 'changed', folders), /変更できません/);
});

test('worksheet validation preserves item identity and prevents empty titles', () => {
  assert.equal(model.parseValue(sample, column('title'), '  新しい作品  ', folders), '新しい作品');
  assert.throws(() => model.parseValue(sample, column('title'), '  ', folders), /空欄/);
  assert.equal(sample.title, '本');
  assert.equal(sample.id, 'i-123');
});

test('folders map display names to existing IDs without creating new folders', () => {
  assert.equal(model.parseValue(sample, column('folderId'), '資料', folders), 'folder-b');
  assert.equal(model.parseValue(sample, column('folderId'), 'folder-a', folders), 'folder-a');
  assert.equal(model.parseValue(sample, column('folderId'), '', folders), null);
  assert.throws(() => model.parseValue(sample, column('folderId'), '存在しない', folders), /ありません/);
  assert.equal(model.formatValue({folderId:'folder-a'}, column('folderId'), folders), '漫画');
});

test('tags are de-duplicated and boolean cells accept spreadsheet values', () => {
  assert.deepEqual(model.parseValue(sample, column('tags'), '青、赤, 青, 緑', folders), ['青','赤','緑']);
  assert.equal(model.parseValue(sample, column('favorite'), 'TRUE', folders), true);
  assert.equal(model.parseValue(sample, column('isDoujin'), 'FALSE', folders), false);
  assert.throws(() => model.parseValue(sample, column('favorite'), 'maybe', folders), /TRUE/);
});

test('URL fields cannot be changed to executable schemes or malformed URLs', () => {
  assert.equal(model.parseValue(sample, column('url'), 'https://example.com/1.webp', folders), 'https://example.com/1.webp');
  assert.throws(() => model.parseValue(sample, column('url'), 'javascript:alert(1)', folders), /http/);
  assert.throws(() => model.parseValue(sample, column('sourceUrl'), 'http://user:pass@example.com', folders), /http/);
  assert.equal(model.parseValue(sample, column('url'), '', folders), '', 'an empty URL cell is allowed when another URL remains; final persistence validates the whole collection');
  assert.equal(model.parseValue({id:'encrypted',encryptedAssets:{pages:[{}]}}, column('url'), '', folders), '');
});

test('every manga URL occupies one column and additional URL columns are expandable', () => {
  const item = { ...sample, sourceUrls: [
    'https://example.com/1.webp', 'https://example.com/book#1'
  ] };
  assert.equal(model.formatValue(item, column('url'), folders), 'https://example.com/1.webp');
  model.ensureUrlColumns(3);
  assert.equal(model.formatValue(item, column('url2'), folders), 'https://example.com/book#1');
  assert.equal(model.formatValue(item, column('url3'), folders), '');
  assert.equal(model.parseValue(item, column('url2'), 'https://example.com/new#1', folders), 'https://example.com/new#1');
  assert.throws(() => model.parseValue(item, column('url'), 'https://example.com/1.webp | https://example.com/2.webp', folders), /1セルに1件/);
  assert.throws(() => model.parseValue(item, column('url2'), 'javascript:alert(1)', folders), /http/);
  assert.equal(model.COLUMNS.findIndex(col => col.key === 'url3'), model.COLUMNS.findIndex(col => col.key === 'url2') + 1);
  assert.equal(model.cellAddress(0, 26), 'AA2');
  assert.equal(model.ensureUrlColumns(40), 40);
  assert.equal(model.COLUMNS.filter(col => col.type === 'url' && col.key !== 'sourceUrl').length, 40);
  assert.equal(model.ensureUrlColumns(45), 40);
});

test('URL changes retain the entire source array for atomic undo and redo', () => {
  const { readFileSync } = require('node:fs');
  const sheet = readFileSync(require.resolve('../manga-spreadsheet.js'), 'utf8');
  assert.match(sheet, /patches\.push\(\{ id, key:'sourceUrls', before, after:next \}\)/);
  assert.match(sheet, /if \(changes\.has\('sourceUrls'\)\) updated\.url = updated\.sourceUrls\[0\]/);
  assert.match(sheet, /data-ms="addUrl"/);
  assert.match(sheet, /Pasting multiple URLs horizontally/);
});

test('multi-cell clipboard paste normalizes line endings without an extra row', () => {
  assert.deepEqual(model.clipboardMatrix('作品A\t作者A\r\n作品B\t作者B\r\n'),
    [['作品A','作者A'],['作品B','作者B']]);
});

test('worksheet URL has a distinct browser-history state without dropping manga filters', () => {
  const shelf = 'https://site.test/manga.html?sort=recent&page=2#shelf';
  const sheet = model.spreadsheetUrl(shelf, true);
  assert.equal(sheet, 'https://site.test/manga.html?sort=recent&page=2&view=spreadsheet#shelf');
  assert.equal(model.isSpreadsheetUrl(shelf), false);
  assert.equal(model.isSpreadsheetUrl(sheet), true);
  assert.equal(model.spreadsheetUrl(sheet, true), sheet, 'opening twice must not duplicate the view parameter');
  assert.equal(model.spreadsheetUrl(sheet, false), shelf);
  assert.equal(model.spreadsheetUrl('https://site.test/manga.html?view=custom', false),
    'https://site.test/manga.html?view=custom');
});

test('spreadsheet registers browser Back/Forward without rebuilding the shelf route', () => {
  const { readFileSync } = require('node:fs');
  const sheet = readFileSync(require.resolve('../manga-spreadsheet.js'), 'utf8');
  const spa = readFileSync(require.resolve('../home-profile-spa.js'), 'utf8');
  assert.match(sheet, /win\.history\.pushState\(state/);
  assert.match(sheet, /win\.history\.back\(\)/);
  assert.match(sheet, /win\?\.addEventListener\?\.\('popstate', onHistoryChange\)/);
  assert.match(sheet, /win\?\.removeEventListener\?\.\('popstate', onHistoryChange\)/);
  assert.match(spa, /isWorksheetHistoryChange\(previous,lastSpaUrl\)/);
});


test('worksheet range cells allow blank defaults and validate integers', () => {
  assert.equal(model.formatValue(sample, column('pageRangeStart'), folders), '');
  assert.equal(model.parseValue(sample, column('pageRangeStart'), '2', folders), 2);
  assert.equal(model.parseValue(sample, column('pageRangeEnd'), '19', folders), 19);
  assert.equal(model.parseValue(sample, column('pageRangeStart'), '', folders), null);
  assert.equal(model.parseValue(sample, column('pageRangeStart'), '1', folders), null);
  assert.throws(() => model.parseValue(sample, column('pageRangeStart'), '-1', folders), /1～2000/);
  assert.throws(() => model.parseValue(sample, column('pageRangeEnd'), '2.5', folders), /1～2000/);
  const sheet = require('node:fs').readFileSync(require.resolve('../manga-spreadsheet.js'), 'utf8');
  assert.match(sheet, /終了ページは開始ページ以上/);
  assert.match(sheet, /changes\.get\('pageRangeStart'\)/);
});
