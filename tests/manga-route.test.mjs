import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const route = fs.readFileSync('manga-list-route.js', 'utf8');
const spa = fs.readFileSync('home-profile-spa.js', 'utf8');
const manga = fs.readFileSync('manga.html', 'utf8');

test('manga route uses the shared entry and never fetches or evaluates reader.html', () => {
  assert.match(route, /MangaListEntryFactory\.create\(/);
  assert.doesNotMatch(route, /fetch\(\s*['"]reader\.html/);
  assert.doesNotMatch(route, /fetch\s*\(/);
  assert.match(spa, /renderManga\(/);
  assert.match(spa, /route === 'manga'|route==='manga'/);
  assert.doesNotMatch(spa, /else if\(route==='manga'\)renderReader\(/);
  assert.match(manga, /manga-list-route\.js\?v=/);
});

test('manga route loads the shared runtime pieces without reader or video entry assets', () => {
  for (const name of [
    'manga-list-entry.js',
    'manga-list-template.js',
    'manga-list-mount.js',
    'manga-list-runtime-context.js',
    'manga-list-host-runtime.js',
    'manga-list-runtime.js',
  ]) assert.match(route, new RegExp(name.replace('.', '\\.') + '\\?v='));
  assert.doesNotMatch(route, /reader-saved-list-template|video-data\.js|video-library\.js/);
});

test('manga route reuses the existing list event factories', () => {
  for (const name of [
    'manga-list-search-events.js',
    'manga-list-sort-events.js',
    'manga-list-filter-events.js',
    'manga-list-folder-events.js',
    'manga-list-smart-list-events.js',
    'manga-list-pagination-events.js',
    'manga-list-navigation-events.js',
    'manga-list-bulk-events.js',
  ]) assert.match(route, new RegExp(name.replace('.', '\\.') + '\\?v='));
  assert.match(route, /bindFactory\(MangaListSearchEventsFactory/);
  assert.match(route, /bindFactory\(MangaListPaginationEventsFactory/);
  assert.match(route, /bindFactory\(MangaListNavigationEventsFactory/);
  assert.match(route, /factory\.create\(deps\)\.bind\(factoryElements\)/);
});

test('manga shell keeps the existing shared authentication and vault bootstrap', () => {
  assert.match(manga, /supabase-config\.js/);
  assert.match(manga, /vault-session\.js/);
  assert.match(manga, /browser-storage\.js/);
  assert.match(manga, /vault-payload\.js/);
  assert.match(manga, /feature-flags\.js/);
  assert.match(manga, /media-access-gate\.js\?v=20260918-vpn-panel-toggle/);
  assert.match(manga, /home-profile-spa\.js\?v=/);
});
