import test from 'node:test';
import assert from 'node:assert/strict';
import '../manga-import-validator.js';
const api = globalThis.MangaImportValidator;
const valid = () => ({ schemaVersion: 1, title: 'Title', author: 'Artist', circleName: '', sourceWork: '', tags: ['tag'], sourceUrl: 'https://momon-ga.com/fanzine/mo123/', pages: ['https://z2.momon-ga.me/galleries/123/1.webp', 'https://z9.momon-ga.me/galleries/123/2.webp'], fallbackPagePattern: null });

test('validates and independently copies a complete candidate', () => {
  const input = valid();
  const result = api.validateCandidate(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.candidate, input);
  assert.notEqual(result.candidate.pages, input.pages);
  assert.notEqual(result.candidate.tags, input.tags);
});
test('rejects malformed metadata and caps without truncation', () => {
  const cases = [
    { schemaVersion: 2 }, { title: '' }, { title: 'x'.repeat(501) }, { author: '' }, { author: 'x'.repeat(301) },
    { circleName: 'x'.repeat(301) }, { sourceWork: 'x'.repeat(301) },
    { tags: Array(201).fill('tag') }, { tags: ['x'.repeat(201)] }, { tags: 'tag' },
    { pages: [] }, { pages: Array(3001).fill(valid().pages[0]) },
  ];
  for (const change of cases) assert.equal(api.validateCandidate({ ...valid(), ...change }).ok, false, JSON.stringify(Object.keys(change)));
  assert.equal(api.validateCandidate({ ...valid(), title: 'x'.repeat(500), author: 'x'.repeat(300), tags: ['x'.repeat(200)] }).ok, true);
});
test('accepts only exact HTTPS source and sequential same-gallery image paths', () => {
  const sources = ['http://momon-ga.com/fanzine/mo123/', 'https://momon-ga.com.evil.test/fanzine/mo123/', 'https://momon-ga.com/other/mo123/', 'https://user@momon-ga.com/fanzine/mo123/', 'https://momon-ga.com:444/fanzine/mo123/'];
  for (const sourceUrl of sources) assert.equal(api.validateCandidate({ ...valid(), sourceUrl }).ok, false, sourceUrl);
  const pages = ['http://z2.momon-ga.me/galleries/123/1.webp', 'https://evil-z2.momon-ga.me/galleries/123/1.webp', 'https://z2.momon-ga.me/galleries/123/0.webp', 'https://z2.momon-ga.me/galleries/123/1.jpg', 'https://z2.momon-ga.me/galleries/123/1.webp?x=1'];
  for (const page of pages) assert.equal(api.validateCandidate({ ...valid(), pages: [page] }).ok, false, page);
  for (const list of [['https://z2.momon-ga.me/galleries/124/1.webp'], ['https://z2.momon-ga.me/galleries/123/2.webp'], [valid().pages[0], valid().pages[0]]]) assert.equal(api.validateCandidate({ ...valid(), pages: list }).ok, false);
});
test('rejects URL objects before normalization can smuggle non-string saved fields', () => {
  const input = valid();
  const source = api.validateCandidate({ ...input, sourceUrl: new URL(input.sourceUrl) });
  const page = api.validateCandidate({ ...input, pages: [new URL(input.pages[0])] });
  assert.equal(source.ok, false);
  assert.equal(page.ok, false);
  assert.equal(api.validateBatch([{ ...input, pages: [new URL(input.pages[0])] }]).ok, false);
});
test('batch reports all invalid candidates without normalizing a partial list', () => {
  const result = api.validateBatch([valid(), { ...valid(), title: '' }, { ...valid(), pages: [] }]);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
  assert.equal(result.candidates.length, 0);
  assert.equal(api.validateBatch(Array(501).fill(valid())).ok, false);
});
