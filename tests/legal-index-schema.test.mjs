import test from 'node:test';
import assert from 'node:assert/strict';

let Schema = {};
try { Schema = (await import('../legal-index-schema.js')).default || {}; } catch (_) {}

function requireValidator() {
  assert.equal(typeof Schema.validateBookFile, 'function', 'validateBookFile should exist');
}

const validBook = {
  schemaVersion: 1,
  book: { title: '基本民法 債権総論 第3版', authors: ['著者名'], subjects: ['民法', '民法'] },
  matterEntries: [
    { term: '債権者代位権', pages: ['123', '128-130'] },
    { term: '債権者代位権 転用', pages: ['135'] }
  ],
  caseEntries: [{
    court: '最高裁判所', date: '1997-12-18', reporter: '民集', volume: '51', issue: '10', reportPage: '4247',
    citationText: '最判平成9年12月18日・民集51巻10号4247頁', pages: ['312']
  }],
  statuteEntries: [{ statute: '民法', article: '423', paragraph: null, item: null, citationText: '民法423条', pages: ['205', '311'] }]
};

test('validates and normalizes matter, case, and statute indexes for one book', () => {
  requireValidator();
  const result = Schema.validateBookFile(validBook, { fileName: 'civil.json' });
  assert.equal(result.ok, true);
  assert.equal(result.book.book.title, '基本民法 債権総論 第3版');
  assert.deepEqual(result.book.book.subjects, ['民法']);
  assert.deepEqual(result.book.matterEntries[0].pages, ['123', '128-130']);
  assert.equal(result.book.caseEntries[0].reportPage, '4247');
  assert.equal(result.book.statuteEntries[0].article, '423');
});

test('case and statute index arrays are optional and missing arrays normalize empty', () => {
  requireValidator();
  const value = { schemaVersion: 1, book: { title: '民法入門', subjects: ['民法'] }, matterEntries: [{ term: '錯誤', pages: ['20'] }] };
  const result = Schema.validateBookFile(value, { fileName: 'intro.json' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.book.caseEntries, []);
  assert.deepEqual(result.book.statuteEntries, []);
});

test('rejects unsupported schema, blank title, malformed subjects and empty pages with file context', () => {
  requireValidator();
  const cases = [
    [{ schemaVersion: 2, book: { title: 'X', subjects: [] } }, 'bad.json: schemaVersion must be 1'],
    [{ schemaVersion: 1, book: { title: ' ', subjects: [] } }, 'bad.json: book.title is required'],
    [{ schemaVersion: 1, book: { title: 'X', subjects: '民法' } }, 'bad.json: book.subjects must be an array'],
    [{ schemaVersion: 1, book: { title: 'X', subjects: [] }, matterEntries: [{ term: '錯誤', pages: [] }] }, 'bad.json: matterEntries[0].pages must be a non-empty array']
  ];
  for (const [value, message] of cases) assert.deepEqual(Schema.validateBookFile(value, { fileName: 'bad.json' }), { ok: false, error: message });
});

test('case entries never accept a date as their only identity', () => {
  requireValidator();
  const value = {
    schemaVersion: 1, book: { title: '判例集', subjects: ['民法'] },
    caseEntries: [{ court: '最高裁判所', date: '1997-12-18', pages: ['10'] }]
  };
  const result = Schema.validateBookFile(value, { fileName: 'cases.json' });
  assert.equal(result.ok, false);
  assert.match(result.error, /caseEntries\[0\].*(reporter|citationText)/);
});

test('creates an index-book plaintext chunk without changing book data', () => {
  requireValidator();
  assert.equal(typeof Schema.createIndexBookChunk, 'function');
  const normalized = Schema.validateBookFile(validBook).book;
  const chunk = Schema.createIndexBookChunk(normalized, { bookId: 'book-1', chunkId: '11111111-1111-4111-8111-111111111111' });
  assert.equal(chunk.type, 'index-book');
  assert.equal(chunk.version, 1);
  assert.equal(chunk.bookId, 'book-1');
  assert.equal(chunk.chunkId, '11111111-1111-4111-8111-111111111111');
  assert.equal(chunk.book.title, normalized.book.title);
});
