import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dashboard from '../home-dashboard.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const LEGACY_DEFAULT_IDS = ['bookshelf'];
const DEFAULT_IDS = ['manga', 'video', 'statutes', 'definitions'];

test('home dashboard exposes four fixed shortcut cards', () => {
  assert.deepEqual(dashboard.DEFAULT_CARD_IDS, DEFAULT_IDS);
  assert.deepEqual(Object.keys(dashboard.CARD_CATALOG), DEFAULT_IDS);
  assert.deepEqual(dashboard.CARD_CATALOG.manga, { id:'manga', title:'漫画', kind:'internal', href:'manga.html', badge:'APP' });
  assert.deepEqual(dashboard.CARD_CATALOG.video, { id:'video', title:'動画', kind:'internal', href:'video.html', badge:'APP' });
  assert.deepEqual(dashboard.CARD_CATALOG.statutes, { id:'statutes', title:'逐条集', kind:'internal', href:'statutes.html', badge:'APP' });
  assert.equal('subtitle' in dashboard.CARD_CATALOG.manga, false);
  assert.equal('subtitle' in dashboard.CARD_CATALOG.video, false);
  assert.equal('subtitle' in dashboard.CARD_CATALOG.statutes, false);
  assert.deepEqual(dashboard.CARD_CATALOG.definitions, { id:'definitions', title:'定義カード', kind:'internal', href:'definition-cards.html', badge:'APP' });
});

test('fixed four cards ignore old Vault layouts and disabled editing APIs', () => {
  for (const old of [['bookshelf'], ['manga'], ['video'], [], ['statutes'], ['video','manga']]) {
    const storage = new Map([['mangaReaderHomeCards', JSON.stringify(old)]]);
    assert.deepEqual(dashboard.loadLayout(storage), DEFAULT_IDS);
    assert.deepEqual(dashboard.normalizeLayout(old), DEFAULT_IDS);
    assert.deepEqual(dashboard.saveLayout(old, storage), DEFAULT_IDS);
    assert.deepEqual(dashboard.removeCard(old, 'statutes'), DEFAULT_IDS);
    assert.deepEqual(dashboard.moveCard(old, 'video', -1), DEFAULT_IDS);
    assert.deepEqual(dashboard.hiddenCardIds(old), []);
    assert.deepEqual(JSON.parse(storage.get('mangaReaderHomeCards')), old);
  }
});
test('home UI has no remove, reorder, or add controls', () => {
  const spa = read('home-profile-spa.js');
  assert.doesNotMatch(spa, /cardEditControls|addCardPanel|emptyEditBtn/);
  assert.match(spa, /layout=Home.DEFAULT_CARD_IDS.slice\(\)/);
});
test('home cards render without short description text', () => {
  const spa = read('home-profile-spa.js');
  assert.match(spa, /const marks=\{manga:'漫',video:'動',statutes:'法'\}/);
  assert.doesNotMatch(spa, /card\.subtitle/);
  assert.match(spa, /title\.textContent=card\.title;root\.append\(title\)/);
});

test('home page is vault-gated and the shared routes remain intact', () => {
  const home = read('home.html');
  const spa = read('home-profile-spa.js');
  assert.match(home, /class=["']auth-pending["']/);
  assert.match(spa, /MangaVault\.loadActive\(\)/);
  assert.match(spa, /window\.location\.replace\(['"]sync\.html['"]\)/);
  assert.match(spa, /window\.location\.replace\(['"]index\.html['"]\)/);
  assert.match(home, /home-dashboard\.js\?v=[\w-]+/);
  assert.match(spa, /MangaVault\.saveLocalChanges/);
  assert.match(read('sync.html'), /\['images\.html','drive-gallery\.html'\]\.includes\(next\) \? next : 'home\.html'/);
});

test('logout remains on the profile settings route', () => {
  const spa = read('home-profile-spa.js');
  const menu = read('profile-menu.js');
  assert.match(spa, /id=["']profileLogoutBtn["']/);
  assert.match(menu, /EncryptedChunkCache\.clearAll/);
  assert.match(menu, /MangaVault\.saveSession\(null\)/);
  assert.doesNotMatch(read('home.html'), /id=["']homeLogoutBtn["']/);
});

test('profile display setting save message stays concise', () => {
  const spa = read('home-profile-spa.js');
  assert.match(spa, /runHomeSync\('保存しました'\)/);
  assert.doesNotMatch(spa, /表示設定を保存しました/);
});
