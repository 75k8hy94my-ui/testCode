import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const sources = require('../manga-source-type.js');
const spreadsheet = require('../manga-spreadsheet.js');
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
  assert.match(sheet, /updated\.sourceUrls = urls/);
  assert.match(reader, /MangaSourceType\?\.getSourceCandidates\(item\)/);
  assert.match(reader, /onSourcePageFailure\(targetPage\)/);
  assert.match(read('reader.html'), /id="switchSourceBtn"/);
});
