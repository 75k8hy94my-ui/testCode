import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dashboard from '../home-dashboard.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const DEFAULT_IDS = ['bookshelf', 'index-search', 'statutes', 'study', 'quiz', 'links', 'egov', 'courts', 'moj-exam'];

test('home dashboard starts with useful app and official-law cards', () => {
  assert.deepEqual(dashboard.DEFAULT_CARD_IDS, DEFAULT_IDS);
  for (const id of DEFAULT_IDS) assert.ok(dashboard.CARD_CATALOG[id], `${id} should exist in the card catalog`);
  assert.equal(dashboard.CARD_CATALOG['index-search'].href, 'index-search.html');
  assert.equal(dashboard.CARD_CATALOG.statutes.href, 'statutes.html');
});

test('home layout normalization keeps order, removes duplicates, and preserves an intentional empty home', () => {
  assert.deepEqual(dashboard.normalizeLayout(null), DEFAULT_IDS);
  assert.deepEqual(dashboard.normalizeLayout(['study', 'study', 'unknown', 'bookshelf']), ['study', 'bookshelf']);
  assert.deepEqual(dashboard.normalizeLayout([]), []);
  assert.deepEqual(dashboard.normalizeLayout(['removed-card']), DEFAULT_IDS);
});

test('home cards can be added, removed, and reordered without mutating the source layout', () => {
  const source = ['bookshelf', 'study', 'quiz'];
  assert.deepEqual(dashboard.removeCard(source, 'study'), ['bookshelf', 'quiz']);
  assert.deepEqual(dashboard.addCard(['bookshelf'], 'study'), ['bookshelf', 'study']);
  assert.deepEqual(dashboard.addCard(['bookshelf', 'study'], 'study'), ['bookshelf', 'study']);
  assert.deepEqual(dashboard.moveCard(source, 'study', -1), ['study', 'bookshelf', 'quiz']);
  assert.deepEqual(dashboard.moveCard(source, 'study', 1), ['bookshelf', 'quiz', 'study']);
  assert.deepEqual(source, ['bookshelf', 'study', 'quiz']);
});

test('existing homes receive the statutes card once without re-adding it after user removal', () => {
  const storage = new Map([['mangaReaderHomeCards', JSON.stringify(['bookshelf', 'index-search', 'study'])]]);
  assert.deepEqual(dashboard.loadLayout(storage), ['bookshelf', 'index-search', 'statutes', 'study']);
  assert.equal(storage.get(dashboard.HOME_LAYOUT_STATUTES_MIGRATION_KEY), '1');
  dashboard.saveLayout(['bookshelf', 'study'], storage);
  assert.deepEqual(dashboard.loadLayout(storage), ['bookshelf', 'study']);
});

test('saved migrated home layouts remain authoritative and can add index search manually', () => {
  const storage = new Map([['mangaReaderHomeCards', JSON.stringify(['bookshelf', 'study'])], [dashboard.HOME_LAYOUT_STATUTES_MIGRATION_KEY, '1']]);
  assert.deepEqual(dashboard.loadLayout(storage), ['bookshelf', 'study']);
  assert.equal(dashboard.hiddenCardIds(['bookshelf', 'study']).includes('index-search'), true);
  assert.deepEqual(dashboard.addCard(['bookshelf', 'study'], 'index-search'), ['bookshelf', 'study', 'index-search']);
});

test('home layout storage round-trips and missing storage falls back to defaults', () => {
  const storage = new Map();
  assert.deepEqual(dashboard.loadLayout(storage), DEFAULT_IDS);
  dashboard.saveLayout(['study', 'bookshelf'], storage);
  assert.deepEqual(dashboard.loadLayout(storage), ['study', 'bookshelf']);
});

test('official cards stay on first-party legal information domains', () => {
  const allowed = new Set(['laws.e-gov.go.jp', 'www.courts.go.jp', 'www.moj.go.jp']);
  Object.values(dashboard.CARD_CATALOG).forEach((card) => {
    if (card.kind !== 'official') return;
    const url = new URL(card.href);
    assert.equal(url.protocol, 'https:');
    assert.ok(allowed.has(url.hostname), `${card.id} should use an official domain`);
  });
});

test('home page is vault-gated, editable, and vault unlock enters it', () => {
  const home = read('home.html');
  assert.match(home, /class=["']auth-pending["']/);
  assert.match(home, /MangaVault\.loadActive\(\)/);
  assert.match(home, /window\.location\.replace\(['"]sync\.html['"]\)/);
  assert.match(home, /window\.location\.replace\(['"]index\.html['"]\)/);
  for (const id of ['homeGrid', 'editHomeBtn', 'addCardPanel', 'homeSyncStatus']) assert.match(home, new RegExp(`id=["']${id}["']`));
  assert.match(home, /home-dashboard\.js/);
  assert.match(home, /vault-payload\.js/);

  assert.match(read('sync.html'), /function\s+goReader\(\)\s*\{\s*window\.location\.replace\(['"]home\.html['"]\)/);
  assert.match(read('vault-payload.js'), /homeCards:\s*['"]mangaReaderHomeCards['"]/);
  const verifier = read('scripts/check-static.mjs');
  assert.match(verifier, /['"]home\.html['"]/);
  assert.match(verifier, /['"]home-dashboard\.js['"]/);
});
