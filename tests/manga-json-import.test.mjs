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
      title: { textContent: '【オリジナル】 作品A - 同人誌 - サイト名' },
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
test('extension extracts title only between first 】 and first ASCII hyphen', () => {
  assert.equal(extractor.extractTitle('【オリジナル】タイトル - 同人誌 - サイト名'), 'タイトル');
  assert.equal(extractor.extractTitle(' 【二次創作】 作品名（前編） - 同人誌 '), '作品名（前編）');
  assert.equal(extractor.extractTitle('【オリジナル】作品名'), '作品名');
  assert.equal(extractor.extractTitle('作品名のみ'), '作品名のみ');
  assert.equal(extractor.extractTitle('【オリジナル】 - 同人誌'), '');
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


test('optional custom image-page ranges survive JSON validation and reject inverted bounds', () => {
  const result = importer.parse(json([{...item,pageRangeStart:2,pageRangeEnd:19}]))[0];
  assert.equal(result.pageRangeStart,2);
  assert.equal(result.pageRangeEnd,19);
  assert.throws(()=>importer.parse(json([{...item,pageRangeStart:20,pageRangeEnd:19}])),/終了ページ/);
  assert.throws(()=>importer.parse(json([{...item,pageRangeStart:-1}])),/1～2000/);
  assert.equal(importer.parse(json([item]))[0].pageRangeStart,undefined);
});

test('JSON import accepts arbitrary HTTPS image filenames as one ordered explicit page list', () => {
  const pages = [
    'https://wimg.rule34.xxx/thumbnails/2116/thumbnail_e962f268c244fd66e0501d459fa6bafd.jpg?18516056',
    'https://wimg.rule34.xxx/thumbnails/106/thumbnail_0edd0973ece6a7a2dc79cf9e065dfc80.jpg?18185117',
    'https://img.example.org/another-picture.png'
  ];
  const result = importer.parse(json([{...item, url: undefined, pages}]))[0];
  assert.equal(result.url, pages[0]);
  assert.deepEqual(Array.from(result.pages), pages);
  assert.notEqual(result.pages, pages);
  assert.equal(importer.MAX_PAGES, 2000);
});

test('JSON import prevents malformed explicit pages, mixing range and pages, and first-page mismatch', () => {
  const pages = ['https://img.example.org/a.jpg', 'https://img.example.org/b.png?cache=1'];
  for (const change of [
    { pages: [] },
    { pages: Array(2001).fill(pages[0]) },
    { pages: [pages[0], pages[0]] },
    { pages: ['http://img.example.org/a.jpg'] },
    { pages: ['https://img.example.org/no-extension'] },
    { pages, pageRangeStart: 2 },
    { pages, pageRangeEnd: 10 },
    { pages, url: 'https://img.example.org/wrong.jpg' }
  ]) {
    assert.throws(() => importer.parse(json([{ ...item, url: undefined, ...change }])));
  }
});

test('JSON import register persists explicit pages and a versioned reader manifest', () => {
  function el() {
    return {
      children: [], hidden: true, textContent: '',
      append(...items) { this.children.push(...items); },
      appendChild(child) { this.children.push(child); },
      prepend(child) { this.children.unshift(child); },
      replaceChildren(...items) { this.children = items; },
      addEventListener() {},
    };
  }
  const elements = new Map(['#mangaJsonImportDialog', '#mangaJsonImportRows', '#mangaJsonImportStatus'].map(id => [id, el()]));
  const documentRef = { querySelector: key => elements.get(key), createElement: () => el() };
  let state = { savedItems: [], authorCards: [] };
  const importerUI = importer.create({
    documentRef, getState: () => state, setState: next => { state = next; },
    authorSync: { synchronize: ({ authorCards }) => ({ authorCards, changed: false }) },
    persistItems: () => true, persistAuthorCards: () => true, render: () => {},
    createId: () => 'test-id', now: () => 123
  });
  const pages = ['https://example.com/a.jpg', 'https://example.com/x.png'];
  importerUI.open(importer.parse(json([{ ...item, url: pages[0], pages }])));
  const result = importerUI.register();
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.deepEqual(Array.from(state.savedItems[0].pages), pages);
  assert.equal(state.savedItems[0].pageManifest.version, 1);
  assert.deepEqual(Array.from(state.savedItems[0].pageManifest.pages), pages);
  assert.equal(state.savedItems[0].pageManifest.splitSpreads, false);
});

test('preview-only export metadata is validated and retained in saved works', () => {
  function el() {
    return {
      children: [], hidden: true, textContent: '',
      append(...items) { this.children.push(...items); },
      appendChild(child) { this.children.push(child); },
      prepend(child) { this.children.unshift(child); },
      replaceChildren(...items) { this.children = items; },
      addEventListener() {}
    };
  }
  const elements = new Map(['#mangaJsonImportDialog', '#mangaJsonImportRows', '#mangaJsonImportStatus'].map(id => [id, el()]));
  let state = { savedItems: [], authorCards: [] };
  const ui = importer.create({
    documentRef: { querySelector: key => elements.get(key), createElement: () => el() },
    getState: () => state, setState: next => { state = next; },
    authorSync: { synchronize: ({ authorCards }) => ({ authorCards, changed: false }) },
    persistItems: () => true, persistAuthorCards: () => true, render: () => {},
    createId: () => 'preview-test', now: () => 123
  });
  const pages = ['https://img.pawchive.pw/thumbnail/data/aa/bb/one.png', 'https://img.pawchive.pw/thumbnail/data/aa/bb/two.jpg'];
  const [preview] = importer.parse(json([{ ...item, url: pages[0], pages, imageQuality: 'preview', previewCount: 2 }]));
  assert.equal(preview.imageQuality, 'preview');
  assert.equal(preview.previewCount, 2);
  ui.open([preview]);
  const result = ui.register();
  assert.equal(result.ok, true);
  assert.equal(state.savedItems[0].imageQuality, 'preview');
  assert.equal(state.savedItems[0].previewCount, 2);
  assert.deepEqual(Array.from(state.savedItems[0].pageManifest.pages), pages);
});

test('preview provenance rejects inconsistent counts and preserves legacy imports', () => {
  const pages = ['https://img.example.org/a.jpg', 'https://img.example.org/b.jpg'];
  const legacy = importer.parse(json([item]))[0];
  assert.equal(legacy.imageQuality, undefined);
  assert.equal(legacy.previewCount, undefined);
  for (const invalid of [
    { imageQuality: 'unknown', previewCount: 0 },
    { imageQuality: 'original', previewCount: 1 },
    { imageQuality: 'preview', previewCount: 1 },
    { imageQuality: 'mixed', previewCount: 0 },
    { imageQuality: 'mixed', previewCount: 2 },
    { imageQuality: 'preview', previewCount: -1 },
    { previewCount: 2 },
  ]) assert.throws(() => importer.parse(json([{ ...item, url: pages[0], pages, ...invalid }])));
  const mixed = importer.parse(json([{ ...item, url: pages[0], pages, imageQuality: 'mixed', previewCount: 1 }]))[0];
  assert.equal(mixed.imageQuality, 'mixed');
  assert.equal(mixed.previewCount, 1);
});
