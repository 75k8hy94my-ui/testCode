import test from 'node:test';
import assert from 'node:assert/strict';
import '../manga-import-candidate.js';
const api = globalThis.MangaImportCandidate;
const candidate = () => ({ title: 'Title', author: 'Artist', circleName: 'Circle', sourceWork: 'Source', tags: ['tag'], sourceUrl: 'https://momon-ga.com/fanzine/mo123/', pages: ['https://z1.momon-ga.me/galleries/123/1.webp', 'https://z2.momon-ga.me/galleries/123/2.webp'], queueId: 'untrusted' });
test('constructs a fresh shelf record with independent page lists and local identity', () => {
  const input = candidate();
  const result = api.createSavedItem(input, { id: 'i-local', addedAt: 41234 });
  assert.equal(result.id, 'i-local'); assert.equal(result.addedAt, 41234);
  assert.equal(result.url, input.pages[0]); assert.equal(result.folderId, null);
  assert.deepEqual(result.pages, input.pages); assert.deepEqual(result.pageManifest, { version: 1, pages: input.pages, splitSpreads: false });
  assert.notEqual(result.pages, input.pages); assert.notEqual(result.pages, result.pageManifest.pages);
  assert.equal(result.isDoujin, true); assert.equal(result.queueId, undefined);
  for (const key of ['title', 'author', 'circleName', 'sourceWork', 'sourceUrl']) assert.equal(result[key], input[key]);
  assert.deepEqual(result.tags, ['tag']); assert.notEqual(result.tags, input.tags);
  assert.equal(api.createSavedItem({ ...input, sourceWork: '' }, { id: 'i-next', addedAt: 4 }).isDoujin, false);
});
test('duplicate classification uses source, first page, then gallery, never title alone', () => {
  const input = candidate();
  const items = [{ id: 'a', sourceUrl: input.sourceUrl }, { id: 'b', pages: [input.pages[0]] }, { id: 'c', pages: ['https://z8.momon-ga.me/galleries/123/1.webp'] }, { id: 'd', title: input.title }];
  const result = api.findDuplicate(input, items);
  assert.equal(result.duplicate, true);
  assert.deepEqual(result.matches.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(api.findDuplicate(input, [{ id: 'd', title: input.title }]).duplicate, false);
});
test('duplicate classification prefers a valid manifest over stale compatibility pages', () => {
  const input = candidate();
  const stale = 'https://z1.momon-ga.me/galleries/999/1.webp';
  const existing = { id: 'manifest', sourceUrl: 'https://momon-ga.com/fanzine/mo999/', pages: [stale], url: stale, pageManifest: { version: 1, pages: [input.pages[0]] } };
  assert.deepEqual(api.findDuplicate(input, [existing]).matches, [existing]);
  const unrelated = { ...existing, id: 'unrelated', pageManifest: { version: 1, pages: [stale] }, pages: [input.pages[0]] };
  assert.equal(api.findDuplicate(input, [unrelated]).duplicate, false);
  assert.equal(api.findDuplicate(input, [{ ...unrelated, pageManifest: { version: 2, pages: [stale] } }]).duplicate, true);
});
test('an empty v1 manifest stays authoritative over a matching stale compatibility page', () => {
  const input = candidate();
  const existing = { id: 'empty-manifest', sourceUrl: 'https://momon-ga.com/fanzine/mo999/', pages: [input.pages[0]], pageManifest: { version: 1, pages: [] } };
  assert.equal(api.findDuplicate(input, [existing]).duplicate, false);
});
