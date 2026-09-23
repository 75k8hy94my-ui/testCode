import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dashboard from '../home-dashboard.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const LEGACY_DEFAULT_IDS = ['bookshelf'];
const DEFAULT_IDS = ['manga', 'video'];

test('home dashboard exposes only manga and video cards', () => {
  assert.deepEqual(dashboard.DEFAULT_CARD_IDS, DEFAULT_IDS);
  assert.deepEqual(Object.keys(dashboard.CARD_CATALOG), DEFAULT_IDS);
  assert.deepEqual(dashboard.CARD_CATALOG.manga, { id:'manga', title:'漫画', kind:'internal', href:'manga.html', badge:'APP' });
  assert.deepEqual(dashboard.CARD_CATALOG.video, { id:'video', title:'動画', kind:'internal', href:'video.html', badge:'APP' });
  assert.equal('subtitle' in dashboard.CARD_CATALOG.manga, false);
  assert.equal('subtitle' in dashboard.CARD_CATALOG.video, false);
});

test('legacy bookshelf layout migrates to manga and video', () => {
  assert.deepEqual(dashboard.normalizeLayout(LEGACY_DEFAULT_IDS), DEFAULT_IDS);
  const storage = new Map([['mangaReaderHomeCards', JSON.stringify(LEGACY_DEFAULT_IDS)]]);
  assert.deepEqual(dashboard.loadLayout(storage), DEFAULT_IDS);
  assert.deepEqual(JSON.parse(storage.get('mangaReaderHomeCards')), DEFAULT_IDS);
});

test('home layout normalization keeps order, removes duplicates, and preserves an intentional empty home', () => {
  assert.deepEqual(dashboard.normalizeLayout(null), DEFAULT_IDS);
  assert.deepEqual(dashboard.normalizeLayout(['video', 'manga', 'video']), ['video', 'manga']);
  assert.deepEqual(dashboard.normalizeLayout([]), []);
  assert.deepEqual(dashboard.normalizeLayout(['removed-card']), DEFAULT_IDS);
});

test('home cards can be added, removed, and reordered without mutating source layout', () => {
  const source = ['manga', 'video'];
  assert.deepEqual(dashboard.removeCard(source, 'video'), ['manga']);
  assert.deepEqual(dashboard.addCard(['manga'], 'video'), ['manga', 'video']);
  assert.deepEqual(dashboard.addCard(['manga', 'video'], 'video'), ['manga', 'video']);
  assert.deepEqual(dashboard.moveCard(source, 'video', -1), ['video', 'manga']);
  assert.deepEqual(source, ['manga', 'video']);
});

test('saved custom home layouts ignore removed cards', () => {
  const storage = new Map([['mangaReaderHomeCards', JSON.stringify(['manga', 'index-search'])]]);
  assert.deepEqual(dashboard.loadLayout(storage), ['manga']);
  assert.deepEqual(dashboard.hiddenCardIds(['manga']), ['video']);
  assert.deepEqual(dashboard.addCard(['manga'], 'index-search'), ['manga']);
});

test('home layout storage round-trips and missing storage falls back to defaults', () => {
  const storage = new Map();
  assert.deepEqual(dashboard.loadLayout(storage), DEFAULT_IDS);
  dashboard.saveLayout(['video', 'manga'], storage);
  assert.deepEqual(dashboard.loadLayout(storage), ['video', 'manga']);
});

test('home cards render without short description text', () => {
  const spa = read('home-profile-spa.js');
  assert.match(spa, /const marks=\{manga:'漫',video:'動'\}/);
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
  assert.match(home, /home-dashboard\.js\?v=20260924-home-media-cards/);
  assert.match(spa, /漫画・動画・作者カードなどのデータ/);
  assert.match(read('sync.html'), /function\s+goReader\(\)\s*\{\s*window\.location\.replace\(['"]home\.html['"]\)/);
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
