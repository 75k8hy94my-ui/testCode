import test from 'node:test';
import assert from 'node:assert/strict';
import schema from '../legal-index-schema.js';

test('repairs common AI drift and derives missing title from index filename', () => {
  const raw = {
    schemaVersion: '1',
    book: { title: '', authors: '宇賀克也', subjects: '行政法、行政救済法' },
    matterEntries: [{ term: '取消訴訟', pages: 123 }]
  };
  const result = schema.validateBookFile(raw, { fileName: '行政救済法_索引(1).json' });
  assert.equal(result.ok, true);
  assert.equal(result.book.book.title, '行政救済法');
  assert.deepEqual(result.book.book.authors, ['宇賀克也']);
  assert.deepEqual(result.book.book.subjects, ['行政法', '行政救済法']);
  assert.deepEqual(result.book.matterEntries[0].pages, ['123']);
  assert.deepEqual(result.book.caseEntries, []);
  assert.deepEqual(result.book.statuteEntries, []);
  assert.ok(result.repairs.length >= 4);
});

test('does not invent a title from a generic filename', () => {
  const result = schema.validateBookFile(
    { schemaVersion: 1, book: { title: '', subjects: [] }, matterEntries: [] },
    { fileName: 'bad.json' }
  );
  assert.deepEqual(result, { ok: false, error: 'bad.json: book.title is required' });
});

test('repairs single entry objects and scalar page values', () => {
  const result = schema.validateBookFile({
    schemaVersion: 1,
    book: { title: '民法', subjects: [] },
    matterEntries: { term: '錯誤', pages: '20' }
  }, { fileName: '民法.json' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.book.matterEntries, [{ term: '錯誤', pages: ['20'] }]);
});

test('keeps content errors strict when repair would require invention', () => {
  const result = schema.validateBookFile({
    schemaVersion: 1,
    book: { title: '民法', subjects: [] },
    matterEntries: [{ term: '', pages: '20' }]
  }, { fileName: '民法.json' });
  assert.equal(result.ok, false);
  assert.match(result.error, /matterEntries\[0\]\.term/);
});
