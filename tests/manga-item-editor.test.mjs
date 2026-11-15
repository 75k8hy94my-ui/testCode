import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../manga-item-editor.js', import.meta.url), 'utf8');
const context = { self: {}, URL };
vm.runInNewContext(source, context);
const { MangaItemEditor: editor } = context.self;
const sample = { id:'one', title:'旧題', url:'https://example.com/a', sourceUrls:['https://example.com/a'], addedAt:123 };
const folders = [{ id:'f1', name:'一般' }];
const form = (overrides = {}) => ({
  title:'新しいタイトル', author:'作者', circleName:'サークル', series:'シリーズ',
  sourceWork:'元ネタ', sourceUrl:'https://example.com/source', tags:'赤,青,赤',
  favorite:true, isDoujin:false, folderId:'f1',
  sourceUrls:['https://example.com/a', 'https://example.com/b'], ...overrides
});

test('single-item editor preserves identity and writes separate URL entries', () => {
  const result = editor.normalize(sample, form(), folders);
  assert.equal(result.id, 'one');
  assert.equal(result.addedAt, 123);
  assert.equal(result.title, '新しいタイトル');
  assert.equal(result.url, 'https://example.com/a');
  assert.equal(JSON.stringify(result.sourceUrls), JSON.stringify(['https://example.com/a', 'https://example.com/b']));
  assert.equal(JSON.stringify(result.tags), JSON.stringify(['赤', '青']));
  assert.equal(result.folderId, 'f1');
  assert.equal(result.favorite, true);
  assert.equal(sample.title, '旧題', 'editing must not mutate the saved reference until persistence succeeds');
});
test('single-item editor validates URL collection and folder', () => {
  assert.throws(() => editor.normalize(sample, form({title:''}), folders), /空欄/);
  assert.throws(() => editor.normalize(sample, form({sourceUrls:['javascript:alert(1)']}), folders), /http/);
  assert.throws(() => editor.normalize(sample, form({sourceUrls:[]}), folders), /空欄/);
  assert.throws(() => editor.normalize(sample, form({folderId:'missing'}), folders), /見つかりません/);
  const dup = editor.normalize(sample, form({sourceUrls:['https://example.com/a','https://example.com/a']}), folders);
  assert.equal(dup.sourceUrls.length, 1);
});
test('right-click Edit opens the individual editor, not the spreadsheet', () => {
  const route = fs.readFileSync(new URL('../manga-list-route.js', import.meta.url), 'utf8');
  assert.match(route, /MangaItemEditor\.create/);
  assert.match(route, /onEdit:\s*\(item\)\s*=>\s*individualEditor\.open\(item\.id\)/);
  assert.match(route, /spreadsheet\.destroy\(\)/);
  assert.match(route, /individualEditor\.destroy\(\)/);
});


test('individual editor preserves or removes optional numbered-page limits', () => {
  const bounded = editor.normalize(
    { ...sample, sourceUrls:['https://example.com/chapter#1'], url:'https://example.com/chapter#1' },
    form({ sourceUrls:['https://example.com/chapter#1'], pageRangeStart:'2', pageRangeEnd:'19' }), folders
  );
  assert.equal(bounded.pageRangeStart, 2);
  assert.equal(bounded.pageRangeEnd, 19);
  const reset = editor.normalize(bounded, form({ sourceUrls:['https://example.com/chapter#1'], pageRangeStart:'', pageRangeEnd:'' }), folders);
  assert.equal(reset.pageRangeStart, undefined);
  assert.equal(reset.pageRangeEnd, undefined);
  assert.throws(() => editor.normalize(sample, form({pageRangeStart:'20',pageRangeEnd:'19'}), folders), /終了ページ/);
  assert.throws(() => editor.normalize(sample, form({pageRangeStart:'0'}), folders), /1～2000/);
  assert.throws(() => editor.normalize(sample, form({sourceUrls:['https://example.com/cover'],pageRangeStart:'2'}), folders), /#1/);
});
