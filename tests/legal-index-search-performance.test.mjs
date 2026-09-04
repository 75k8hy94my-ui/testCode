import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import Search from '../legal-index-search.js';

function makeBooks(bookCount, entriesPerBook) {
  return Array.from({ length: bookCount }, (_, b) => ({
    type: 'index-book', version: 1, bookId: `book-${b}`, chunkId: `chunk-${b}`,
    book: { title: `教材${b}`, subjects: [b % 2 ? '民法' : '民事訴訟法'] },
    matterEntries: Array.from({ length: entriesPerBook }, (_, e) => ({ term: `論点 ${b} ${e}`, pages: [String(e + 1)] })),
    caseEntries: [], statuteEntries: []
  }));
}

function measure(label, fn) {
  const start = performance.now();
  const value = fn();
  const ms = performance.now() - start;
  console.log(`[legal-index-perf] ${label}: ${ms.toFixed(1)}ms`);
  return { value, ms };
}

test('50k corpus stays below catastrophic build/search ceilings including fuzzy', () => {
  const books = makeBooks(50, 1000);
  const built = measure('50k build', () => Search.buildIndex(books));
  assert.ok(built.ms < 30000, `50k build catastrophic: ${built.ms}ms`);
  const exact = measure('50k exact', () => Search.search(built.value, '論点 20 500', { matchModes: { exact: true, partial: false, and: false, fuzzy: false } }));
  const partial = measure('50k partial', () => Search.search(built.value, '20 50', { matchModes: { exact: false, partial: true, and: false, fuzzy: false } }));
  const andMatch = measure('50k and', () => Search.search(built.value, '論点 500', { matchModes: { exact: false, partial: false, and: true, fuzzy: false } }));
  const fuzzy = measure('50k fuzzy', () => Search.search(built.value, '論点2050O', { matchModes: { exact: false, partial: false, and: false, fuzzy: true } }));
  for (const sample of [exact, partial, andMatch, fuzzy]) assert.ok(sample.ms < 15000, `50k search catastrophic: ${sample.ms}ms`);
  assert.ok(exact.value.length >= 1);
});

test('100k corpus stays below catastrophic build and normal-search ceilings', () => {
  const books = makeBooks(100, 1000);
  const built = measure('100k build', () => Search.buildIndex(books));
  assert.ok(built.ms < 30000, `100k build catastrophic: ${built.ms}ms`);
  const exact = measure('100k exact', () => Search.search(built.value, '論点 99 999', { matchModes: { exact: true, partial: false, and: false, fuzzy: false } }));
  const partial = measure('100k partial', () => Search.search(built.value, '999', { matchModes: { exact: false, partial: true, and: false, fuzzy: false } }));
  const andMatch = measure('100k and', () => Search.search(built.value, '論点 999', { matchModes: { exact: false, partial: false, and: true, fuzzy: false } }));
  for (const sample of [exact, partial, andMatch]) assert.ok(sample.ms < 15000, `100k search catastrophic: ${sample.ms}ms`);
  assert.ok(exact.value.length >= 1);
});
