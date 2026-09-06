import test from 'node:test';
import assert from 'node:assert/strict';
import schema from '../legal-index-schema.js';

const base = {
  schemaVersion: 1,
  book: { title: '行政救済法', authors: [], subjects: ['行政法'] },
  matterEntries: [{ term: '取消訴訟', pages: ['10'] }]
};

test('preserves URL cover metadata in normalized book chunks', () => {
  const value = structuredClone(base);
  value.book.cover = { type: 'url', value: 'https://example.com/cover.jpg' };
  const chunk = schema.createIndexBookChunk(value, { bookId: 'book-1', chunkId: 'chunk-1' });
  assert.deepEqual(chunk.book.cover, { type: 'url', value: 'https://example.com/cover.jpg' });
});

test('preserves compressed uploaded cover data and allows no cover', () => {
  const value = structuredClone(base);
  value.book.cover = { type: 'upload', value: 'data:image/webp;base64,abc' };
  assert.deepEqual(schema.normalizeBook(value).book.cover, value.book.cover);
  assert.equal(schema.normalizeBook(base).book.cover, null);
});