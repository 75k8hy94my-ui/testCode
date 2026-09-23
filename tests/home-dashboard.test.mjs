import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dashboard from '../home-dashboard.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const LEGACY_DEFAULT_IDS = ['bookshelf'];
const DEFAULT_IDS = ['bookshelf'];

test('home dashboard starts with useful app and official-law cards', () => {
  assert.deepEqual(dashboard.DEFAULT_CARD_IDS, DEFAULT_IDS);
  for (const id of DEFAULT_IDS) assert.ok(dashboard.CARD_CATALOG[id], `${id} should exist in the card catalog`);
  assert.deepEqual(Object.keys(dashboard.CARD_CATALOG), ['bookshelf']);
});

test('home layout normalization keeps order, removes duplicates, and preserves an intentional empty home', () => {
  assert.deepEqual(dashboard.normalizeLayout(null), DEFAULT_IDS);
  assert.deepEqual(dashboard.normalizeLayout(['unknown', 'unknown', 'bookshelf']), ['bookshelf']);
  assert.deepEqual(dashboard.normalizeLayout([]), []);
  assert.deepEqual(dashboard.normalizeLayout(['removed-card']), DEFAULT_IDS);
});

test('home cards can be added, removed, and reordered without mutating the source layout', () => {
  const source = ['bookshelf'];
  assert.deepEqual(dashboard.removeCard(source, 'bookshelf'), []);
  assert.deepEqual(dashboard.addCard([], 'bookshelf'), ['bookshelf']);
  assert.deepEqual(dashboard.addCard(['bookshelf'], 'bookshelf'), ['bookshelf']);
  assert.deepEqual(dashboard.moveCard(source, 'bookshelf', -1), ['bookshelf']);
  assert.deepEqual(dashboard.moveCard(source, 'bookshelf', 1), ['bookshelf']);
  assert.deepEqual(source, ['bookshelf']);
});

test('saved custom home layouts ignore removed cards', () => {
  const storage = new Map([['mangaReaderHomeCards', JSON.stringify(['bookshelf', 'index-search'])]]);
  assert.deepEqual(dashboard.loadLayout(storage), ['bookshelf']);
  assert.deepEqual(dashboard.hiddenCardIds(['bookshelf']), []);
  assert.deepEqual(dashboard.addCard(['bookshelf'], 'index-search'), ['bookshelf']);
});

test('legacy home layouts do not resurrect removed cards', () => {
  const storage = new Map([['mangaReaderHomeCards', JSON.stringify(LEGACY_DEFAULT_IDS)]]);
  assert.deepEqual(dashboard.loadLayout(storage), DEFAULT_IDS);
  assert.deepEqual(JSON.parse(storage.get('mangaReaderHomeCards')), DEFAULT_IDS);
});

test('home layout storage round-trips and missing storage falls back to defaults', () => {
  const storage = new Map();
  assert.deepEqual(dashboard.loadLayout(storage), DEFAULT_IDS);
  dashboard.saveLayout(['index-search', 'bookshelf'], storage);
  assert.deepEqual(dashboard.loadLayout(storage), ['bookshelf']);
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
  const spa = read('home-profile-spa.js');
  assert.match(home, /class=["']auth-pending["']/);
  assert.match(spa, /MangaVault\.loadActive\(\)/);
  assert.match(spa, /window\.location\.replace\(['"]sync\.html['"]\)/);
  assert.match(spa, /window\.location\.replace\(['"]index\.html['"]\)/);
  assert.match(home, /id=["']editHomeBtn["']/);
  for (const id of ['homeGrid', 'addCardPanel', 'homeSyncStatus']) assert.match(spa, new RegExp(`id=["']${id}["']`));
  assert.match(spa, /const marks=\{bookshelf:'本'\}/);
  assert.doesNotMatch(spa, /学習・索引設定・六法メモ|索引キャッシュ|リンク帳/);
  assert.match(spa, /本棚・動画・作者カードなどのデータ/);
  assert.match(home, /home-dashboard\.js/);
  assert.match(home, /vault-payload\.js/);

  assert.match(read('sync.html'), /function\s+goReader\(\)\s*\{\s*window\.location\.replace\(['"]home\.html['"]\)/);
  assert.match(read('vault-payload.js'), /homeCards:\s*['"]mangaReaderHomeCards['"]/);
  const verifier = read('scripts/check-static.mjs');
  assert.match(verifier, /['"]home\.html['"]/);
  assert.match(verifier, /['"]home-dashboard\.js['"]/);
});

test('logout lives on the profile settings route', () => {
  const spa = read('home-profile-spa.js');
  const menu = read('profile-menu.js');
  const sync = read('sync.html');
  const featureFlags = read('feature-flags.js');

  assert.match(spa, /id=["']profileLogoutBtn["']/);
  assert.match(menu, /EncryptedChunkCache\.clearAll/);
  assert.match(menu, /MangaVault\.saveSession\(null\)/);
  assert.match(menu, /window\.ProfileMenu/);
  assert.doesNotMatch(read('home.html'), /id=["']homeLogoutBtn["']/);
  assert.doesNotMatch(sync, /id=["']logoutBtn["']/);
  assert.match(featureFlags, /getElementById\(['"]listLogoutBtn['"]\)/);
  assert.match(featureFlags, /readerLogout\.hidden\s*=\s*true/);
});

test('profile display setting save message stays concise', () => {
  const spa = read('home-profile-spa.js');
  assert.match(spa, /runHomeSync\('保存しました'\)/);
  assert.doesNotMatch(spa, /表示設定を保存しました/);
});
