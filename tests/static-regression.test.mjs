import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('recommendation picker rotates fallback works and excludes disabled local manga', () => {
  const source = read('recommendations.js');
  assert.match(source, /config\.localReaderEnabled === false && item\.localSync/);
});

test('bookshelf cover cache remains item-specific and recovers stale sources', () => {
  const body = read('manga-list-host-runtime.js');
  assert.match(body, /const identityKey = itemId \? 'item:' \+ String\(itemId\) : folderUrl/);
  assert.match(body, /const cacheKey = \[identityKey, folderUrl, String\(resolvedWidth\), JSON\.stringify\(pattern \|\| null\)/);
  assert.match(body, /sourceCache\.delete\(cacheKey\)/);
  assert.match(body, /failedCache\.delete\(cacheKey\)/);
});

test('manga route still owns the shelf list, migrations, ordering, and item navigation', () => {
  const route = read('manga-list-route.js');
  const runtime = read('manga-list-runtime.js');
  for (const feature of ['manga-list-template.js', 'manga-list-folder-events.js', 'manga-list-bulk-events.js', 'manga-list-state.js', 'manga-list-view-model.js']) {
    assert.ok(route.includes(feature), feature);
  }
  assert.match(route, /host\.navigateToReader\(item\)/);
  assert.match(route, /mangaReaderSavedItems/);
  assert.match(runtime, /context\.moveItemInList\(item, list, -1\)/);
  assert.match(runtime, /context\.moveItemInList\(item, list, 1\)/);
});

test('Reader document includes only item reader UI and reader-specific runtime modules', () => {
  const reader = read('reader.html');
  for (const included of ['reader-target.js', 'reader-item-repository.js', 'reader-runtime.js', 'encrypted-asset-reader.js', 'encrypted-asset-item.js']) {
    assert.match(reader, new RegExp(included.replaceAll('.', '\\.') + '(?:\\?v=[^" ]+)?'));
  }
  for (const forbidden of ['manga-list-', 'savedListOverlay', 'videoLibrary', 'backup-format.js', 'profile-menu.js', 'app-desktop-rail.js', 'mobile-bottom-nav.js']) {
    assert.doesNotMatch(reader, new RegExp(forbidden.replaceAll('.', '\\.')), forbidden);
  }
});

test('Reader access preserves session, Vault, then Reader startup order', () => {
  const reader = read('reader.html');
  assert.match(reader, /MangaReaderBootPromise = \(async \(\) =>/);
  assert.ok(reader.indexOf('if (!hasSession()') < reader.indexOf('MangaVault.loadActive()'));
  assert.ok(reader.indexOf('MangaVault.loadActive()') < reader.indexOf('MangaVault.ensureSession()'));
  assert.ok(reader.indexOf('await MangaVault.ensureSession()') < reader.indexOf('ReaderRuntimeFactory.create('));
});

test('Reader uses itemId identity and returns to the bookshelf', () => {
  const reader = read('reader.html');
  const runtime = read('reader-runtime.js');
  assert.match(read('reader-target.js'), /const QUERY_KEY = 'item'/);
  assert.match(read('reader-target.js'), /searchParams\.get\(QUERY_KEY\)/);
  assert.match(runtime, /repository\.loadItem\(id\)/);
  assert.doesNotMatch(runtime, /find\(\(item\) => item\.url/);
  assert.match(runtime, /location\.replace\('manga\.html'\)/);
});

test('Reader stores progress and favorite updates through its focused repository', () => {
  const runtime = read('reader-runtime.js');
  const progress = read('reader-progress-repository.js');
  const repository = read('reader-item-repository.js');
  assert.match(runtime, /favorite: !currentItem\.favorite/);
  assert.match(runtime, /progressRepository\?\.commit/);
  assert.match(progress, /mangaReaderLastPage/);
  assert.match(repository, /updateItem\(itemId/);
  assert.match(repository, /dependencies\.scheduleSync\(\)/);
  assert.match(read('reader.html'), /MangaVault\.savePayload\(MangaVaultPayload\.buildFromLocalStorage\(\)\)/);
  assert.match(read('reader-runtime.js'), /repository\.flushSync\?\.\(\)/);
});

test('Vault backups retain migration and author-card payload contracts', () => {
  const backup = read('backup-format.js');
  const payload = read('vault-payload.js');
  assert.match(backup, /authorCards/);
  assert.match(payload, /authorCards/);
  assert.doesNotMatch(read('sync.html'), /id=["']savePassphrase["']/);
});

test('Reader and app pages retain the no-backdrop fallback', () => {
  for (const page of ['index.html', 'sync.html']) {
    assert.match(read(page), /backdrop-filter/);
  }
  const reader = read('reader.html');
  assert.match(reader, /@supports not \(\(backdrop-filter:/);
});
