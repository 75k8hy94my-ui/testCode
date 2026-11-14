import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const importerContext = { self: {}, URL, TextEncoder };
vm.runInNewContext(read('manga-json-import.js'), importerContext);
const importer = importerContext.self.MangaJsonImport;
const extractorContext = { self: {}, URL };
vm.runInNewContext(read('extensions/manga-json-exporter/extractor.js'), extractorContext);
const extractor = extractorContext.self.TestCodeMangaJsonExtractor;
const item = {
  title: '作品A', author: '作者A', url: 'https://images.example.org/g/1.webp',
  sourceUrl: 'https://site.example.org/post/1', circleName: 'サークル', sourceWork: '',
  tags: ['漫画']
};
const json = items => JSON.stringify({ format: 'testcode-manga-import', version: 1, items });

test('JSON import parses valid works and returns independent normalized arrays', () => {
  const parsed = importer.parse(json([item, { ...item, url: 'https://images.example.org/other/1.webp' }]));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].url, item.url);
  assert.deepEqual(Array.from(parsed[0].tags), item.tags);
  assert.notEqual(parsed[0].tags, item.tags);
});
test('JSON import rejects invalid protocol, page number, malformed metadata, and oversized collections', () => {
  assert.throws(() => importer.parse('{bad json'));
  assert.throws(() => importer.parse(JSON.stringify([item])));
  for (const url of ['javascript:alert(1)', 'http://images.example.org/g/1.webp', 'https://images.example.org/g/2.webp', 'https://user:pass@images.example.org/g/1.webp']) {
    assert.throws(() => importer.parse(json([{ ...item, url }])));
  }
  assert.throws(() => importer.parse(json([{ ...item, title: '' }])));
  assert.throws(() => importer.parse(json(Array(501).fill(item))));
});
test('JSON import checks duplicates against older records', () => {
  assert.equal(importer.isDuplicate(item, [{ url: item.url }]), true);
  assert.equal(importer.isDuplicate(item, [{ pages: [item.url] }]), true);
  assert.equal(importer.isDuplicate(item, [{ sourceUrl: item.sourceUrl }]), true);
  assert.equal(importer.isDuplicate(item, [{ url: 'https://images.example.org/other/1.webp' }]), false);
});
test('extension extracts title, first image URL, and author without tag spillover', () => {
  const meta = {
    getAttribute: () => null,
    querySelectorAll: () => [{ getAttribute: n => n === 'href' ? item.url : null }],
    textContent: '', innerHTML: ''
  };
  const doc = {
    querySelector: selector => ({
      title: { textContent: '作品A' },
      '#post-meta': meta,
      'meta[name="description"]': { getAttribute: () => '【パロディ】原作【サークル】丸【作者】作者A【タグ】漫画' }
    })[selector]
  };
  const result = extractor.extract(doc, item.sourceUrl);
  assert.equal(result.ok, true);
  assert.equal(result.item.author, '作者A');
  assert.equal(result.item.url, item.url);
  assert.equal(result.item.title, item.title);
});
test('both manga pages use JSON import instead of the old extension queue UI', () => {
  const add = read('add.html');
  const route = read('manga-list-route.js');
  const template = read('manga-list-template.js');
  assert.doesNotMatch(add, /momon:GA|mangaBatchImport|manga-import-bridge\.js/);
  assert.doesNotMatch(route, /manga-import-bridge\.js/);
  assert.match(add, /manga-json-import\.js/);
  assert.match(route, /manga-json-import\.js/);
  assert.match(template, /jsonImportButton/);
});
