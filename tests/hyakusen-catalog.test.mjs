import test from 'node:test';
import assert from 'node:assert/strict';
import catalogApi from '../hyakusen-catalog.js';

const {
  DEFAULT_ENTRIES,
  normalizeEntry,
  caseKey,
  labelForEntry,
  findCaseListings,
  primaryListing,
  collections,
  entriesForCollection
} = catalogApi;

const targetCase = {
  court: '最高裁判所',
  date: '平成9年12月18日',
  reporter: '民集',
  volume: '51',
  issue: '10',
  reportPage: '4247'
};

const oldEntry = {
  collectionId: 'minpo-2',
  collectionLabel: '民法判例百選Ⅱ',
  shortLabel: '民法Ⅱ',
  edition: 8,
  latestEdition: 9,
  number: 37,
  driveFileName: '民法Ⅱ8版37.pdf',
  case: targetCase
};

const latestEntry = {
  ...oldEntry,
  edition: 9,
  number: 14,
  driveFileName: '民法Ⅱ14.pdf'
};

test('production catalog starts empty until the user supplies authoritative Hyakusen data', () => {
  assert.deepEqual(DEFAULT_ENTRIES, []);
});

test('latest edition label omits edition while old edition label states it', () => {
  assert.equal(labelForEntry(normalizeEntry(latestEntry)), '民法Ⅱ14');
  assert.equal(labelForEntry(normalizeEntry(oldEntry)), '民法Ⅱ8版37');
});

test('same case across editions resolves to the latest edition by default', () => {
  const listings = findCaseListings(targetCase, [oldEntry, latestEntry]);
  assert.equal(listings.length, 2);
  assert.equal(primaryListing(targetCase, [oldEntry, latestEntry]).number, 14);
  assert.equal(primaryListing(targetCase, [oldEntry, latestEntry]).edition, 9);
});

test('old-only case resolves to the newest old edition', () => {
  const edition7 = { ...oldEntry, edition: 7, number: 22, driveFileName: '民法Ⅱ7版22.pdf' };
  const chosen = primaryListing(targetCase, [edition7, oldEntry]);
  assert.equal(chosen.edition, 8);
  assert.equal(labelForEntry(chosen), '民法Ⅱ8版37');
});

test('same decision date never matches when reporter identity differs', () => {
  const differentPage = { ...targetCase, reportPage: '4248' };
  const differentReporter = { ...targetCase, reporter: '刑集', reportPage: '500' };
  assert.notEqual(caseKey(targetCase), caseKey(differentPage));
  assert.notEqual(caseKey(targetCase), caseKey(differentReporter));
  assert.deepEqual(findCaseListings(differentPage, [latestEntry]), []);
  assert.deepEqual(findCaseListings(differentReporter, [latestEntry]), []);
});

test('Hyakusen matching requires court, date, reporter, volume, issue, and reporter page', () => {
  for (const field of ['court', 'date', 'reporter', 'volume', 'issue', 'reportPage']) {
    const broken = structuredClone(latestEntry);
    broken.case[field] = '';
    assert.throws(() => normalizeEntry(broken), new RegExp(field));
  }
});

test('collection metadata exposes editions and entries in number order', () => {
  const info = collections([oldEntry, latestEntry]);
  assert.equal(info.length, 1);
  assert.equal(info[0].collectionId, 'minpo-2');
  assert.equal(info[0].latestEdition, 9);
  assert.deepEqual(info[0].editions, [9, 8]);
  assert.deepEqual(entriesForCollection('minpo-2', 9, [
    { ...latestEntry, number: 20, driveFileName: '民法Ⅱ20.pdf' },
    latestEntry
  ]).map((entry) => entry.number), [14, 20]);
});
