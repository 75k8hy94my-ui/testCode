import test from 'node:test';
import assert from 'node:assert/strict';
import searchApi from '../legal-index-search.js';

const {
  normalizeLegalText,
  normalizeCompact,
  normalizeDate,
  caseIdentityKey,
  statuteIdentityKey,
  buildIndex,
  search,
  damerauLevenshtein
} = searchApi;

const baseBook = (overrides = {}) => ({
  type: 'index-book', version: 1, schemaVersion: 1,
  bookId: overrides.bookId || 'book-a',
  chunkId: overrides.chunkId || '11111111-1111-4111-8111-111111111111',
  book: { title: overrides.title || '基本民法', authors: [], subjects: overrides.subjects || ['民法'] },
  matterEntries: overrides.matterEntries || [],
  caseEntries: overrides.caseEntries || [],
  statuteEntries: overrides.statuteEntries || []
});

const caseA = {
  court: '最高裁判所', date: '1997-12-18', reporter: '民集', volume: '51', issue: '10', reportPage: '4247',
  citationText: '最判平成9年12月18日・民集51巻10号4247頁', pages: ['312']
};

test('normalizes Japanese legal text, article markers and dates deterministically', () => {
  assert.equal(normalizeLegalText(' 民法　第４２３条 '), normalizeLegalText('民法423条'));
  assert.equal(normalizeLegalText('423条第1項'), normalizeLegalText('423条1項'));
  assert.equal(normalizeCompact('民集５１巻１０号 ４２４７頁'), '民集51巻10号4247頁');
  assert.equal(normalizeDate('平成9年12月18日'), '1997-12-18');
  assert.equal(normalizeDate('H9.12.18'), '1997-12-18');
  assert.equal(normalizeDate('1997/12/18'), '1997-12-18');
});

test('court aliases make highest-court citation searches equivalent', () => {
  assert.equal(normalizeCompact('最高裁判所 平成9年12月18日'), normalizeCompact('最高裁 H9.12.18'));
  assert.match(normalizeCompact('最判平成9年12月18日'), /最高裁/);
});

test('case identity never collapses same-date different decisions', () => {
  const differentPage = { ...caseA, reportPage: '4248', citationText: '最判平成9年12月18日・民集51巻10号4248頁' };
  const differentReporter = { ...caseA, reporter: '刑集', volume: '51', issue: '10', reportPage: '500', citationText: '最判平成9年12月18日・刑集51巻10号500頁' };
  assert.notEqual(caseIdentityKey(caseA), caseIdentityKey(differentPage));
  assert.notEqual(caseIdentityKey(caseA), caseIdentityKey(differentReporter));
});

test('incomplete case identity falls back to full citation text, never date alone', () => {
  const a = { court: '最高裁判所', date: '1997-12-18', reporter: null, volume: null, issue: null, reportPage: null, citationText: '最判平成9年12月18日・判時1600号20頁' };
  const same = { ...a, citationText: '最判 平成9年12月18日 判時1600号20頁' };
  const other = { ...a, citationText: '最判平成9年12月18日・判時1600号21頁' };
  assert.equal(caseIdentityKey(a), caseIdentityKey(same));
  assert.notEqual(caseIdentityKey(a), caseIdentityKey(other));
});

test('statute identity includes paragraph and item structure', () => {
  const a = { statute: '民法', article: '423', paragraph: '1', item: null, citationText: '民法423条1項' };
  const b = { ...a, paragraph: '2', citationText: '民法423条2項' };
  assert.notEqual(statuteIdentityKey(a), statuteIdentityKey(b));
});

test('buildIndex groups the same logical term and case across books', () => {
  const book1 = baseBook({
    bookId: 'book-a', title: '基本民法',
    matterEntries: [{ term: '債権者代位権', pages: ['123'] }],
    caseEntries: [caseA]
  });
  const book2 = baseBook({
    bookId: 'book-b', chunkId: '22222222-2222-4222-8222-222222222222', title: '判例民法', subjects: ['民法', '民事訴訟法'],
    matterEntries: [{ term: '債権者代位権', pages: ['84'] }],
    caseEntries: [{ ...caseA, pages: ['90'] }]
  });
  const index = buildIndex([book1, book2]);
  const matter = index.groups.find((x) => x.kind === 'matter');
  const precedent = index.groups.find((x) => x.kind === 'case');
  assert.equal(matter.sources.length, 2);
  assert.equal(precedent.sources.length, 2);
});

test('search orders exact then partial then AND then fuzzy and de-duplicates candidates', () => {
  const index = buildIndex([baseBook({ matterEntries: [
    { term: '債権者代位権', pages: ['1'] },
    { term: '債権者代位権の転用', pages: ['2'] },
    { term: '代位制度における転用', pages: ['3'] },
    { term: '債権者代位件', pages: ['4'] }
  ] })]);

  const exactQuery = search(index, '債権者代位権', { matchModes: { exact: true, partial: true, and: true, fuzzy: true } });
  assert.equal(exactQuery[0].matchClass, 'exact');
  assert.equal(exactQuery[0].display, '債権者代位権');
  assert.equal(exactQuery[1].matchClass, 'partial');

  const multi = search(index, '代位 転用', { matchModes: { exact: true, partial: true, and: true, fuzzy: true } });
  assert.ok(multi.some((x) => x.display === '代位制度における転用' && x.matchClass === 'and'));

  const fuzzy = search(index, '債権者代位権', { matchModes: { exact: false, partial: false, and: false, fuzzy: true } });
  assert.ok(fuzzy.some((x) => x.display === '債権者代位件' && x.matchClass === 'fuzzy'));
});

test('each match mode can be disabled independently', () => {
  const index = buildIndex([baseBook({ matterEntries: [
    { term: '錯誤', pages: ['10'] },
    { term: '錯誤取消し', pages: ['11'] }
  ] })]);
  assert.deepEqual(search(index, '錯誤', { matchModes: { exact: true, partial: false, and: false, fuzzy: false } }).map((x) => x.display), ['錯誤']);
  assert.deepEqual(search(index, '錯誤', { matchModes: { exact: false, partial: true, and: false, fuzzy: false } }).map((x) => x.display), ['錯誤', '錯誤取消し']);
  assert.deepEqual(search(index, '錯誤', { matchModes: { exact: false, partial: false, and: false, fuzzy: false } }), []);
});

test('filters by kind, subject and book before ranking', () => {
  const book1 = baseBook({ bookId: 'civil', title: '民法本', subjects: ['民法'], matterEntries: [{ term: '既判力', pages: ['1'] }] });
  const book2 = baseBook({ bookId: 'procedure', chunkId: '33333333-3333-4333-8333-333333333333', title: '民訴本', subjects: ['民事訴訟法'], matterEntries: [{ term: '既判力', pages: ['2'] }], statuteEntries: [{ statute: '民事訴訟法', article: '114', paragraph: null, item: null, citationText: '民事訴訟法114条', pages: ['3'] }] });
  const index = buildIndex([book1, book2]);
  const result = search(index, '既判力', { subjectIds: ['民事訴訟法'], bookIds: ['procedure'], kind: 'matter', matchModes: { exact: true, partial: true, and: true, fuzzy: true } });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].sources.map((s) => s.bookId), ['procedure']);
  assert.equal(search(index, '114', { kind: 'case' }).length, 0);
});

test('Damerau-Levenshtein supports transposition and fixed fuzzy thresholds', () => {
  assert.equal(damerauLevenshtein('abcdef', 'abdcef'), 1);
  const short = buildIndex([baseBook({ matterEntries: [{ term: '錯誤', pages: ['1'] }] })]);
  assert.equal(search(short, '錯誤', { matchModes: { exact: false, partial: false, and: false, fuzzy: true } }).length, 0);

  const medium = buildIndex([baseBook({ matterEntries: [{ term: '代位権', pages: ['1'] }, { term: '代位件', pages: ['2'] }] })]);
  assert.ok(search(medium, '代位権', { matchModes: { exact: false, partial: false, and: false, fuzzy: true } }).some((x) => x.display === '代位件'));

  const long = buildIndex([baseBook({ matterEntries: [{ term: '債権者代位権制度', pages: ['1'] }, { term: '債権者代位件制渡', pages: ['2'] }] })]);
  assert.ok(search(long, '債権者代位権制度', { matchModes: { exact: false, partial: false, and: false, fuzzy: true } }).some((x) => x.display === '債権者代位件制渡'));
});
