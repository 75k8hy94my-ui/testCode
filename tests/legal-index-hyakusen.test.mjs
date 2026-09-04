import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import searchApi from '../legal-index-search.js';

const baseCase = {
  court: '最高裁判所',
  date: '平成9年12月18日',
  reporter: '民集',
  volume: '51',
  issue: '10',
  reportPage: '4247',
  citationText: '最高裁判所 平成9年12月18日 民集51巻10号4247頁',
  pages: ['12']
};

const latest = {
  collectionId: 'minpo-2', collectionLabel: '民法判例百選Ⅱ', shortLabel: '民法Ⅱ',
  edition: 9, latestEdition: 9, number: 14, driveFileName: '民法Ⅱ14.pdf',
  case: { court: baseCase.court, date: baseCase.date, reporter: baseCase.reporter, volume: baseCase.volume, issue: baseCase.issue, reportPage: baseCase.reportPage }
};

const old = {
  ...latest,
  edition: 8,
  number: 37,
  driveFileName: '民法Ⅱ8版37.pdf'
};

function buildWithCase(caseEntry) {
  return searchApi.buildIndex([{
    type: 'index-book',
    bookId: 'book-1',
    book: { title: 'テスト索引', subjects: ['民法'] },
    caseEntries: [caseEntry]
  }]);
}

test('case search annotates a strict Hyakusen match with the latest edition label', () => {
  const results = searchApi.search(buildWithCase(baseCase), '平成9年12月18日', {
    kind: 'case',
    hyakusenEntries: [old, latest]
  });
  assert.equal(results.length, 1);
  assert.match(results[0].display, /［民法Ⅱ14］/);
  assert.doesNotMatch(results[0].display, /8版37/);
});

test('same decision date with a different reporter page is never annotated', () => {
  const differentDecision = {
    ...baseCase,
    reportPage: '4248',
    citationText: '最高裁判所 平成9年12月18日 民集51巻10号4248頁'
  };
  const results = searchApi.search(buildWithCase(differentDecision), '平成9年12月18日', {
    kind: 'case',
    hyakusenEntries: [latest]
  });
  assert.equal(results.length, 1);
  assert.doesNotMatch(results[0].display, /民法Ⅱ/);
});

test('old-edition-only case is annotated with an explicit edition', () => {
  const results = searchApi.search(buildWithCase(baseCase), '平成9年12月18日', {
    kind: 'case',
    hyakusenEntries: [old]
  });
  assert.match(results[0].display, /［民法Ⅱ8版37］/);
});

test('incomplete case-text fallback is never treated as a strict Hyakusen identity', () => {
  const incomplete = {
    date: baseCase.date,
    citationText: '最高裁判所 平成9年12月18日 民集51巻10号4247頁',
    pages: ['12']
  };
  const results = searchApi.search(buildWithCase(incomplete), '平成9年12月18日', {
    kind: 'case',
    hyakusenEntries: [latest]
  });
  assert.equal(results[0].identityKey.startsWith('case-text|'), true);
  assert.doesNotMatch(results[0].display, /民法Ⅱ/);
});

test('browser search integration loads the Hyakusen catalog and exposes the Hyakusen page', async () => {
  const source = await readFile(new URL('../legal-index-search.js', import.meta.url), 'utf8');
  assert.match(source, /hyakusen-catalog\.js/);
  assert.match(source, /hyakusen\.html/);
  assert.match(source, /判例百選/);
});

test('worker runtime imports the same Hyakusen catalog before legal search', async () => {
  const source = await readFile(new URL('../legal-index-search-worker.js', import.meta.url), 'utf8');
  assert.match(source, /importScripts\('hyakusen-catalog\.js'\)/);
  const catalogPos = source.indexOf("importScripts('hyakusen-catalog.js')");
  const searchPos = source.indexOf("importScripts('legal-index-search.js')");
  assert.ok(catalogPos >= 0 && searchPos > catalogPos);
});
