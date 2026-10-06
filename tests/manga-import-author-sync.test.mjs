import test from 'node:test';
import assert from 'node:assert/strict';
import '../manga-import-author-sync.js';
const api = globalThis.MangaImportAuthorSync;
test('creates one card per new author, preserving existing links and user circle', () => {
  const old = { id: 'old', name: 'Alice', circleName: 'My Circle', links: [{ url: 'https://example.test' }], createdAt: 1 };
  const cards = [old];
  const result = api.synchronize({ savedItems: [{ author: 'Alice', circleName: 'Site Circle' }, { author: 'Bob', circleName: 'Bob Circle' }, { author: 'Bob', circleName: 'Other' }], authorCards: cards, createId: () => 'new', now: () => 10 });
  assert.equal(result.changed, true); assert.equal(result.authorCards.length, 2);
  assert.deepEqual(result.authorCards.find(card => card.name === 'Alice'), old);
  assert.deepEqual(result.authorCards.find(card => card.name === 'Bob'), { id: 'new', name: 'Bob', circleName: 'Bob Circle', links: [], createdAt: 10 });
  assert.deepEqual(cards, [old]);
});
test('fills only empty circles, recognizes alias, and reports unchanged state', () => {
  const cards = [{ id: 'a', name: 'Alias', circleName: '', links: ['link'] }, { id: 'b', name: 'Other', circleName: 'Artist', links: [] }];
  const result = api.synchronize({ savedItems: [{ author: 'Alias', circleName: 'Circle' }, { author: 'Artist', circleName: 'Overwrite' }], authorCards: cards, createId: () => { throw Error('duplicate'); }, now: () => 2 });
  assert.equal(result.changed, true); assert.equal(result.authorCards.length, 2);
  assert.equal(result.authorCards[0].circleName, 'Circle'); assert.deepEqual(result.authorCards[0].links, ['link']);
  assert.equal(result.authorCards[1].circleName, 'Artist'); assert.equal(cards[0].circleName, '');
  assert.equal(api.synchronize({ savedItems: [{ author: 'Artist' }], authorCards: cards, createId: () => 'x', now: () => 1 }).changed, false);
});
