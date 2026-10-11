import test from 'node:test';
import assert from 'node:assert/strict';
import history from '../vault-history.js';
import payloadApi from '../vault-payload.js';

const normalize = payloadApi.normalize;

test('diff reports additions, property changes and deletions in stable JSON Pointer order', () => {
  const diff = history.diffVaultSnapshots(
    { items: [{ id: 'a/b', title: 'old', folderId: 'f' }, { id: 'gone', title: 'gone' }] },
    { items: [{ id: 'a/b', title: 'new', folderId: 'f' }, { id: 'new', title: 'new' }] },
    normalize,
  );

  assert.deepEqual(diff.map(({ type, path }) => [type, path]), [
    ['change', '/items/a~1b/title'],
    ['delete', '/items/gone'],
    ['add', '/items/new'],
  ]);
});

test('restore remaps tombstoned IDs and all known relationships while retaining tombstones and counters', () => {
  const target = normalize({
    folders: [{ id: 'folder-old', name: 'Folder' }],
    items: [{ id: 'manga-old', folderId: 'folder-old', title: 'Manga' }],
    videos: [{ id: 'video-old', folderId: 'video-folder-old', title: 'Video' }],
    videoFolders: [{ id: 'video-folder-old', name: 'Videos' }],
    mangaInfo: { 'manga-old': { title: 'Manga' } }, toc: { 'manga-old': [] }, lastPages: { 'manga-old': 8 },
    videoMeta: { 'video-old': { folderId: 'video-folder-old' } },
    videoMarkers: { 'video-old': [{ id: 'mark', seconds: 5, icon: 'water' }] },
    videoShortsState: { queue: [{ videoId: 'video-old', startSeconds: 0, endSeconds: 8, entryType: 'random-short', tier: 1 }], currentIndex: 0, knownVideoIds: ['video-old'] },
    vaultSyncTombstones: [],
  });
  const current = normalize({
    folders: [], items: [], videos: [], videoFolders: [],
    videoMeta: { 'video-old': { playCount: 12, playCountBase: 10, playCountByClient: { a: 2 } } },
    vaultSyncTombstones: ['/folders/folder-old', '/items/manga-old', '/videos/video-old', '/videoFolders/video-folder-old'],
  });
  const ids = ['folder-new', 'manga-new', 'video-new', 'video-folder-new'];
  const result = history.prepareVaultHistoryRestore(target, current, () => ids.shift(), normalize);

  assert.deepEqual(result.payload.vaultSyncTombstones, current.vaultSyncTombstones);
  assert.deepEqual(result.idMap, {
    'folders:folder-old': 'folder-new', 'items:manga-old': 'manga-new',
    'videos:video-old': 'video-new', 'videoFolders:video-folder-old': 'video-folder-new',
  });
  assert.equal(result.payload.items[0].folderId, 'folder-new');
  assert.deepEqual(result.payload.mangaInfo['manga-new'], { title: 'Manga' });
  assert.ok(!('manga-old' in result.payload.mangaInfo));
  assert.equal(result.payload.toc['manga-new'].length, 0);
  assert.equal(result.payload.lastPages['manga-new'], 8);
  assert.equal(result.payload.videos[0].id, 'video-new');
  assert.equal(result.payload.videos[0].folderId, 'video-folder-new');
  assert.deepEqual(result.payload.videoMeta['video-new'], {
    folderId: 'video-folder-new', playCount: 12, playCountBase: 10, playCountByClient: { a: 2 },
  });
  assert.ok(!('video-old' in result.payload.videoMarkers));
  assert.equal(result.payload.videoShortsState.queue[0].videoId, 'video-new');
  assert.deepEqual(result.payload.videoShortsState.knownVideoIds, ['video-new']);
  assert.equal(result.payload.videoMeta['video-new'].playCount, 12);
});

test('restore accepts paired video and videoMeta tombstones when remapping a deleted video ID', () => {
  const oldId = 'video-deleted';
  const target = normalize({
    videos: [{ id: oldId, title: 'Restored video' }],
    videoMeta: { [oldId]: { playCount: 4 } },
    vaultSyncTombstones: [],
  });
  const current = normalize({
    videos: [], videoMeta: {},
    vaultSyncTombstones: ['/videos/video-deleted', '/videoMeta/video-deleted'],
  });

  const result = history.prepareVaultHistoryRestore(target, current, () => 'video-restored', normalize);

  assert.equal(result.payload.videos[0].id, 'video-restored');
  assert.deepEqual(result.payload.videoMeta, { 'video-restored': { playCount: 4 } });
  assert.deepEqual(result.payload.vaultSyncTombstones, current.vaultSyncTombstones);
  assert.equal(result.idMap['videos:video-deleted'], 'video-restored');
});

test('history restore retains property definitions and moves video values with a remapped video ID', () => {
  const oldId = 'video-deleted';
  const target = normalize({
    videos: [{ id: oldId, title: 'Restored video' }],
    videoPropertyDefinitions: { schemaVersion: 1, properties: { p1: { id: 'p1', name: '分類', type: 'text', order: 0, hidden: false, deleted: false, options: {} } } },
    videoPropertyValues: { [oldId]: { p1: '旅行' } },
    vaultSyncTombstones: [],
  });
  const current = normalize({ videos: [], videoPropertyValues: {}, vaultSyncTombstones: ['/videos/video-deleted', '/videoPropertyValues/video-deleted'] });
  const result = history.prepareVaultHistoryRestore(target, current, () => 'video-restored', normalize);
  assert.deepEqual(result.payload.videoPropertyValues, { 'video-restored': { p1: '旅行' } });
  assert.equal(result.payload.videoPropertyDefinitions.properties.p1.name, '分類');
});

test('restore rejects an unrecognized tombstone relation that would reuse an entity ID', () => {
  const target = normalize({ items: [{ id: 'manga-old', title: 'Manga' }] });
  const current = normalize({ vaultSyncTombstones: ['/unknownCollection/manga-old'] });
  assert.throws(
    () => history.prepareVaultHistoryRestore(target, current, () => 'new-id', normalize),
    /安全に復元できない/,
  );
});

test('restore rejects a nested entity tombstone path whose references cannot be remapped safely', () => {
  const target = normalize({ items: [{ id: 'manga-old', title: 'Manga' }] });
  const current = normalize({ vaultSyncTombstones: ['/items/manga-old/title'] });
  assert.throws(() => history.prepareVaultHistoryRestore(target, current, () => 'new-id', normalize), /安全に復元できない/);
});

test('restore uses the greatest observed monotonic counters and unions historical tombstones', () => {
  const target = normalize({ vaultSyncTombstones: ['/videos/older'], videoShortsState: { generation: 2, revision: 3 } });
  const current = normalize({ vaultSyncTombstones: ['/videos/newer'], videoShortsState: { generation: 9, revision: 11 } });
  const result = history.prepareVaultHistoryRestore(target, current, () => 'unused', normalize);
  assert.deepEqual(new Set(result.payload.vaultSyncTombstones), new Set(['/videos/older', '/videos/newer']));
  assert.equal(result.payload.videoShortsState.generation, 9);
  assert.equal(result.payload.videoShortsState.revision, 11);
});
