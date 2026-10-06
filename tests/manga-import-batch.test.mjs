import test from 'node:test';
import assert from 'node:assert/strict';
import '../manga-import-validator.js';
import '../manga-import-candidate.js';
import '../manga-import-author-sync.js';
import '../manga-import-batch.js';
const good = (n = 123) => ({ schemaVersion: 1, title: `Title ${n}`, author: 'Artist', circleName: 'Circle', sourceWork: '', tags: [], sourceUrl: `https://momon-ga.com/fanzine/mo${n}/`, pages: [`https://z1.momon-ga.me/galleries/${n}/1.webp`], fallbackPagePattern: null });
const entry = (n, queueId) => ({ queueId, candidate: good(n), addedAt: 99, warnings: [] });
function setup(initial = []) {
  let state = { savedItems: initial, authorCards: [], other: true }; const calls = [];
  const service = globalThis.MangaImportBatch.create({ getState: () => state, setState: next => { calls.push('state'); state = next; }, validator: globalThis.MangaImportValidator, candidateFactory: globalThis.MangaImportCandidate, authorSync: globalThis.MangaImportAuthorSync, persistItems: () => calls.push('items'), persistAuthorCards: () => calls.push('authors'), render: () => calls.push('render'), createId: () => 'i-local-' + Math.random(), now: () => 555 });
  return { service, calls, state: () => state };
}
test('invalid selected candidates cause zero state changes, persistence, or rendering', () => {
  const context = setup(); const before = context.state();
  const result = context.service.register({ items: [entry(123, 'q1'), { ...entry(124, 'q2'), candidate: { ...good(124), pages: [] } }], explicitDuplicateIds: [] });
  assert.equal(result.ok, false); assert.equal(context.state(), before); assert.deepEqual(context.calls, []);
});
test('rejects duplicate overrides that do not belong to the selected queue before any writes', () => {
  const old = { id: 'old', sourceUrl: good(123).sourceUrl, pages: good(123).pages };
  const context = setup([old]); const before = context.state();
  const result = context.service.register({ items: [entry(123, 'selected-q')], explicitDuplicateIds: ['foreign-q'] });
  assert.equal(result.ok, false);
  assert.equal(context.state(), before);
  assert.deepEqual(context.calls, []);
});
test('commits valid selected items once using fresh IDs and returns actual queue IDs', () => {
  const context = setup();
  const result = context.service.register({ items: [entry(123, 'queue-a'), entry(124, 'queue-b')], explicitDuplicateIds: [] });
  assert.equal(result.ok, true); assert.deepEqual(result.registeredQueueIds, ['queue-a', 'queue-b']);
  assert.deepEqual(context.calls, ['state', 'items', 'authors', 'render']);
  assert.equal(context.state().other, true); assert.equal(context.state().savedItems.length, 2);
  assert.equal(context.state().savedItems[0].addedAt, 555); assert.notEqual(context.state().savedItems[0].id, 'queue-a');
});
test('skips duplicate unless queue ID is explicitly overridden; no author persistence without change', () => {
  const old = { id: 'old', sourceUrl: good(123).sourceUrl, pages: good(123).pages };
  const context = setup([old]);
  context.state().authorCards = [{ id: 'author', name: 'Artist', circleName: 'Existing', links: [] }];
  const first = context.service.register({ items: [entry(123, 'q-duplicate')], explicitDuplicateIds: [] });
  assert.deepEqual(first.registeredQueueIds, []); assert.deepEqual(context.calls, []);
  const second = context.service.register({ items: [entry(123, 'q-duplicate')], explicitDuplicateIds: ['q-duplicate'] });
  assert.deepEqual(second.registeredQueueIds, ['q-duplicate']); assert.equal(context.state().savedItems.length, 2);
  assert.deepEqual(context.calls, ['state', 'items', 'render']);
});
