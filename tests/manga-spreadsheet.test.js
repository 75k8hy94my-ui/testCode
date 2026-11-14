'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../manga-spreadsheet.js');
const model = globalThis.MangaSpreadsheetModel;
const column = key => model.COLUMNS.find(c => c.key === key);
const sample = { id:'i-123', title:'本', url:'https://example.com/1.webp' };
const folders = [{id:'folder-a',name:'漫画'},{id:'folder-b',name:'資料'}];

test('worksheet columns include editable metadata and protected identity', () => {
  assert.equal(model.COLUMNS.length, 13);
  assert.equal(model.cellAddress(0, 0), 'A2');
  assert.equal(model.cellAddress(4, 12), 'M6');
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
  assert.throws(() => model.parseValue(sample, column('url'), '', folders), /空欄/);
  assert.equal(model.parseValue({id:'encrypted',encryptedAssets:{pages:[{}]}}, column('url'), '', folders), '');
});

test('multi-cell clipboard paste normalizes line endings without an extra row', () => {
  assert.deepEqual(model.clipboardMatrix('作品A\t作者A\r\n作品B\t作者B\r\n'),
    [['作品A','作者A'],['作品B','作者B']]);
});
