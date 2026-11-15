import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const sources = require('../manga-source-type.js');
const spreadsheet = require('../manga-spreadsheet.js');
const pageSource = require('../reader-page-source.js');
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('alternative manga URLs are ranked by format, not by input position', () => {
  const work = { url: 'https://site.test/other', sourceUrls: [
    'https://site.test/other',
    'https://site.test/chapters/1.html#1',
    'https://images.test/g/1.webp',
    'https://site.test/chapters/2.html#1',
    'https://images.test/g/1.jpg',
  ] };
  assert.deepEqual(sources.getSourceCandidates(work), [
    'https://images.test/g/1.webp',
    'https://images.test/g/1.jpg',
    'https://site.test/chapters/1.html#1',
    'https://site.test/chapters/2.html#1',
    'https://site.test/other',
  ]);
  assert.equal(work.url, 'https://site.test/other');
  assert.deepEqual(work.sourceUrls, [
    'https://site.test/other',
    'https://site.test/chapters/1.html#1',
    'https://images.test/g/1.webp',
    'https://site.test/chapters/2.html#1',
    'https://images.test/g/1.jpg',
  ], 'sorting must not change saved input order or designate a main URL');
});

test('legacy single URLs, duplicates, invalid URLs and image URLs ending in #1', () => {
  assert.deepEqual(sources.getSourceCandidates({url:'https://site.test/old'}), ['https://site.test/old']);
  assert.deepEqual(sources.getSourceCandidates({sourceUrls: [
    'https://site.test/book#1', 'https://site.test/book#1',
    'javascript:alert(1)', 'https://user:secret@site.test/book',
    'https://images.test/g/1.webp#1', 'https://images.test/g/1.webp'
  ]}), [
    'https://images.test/g/1.webp', 'https://site.test/book#1', 'https://images.test/g/1.webp#1'
  ]);
});

test('new and existing manga use the same source URL collection UI', () => {
  const add = read('add.html');
  const media = read('media-add.js');
  const sheet = read('manga-spreadsheet.js');
  const reader = read('reader-runtime.js');
  assert.match(add, /<textarea name="url" required/);
  assert.match(media, /sourceUrls,/);
  assert.match(sheet, /updated\.url = updated\.sourceUrls\[0\]/);
  assert.match(reader, /MangaSourceType\?\.getSourceCandidates\(item\)/);
  assert.match(reader, /onSourcePageFailure\(targetPage\)/);
  assert.match(read('reader.html'), /id="switchSourceBtn"/);
});

test('directory-style sources probe common extensions and zero-padded first pages before web embed', () => {
  const candidates = sources.getDirectoryImageCandidates('https://site.test/manga/?auth=ok');
  assert.equal(candidates.length, 4);
  assert.deepEqual(candidates[0].slice(0, 3), [
    'https://site.test/manga/1.webp?auth=ok',
    'https://site.test/manga/1.jpg?auth=ok',
    'https://site.test/manga/1.jpeg?auth=ok',
  ]);
  assert.ok(candidates[0].includes('https://site.test/manga/1.png?auth=ok'));
  assert.ok(candidates[0].includes('https://site.test/manga/1.avif?auth=ok'));
  assert.ok(candidates[0].includes('https://site.test/manga/1.gif?auth=ok'));
  assert.ok(candidates[1].includes('https://site.test/manga/01.webp?auth=ok'));
  assert.ok(candidates[2].includes('https://site.test/manga/001.webp?auth=ok'));
  assert.ok(candidates[3].includes('https://site.test/manga/0001.webp?auth=ok'));
  assert.equal(sources.getDirectoryImageCandidates('https://site.test/book.html').length, 0);
  assert.equal(sources.getDirectoryImageCandidates('https://site.test/book#1').length, 0);
  assert.equal(sources.getDirectoryImageCandidates('https://site.test/manga/1.webp').length, 0);
  assert.equal(sources.getDirectoryImageCandidates('javascript:alert(1)').length, 0);
});

test('detected image folders discover ordered pages without changing the saved directory', async () => {
  const original = 'https://site.test/manga/';
  const source = original + '001.webp?auth=ok';
  const existing = [source, original + '002.webp?auth=ok'];
  const probed = [];
  const resolver = pageSource.createLegacyResolver({
    maxPages: 20,
    probe: async (url) => { probed.push(url); return existing.includes(url); },
  });
  const result = await resolver.resolve({ url: source, autoDetectedDirectory: true });
  assert.deepEqual(result.pages, existing);
  assert.ok(probed.includes(original + '003.webp?auth=ok'));
  assert.ok(!probed.some((url) => url.endsWith('.jpg?auth=ok')), 'chosen extension remains consistent');
});

test('reader and cover attempt numbered directory images and preserve the original URL fallback', () => {
  const reader = read('reader-runtime.js');
  const cover = read('manga-list-host-runtime.js');
  assert.match(reader, /detectDirectoryFirstPage\(savedUrl\)/);
  assert.match(reader, /\{ url: savedUrl, detected: false \}/);
  assert.match(reader, /activeAutoDetectedDirectory/);
  assert.match(reader, /virtualDetectedSources\.set\(found, url\)/);
  assert.match(reader, /sourceCandidates\.push\(\.\.\.virtualDetectedSources\.keys\(\)\)/);
  assert.match(cover, /directoryImageUrls/);
  assert.match(cover, /EMBED_COVER_URL/);
});


test('page interval metadata accepts optional bounds for hash or numbered image sources', () => {
  assert.deepEqual(sources.parsePageRange('', ''), {start:1,end:null});
  assert.deepEqual(sources.parsePageRange('2', '19'), {start:2,end:19});
  assert.deepEqual(sources.parsePageRange('', '19'), {start:1,end:19});
  assert.deepEqual(sources.getPageRange({pageRangeStart:2,pageRangeEnd:19}), {start:2,end:19});
  assert.equal(sources.supportsPageRange('https://site.test/book.html#1'), true);
  assert.equal(sources.supportsPageRange('https://site.test/book/001.webp?token=ok'), true);
  assert.equal(sources.supportsPageRange('https://site.test/book.html'), false);
  assert.throws(() => sources.parsePageRange('20','19'), /終了ページ/);
  assert.throws(() => sources.parsePageRange('0','19'), /1～2000/);
  assert.throws(() => sources.parsePageRange('2.5','19'), /1～2000/);
});
