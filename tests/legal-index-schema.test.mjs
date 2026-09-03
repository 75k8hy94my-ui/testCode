import test from 'node:test';
import assert from 'node:assert/strict';
import schema from '../legal-index-schema.js';

const sample = {
  schemaVersion: 1,
  book: {
    title: '基本民法 債権総論 第3版',
    authors: ['著者A'],
    subjects: ['民法', '民事訴訟法']
  },
  matterEntries: [
    { term: '債権者代位権', pages: ['123', '128-130'] },
    { term: '債権者代位権 転用', pages: ['135'] }
  ],
  caseEntries: [
    {
      court: '最高裁判所',
      date: '1997-12-18',
      reporter: '民集',
      volume: '51',
      issue: '10',
      reportPage: '4247',
      citationText: '最判平成9年12月18日・民集51巻10号4247頁',
      pages: ['312']
    }
  ],
  statuteEntries: [
    {
      statute: '民法',
      article: '423',
      paragraph: null,
      item: null,
      citationText: '民法423条',
      pages: ['205', '311']
    }
  ]
};

test('normalizes one-book v1 JSON with matter case and statute indexes', () => {
  const result = schema.validateBookFile(sample, { fileName: 'civil.json' });
  assert.equal(result.ok, true);
  assert.equal(result.book.book.title, sample.book.title);
  assert.deepEqual(result.book.book.subjects, ['民法', '民事訴訟法']);
  assert.deepEqual(result.book.matterEntries[1], { term: '債権者代位権 転用', pages: ['135'] });
  assert.equal(result.book.caseEntries[0].reportPage, '4247');
  assert.equal(result.book.statuteEntries[0].article, '423');
});

test('case and statute indexes may be omitted', () => {
  const value = { schemaVersion: 1, book: { title: '民法入門', subjects: ['民法'] }, matterEntries: [{ term: '錯誤', pages: ['20'] }] };
  const result = schema.validateBookFile(value, { fileName: 'intro.json' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.book.caseEntries, []);
  assert.deepEqual(result.book.statuteEntries, []);
});

test('rejects missing required book metadata with file-aware errors', () => {
  const result = schema.validateBookFile({ schemaVersion: 1, book: { title: '', subjects: [] } }, { fileName: 'bad.json' });
  assert.deepEqual(result, { ok: false, error: 'bad.json: book.title is required' });
});

test('rejects unsupported schema versions and invalid page lists', () => {
  assert.match(schema.validateBookFile({ ...sample, schemaVersion: 2 }, { fileName: 'v2.json' }).error, /schemaVersion/);
  const badPages = structuredClone(sample);
  badPages.matterEntries[0].pages = [];
  assert.match(schema.validateBookFile(badPages, { fileName: 'pages.json' }).error, /matterEntries\[0\]\.pages/);
});

test('case entry needs a date and either full reporter identity or citation text', () => {
  const missingDate = structuredClone(sample);
  missingDate.caseEntries[0].date = '';
  assert.match(schema.validateBookFile(missingDate, { fileName: 'case.json' }).error, /caseEntries\[0\]\.date/);

  const incomplete = structuredClone(sample);
  incomplete.caseEntries[0].reportPage = '';
  incomplete.caseEntries[0].citationText = '';
  assert.match(schema.validateBookFile(incomplete, { fileName: 'case.json' }).error, /citationText|reporter identity/);
});

test('creates an index-book chunk with stable explicit identities', () => {
  const normalized = schema.normalizeBook(sample);
  const chunk = schema.createIndexBookChunk(normalized, { bookId: 'book-1', chunkId: '11111111-1111-4111-8111-111111111111' });
  assert.equal(chunk.type, 'index-book');
  assert.equal(chunk.version, 1);
  assert.equal(chunk.bookId, 'book-1');
  assert.equal(chunk.chunkId, '11111111-1111-4111-8111-111111111111');
  assert.equal(chunk.book.title, sample.book.title);
});
