import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('registration and both edit surfaces expose start/end fields', () => {
  for (const file of ['add.html', 'manga-item-editor.js', 'manga-spreadsheet.js']) {
    const body = read(file);
    assert.match(body, /pageRangeStart/, file);
    assert.match(body, /pageRangeEnd/, file);
  }
  const form = read('media-add.js');
  assert.match(form, /MangaSourceType\.parsePageRange/);
  assert.match(form, /pageRangeStart: range\.start/);
  assert.match(form, /pageRangeEnd: range\.end/);
});

test('reader resolves numbered pages and clamps hash page navigation to requested bounds', () => {
  const reader = read('reader-runtime.js');
  const source = read('reader-page-source.js');
  assert.match(reader, /hashRangeStart/);
  assert.match(reader, /hashRangeEnd/);
  assert.match(reader, /slider\.min = String\(hashPageBase \? hashRangeStart : 1\)/);
  assert.match(reader, /number > hashUpperLimit\(\)/);
  assert.match(source, /for \(let number = firstPage; number <= lastPage;/);
  assert.match(source, /rangeSignature/);
});

test('page-range changes invalidate old numbered-page cache and retain relative cover start', () => {
  const cover = read('manga-list-host-runtime.js');
  const source = read('reader-page-source.js');
  assert.match(cover, /hashPageUrl\(hashBase, coverStart\)/);
  assert.match(cover, /pageUrlFor\(folderUrl, coverStart,/);
  assert.match(source, /manifest\?\.rangeSignature !== signature/);
});

test('all relevant entry pages reference range-aware assets', () => {
  const add = read('add.html');
  const reader = read('reader.html');
  const manga = read('manga-list-route.js');
  assert.match(add, /manga-source-type\.js\?v=20261115-page-range/);
  assert.match(add, /media-add\.js\?v=20261115-page-range/);
  assert.match(reader, /reader-runtime\.js\?v=20261115-page-range/);
  assert.match(reader, /reader-page-source\.js\?v=20261115-page-range/);
  assert.match(manga, /manga-spreadsheet\.js\?v=20261115-page-range/);
  assert.match(manga, /manga-item-editor\.js\?v=20261115-page-range/);
});
