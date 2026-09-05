const test = require('node:test');
const assert = require('node:assert/strict');
const extractor = require('../extension/content/extractor.js');

test('normalizeText collapses whitespace and preserves Japanese punctuation', () => {
  assert.equal(extractor.normalizeText('  第1巻\n  ― 完結 ―  '), '第1巻 ― 完結 ―');
});

test('extractImageUrl prefers currentSrc and resolves relative URLs', () => {
  const element = { currentSrc: '/images/001.jpg', src: '/bad.jpg', tagName: 'IMG', closest() { return null; } };
  assert.equal(extractor.extractImageUrl(element, 'https://example.com/viewer/1'), 'https://example.com/images/001.jpg');
});

test('extractImageUrl falls back to anchor href then background image', () => {
  const anchor = { href: '/full/001.jpg' };
  const linked = { tagName: 'SPAN', closest(selector) { return selector === 'a[href]' ? anchor : null; }, style: {} };
  assert.equal(extractor.extractImageUrl(linked, 'https://example.com/x'), 'https://example.com/full/001.jpg');
  const bg = { tagName: 'DIV', closest() { return null; }, style: { backgroundImage: 'url("/bg/001.jpg")' } };
  assert.equal(extractor.extractImageUrl(bg, 'https://example.com/x'), 'https://example.com/bg/001.jpg');
});

test('dedupeUrls preserves DOM order and rejects non-http URLs', () => {
  assert.deepEqual(extractor.dedupeUrls(['https://x/1.jpg','data:image/png;base64,x','https://x/2.jpg','https://x/1.jpg']), ['https://x/1.jpg','https://x/2.jpg']);
});

test('inferImageCollection climbs to a common ancestor with repeated images', () => {
  const img1 = { tagName:'IMG', classList:['page'], currentSrc:'https://x/1.jpg' };
  const img2 = { tagName:'IMG', classList:['page'], currentSrc:'https://x/2.jpg' };
  const img3 = { tagName:'IMG', classList:['page'], currentSrc:'https://x/3.jpg' };
  const local = { parentElement:null, querySelectorAll() { return [img1]; }, attributes:[], classList:[], tagName:'DIV' };
  const common = { parentElement:null, querySelectorAll(selector) { return selector === 'img.page' ? [img1,img2,img3] : []; }, attributes:[], classList:[], tagName:'DIV' };
  local.parentElement = common;
  img1.parentElement = local;
  img1.ownerDocument = { location:{ href:'https://example.com/viewer' } };
  const inferred = extractor.inferImageCollection(img1);
  assert.equal(inferred.count, 3);
  assert.deepEqual(inferred.urls, ['https://x/1.jpg','https://x/2.jpg','https://x/3.jpg']);
});