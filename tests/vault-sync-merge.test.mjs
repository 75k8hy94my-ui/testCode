import test from 'node:test';
import assert from 'node:assert/strict';
import mergeModule from '../vault-sync-merge.js';

const { mergeVaultPayload } = mergeModule;

test('merges additions to different collections from two devices', () => {
  const base = { items: [], videos: [] };
  const local = { items: [{ id: 'manga-x', title: '漫画X' }], videos: [] };
  const remote = { items: [], videos: [{ id: 'video-y', title: '動画Y' }] };

  const result = mergeVaultPayload(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.payload.items, local.items);
  assert.deepEqual(result.payload.videos, remote.videos);
});

test('retains cloud tombstones across client snapshots that do not store plaintext tombstone metadata', () => {
  const base = { videos: [], vaultSyncTombstones: ['/videos/private-id'] };
  const local = { videos: [{ id: 'new-video' }], vaultSyncTombstones: [] };
  const remote = { videos: [], vaultSyncTombstones: ['/videos/private-id'] };

  const result = mergeVaultPayload(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.payload.vaultSyncTombstones, ['/videos/private-id']);
});

test('does not auto-resurrect an entity that reuses a tombstoned ID', () => {
  const tombstone = '/videos/v1';
  const base = { videos: [], vaultSyncTombstones: [tombstone] };
  const local = { videos: [{ id: 'v1', title: '再作成' }], vaultSyncTombstones: [] };
  const remote = { videos: [], vaultSyncTombstones: [tombstone] };

  const result = mergeVaultPayload(base, local, remote);

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, 'delete-recreate');
  assert.equal(result.conflicts[0].path, tombstone);
  assert.deepEqual(result.payload.videos, local.videos);
  assert.throws(() => mergeModule.applyConflictChoices(result.payload, result.conflicts, { [tombstone]: 'local' }), /新しいID/);
});

test('merges a marker deletion with an independent marker addition by stable marker ID', () => {
  const base = { videoMarkers: { clip: [{ id: 'm1', seconds: 10, icon: 'water' }, { id: 'm2', seconds: 20, icon: 'triangle' }] }, vaultSyncTombstones: [] };
  const local = { videoMarkers: { clip: [{ id: 'm2', seconds: 20, icon: 'triangle' }] }, vaultSyncTombstones: ['/videoMarkers/clip/m1'] };
  const remote = { videoMarkers: { clip: [{ id: 'm1', seconds: 10, icon: 'water' }, { id: 'm2', seconds: 20, icon: 'triangle' }, { id: 'm3', seconds: 30, icon: 'toilet' }] }, vaultSyncTombstones: [] };

  const result = mergeVaultPayload(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.payload.videoMarkers.clip.map((marker) => marker.id), ['m2', 'm3']);
  assert.deepEqual(result.payload.vaultSyncTombstones, ['/videoMarkers/clip/m1']);
});

test('a marker cannot be recreated with its tombstoned identity', () => {
  const tombstone = '/videoMarkers/clip/m1';
  const base = { videoMarkers: { clip: [{ id: 'm1', seconds: 10, icon: 'water' }] }, vaultSyncTombstones: [] };
  const local = { videoMarkers: { clip: [{ id: 'm1', seconds: 10, icon: 'toilet' }] }, vaultSyncTombstones: [tombstone] };
  const remote = { videoMarkers: { clip: [] }, vaultSyncTombstones: [tombstone] };

  const result = mergeVaultPayload(base, local, remote);

  assert.ok(result.conflicts.some((conflict) => conflict.type === 'delete-recreate' && conflict.path === tombstone));
  assert.throws(() => mergeModule.applyConflictChoices(result.payload, result.conflicts, { [tombstone]: 'local' }), /新しいID/);
});

test('merges different properties on the same entity and preserves unknown properties', () => {
  const base = { videos: [{ id: 'v1', title: 'old', thumbnailUrl: 'old.jpg', futureField: { retained: true } }] };
  const local = { videos: [{ id: 'v1', title: 'new title', thumbnailUrl: 'old.jpg', futureField: { retained: true } }] };
  const remote = { videos: [{ id: 'v1', title: 'old', thumbnailUrl: 'new.jpg', futureField: { retained: true } }] };

  const result = mergeVaultPayload(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.payload.videos, [{ id: 'v1', title: 'new title', thumbnailUrl: 'new.jpg', futureField: { retained: true } }]);
});

test('merges independent video edits without treating updatedAt as user data', () => {
  const base = { videos: [{ id: 'v1', title: 'old', thumbnailUrl: 'old.jpg', updatedAt: 100 }] };
  const local = { videos: [{ id: 'v1', title: 'new', thumbnailUrl: 'old.jpg', updatedAt: 200 }] };
  const remote = { videos: [{ id: 'v1', title: 'old', thumbnailUrl: 'new.jpg', updatedAt: 300 }] };

  const result = mergeVaultPayload(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.payload.videos[0], { id: 'v1', title: 'new', thumbnailUrl: 'new.jpg', updatedAt: 300 });
});

test('reader progress uses the latest progress timestamp as a single record', () => {
  const base = { lastPages: { work1: { page: 5, wasLast: false, updatedAt: 100 } } };
  const local = { lastPages: { work1: { page: 8, wasLast: false, updatedAt: 200 } } };
  const remote = { lastPages: { work1: { page: 6, wasLast: false, updatedAt: 300 } } };

  const result = mergeVaultPayload(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.payload.lastPages.work1, remote.lastPages.work1);
});

test('restores baseline properties omitted by a legacy normalizer before merging', () => {
  const base = { futureState: { schemaVersion: 4, option: true }, items: [{ id: 'i1', futureField: 'kept' }] };
  const local = { items: [{ id: 'i1' }], videos: [{ id: 'v1' }] };

  const retained = mergeModule.retainUnknownProperties(base, local);
  const result = mergeVaultPayload(base, retained, base);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.payload.futureState, base.futureState);
  assert.equal(result.payload.items[0].futureField, 'kept');
  assert.deepEqual(result.payload.videos, local.videos);
});

test('explicit tombstones stop unknown-field restoration while dictionary and entity deletions stay deleted', () => {
  const base = {
    futureTopLevel: { keep: true },
    videos: [{ id: 'v1', futureField: 'delete me', retained: { legacy: true } }],
    videoMeta: { removedVideo: { title: 'deleted' }, v1: { futureSetting: 'delete me' } },
    study: { preferences: { futureOption: true, retainedOption: true } },
  };
  const local = {
    videos: [{ id: 'v1', retained: { legacy: true } }],
    videoMeta: { v1: {} },
    study: { preferences: { retainedOption: true } },
    vaultSyncTombstones: ['/futureTopLevel', '/videos/v1/futureField', '/videoMeta/v1/futureSetting', '/study/preferences/futureOption'],
  };

  const result = mergeModule.retainUnknownProperties(base, local);

  assert.equal('futureTopLevel' in result, false);
  assert.equal('futureField' in result.videos[0], false);
  assert.equal('removedVideo' in result.videoMeta, false);
  assert.equal('futureSetting' in result.videoMeta.v1, false);
  assert.deepEqual(result.videos[0].retained, { legacy: true });
});

test('reports different edits to the same property without choosing a winner', () => {
  const base = { videoMeta: { v1: { title: 'old' } } };
  const local = { videoMeta: { v1: { title: 'device title' } } };
  const remote = { videoMeta: { v1: { title: 'cloud title' } } };

  const result = mergeVaultPayload(base, local, remote);

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].path, '/videoMeta/v1/title');
  assert.equal(result.conflicts[0].local, 'device title');
  assert.equal(result.conflicts[0].remote, 'cloud title');
  assert.equal(result.payload.videoMeta.v1.title, 'old');
});

test('applies a user-selected conflict value while keeping all non-conflicting remote edits', () => {
  const base = { videoMeta: { v1: { title: 'old', favorite: false } } };
  const local = { videoMeta: { v1: { title: 'device', favorite: false } } };
  const remote = { videoMeta: { v1: { title: 'cloud', favorite: true } } };
  const result = mergeVaultPayload(base, local, remote);
  const resolved = mergeModule.applyConflictChoices(result.payload, result.conflicts, { '/videoMeta/v1/title': 'local' });

  assert.deepEqual(resolved.videoMeta.v1, { title: 'device', favorite: true });
});

test('conflict pointers safely address IDs containing JSON Pointer characters and Unicode', () => {
  for (const id of ['clip.1', 'video/abc', 'a~b', '日本語の作品', 'item with spaces']) {
    const base = { videoMeta: { [id]: { title: 'old', favorite: false } } };
    const local = { videoMeta: { [id]: { title: 'device', favorite: false } } };
    const remote = { videoMeta: { [id]: { title: 'cloud', favorite: true } } };
    const merged = mergeVaultPayload(base, local, remote);
    assert.equal(merged.conflicts.length, 1, id);
    const conflict = merged.conflicts[0];
    const resolved = mergeModule.applyConflictChoices(merged.payload, [conflict], { [conflict.path]: 'local' });
    assert.equal(resolved.videoMeta[id].title, 'device', id);
    assert.equal(resolved.videoMeta[id].favorite, true, id);
  }
});

test('conflict application throws when its target path no longer resolves', () => {
  assert.throws(() => mergeModule.applyConflictChoices({}, [{
    type: 'value', path: '/videoMeta/v1/title', local: 'device', remote: 'cloud', localPresent: true, remotePresent: true,
  }], { '/videoMeta/v1/title': 'local' }), /競合対象が見つかりません/);
});

test('reports delete versus edit rather than resurrecting or deleting the entity', () => {
  const base = { videos: [{ id: 'v1', title: 'old' }] };
  const local = { videos: [] };
  const remote = { videos: [{ id: 'v1', title: 'edited' }] };

  const result = mergeVaultPayload(base, local, remote);

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, 'delete-edit');
  assert.equal(result.conflicts[0].path, '/videos/v1');
});

test('merges independent monotonic counter operations and deduplicates a repeated operation', () => {
  const base = { videoMeta: { v1: { shorts: { playCount: 3, playCountBase: 3, playCountByClient: {} } } } };
  const local = { videoMeta: { v1: { shorts: { playCount: 4, playCountBase: 3, playCountByClient: { tabA: 1 } } } } };
  const remote = { videoMeta: { v1: { shorts: { playCount: 4, playCountBase: 3, playCountByClient: { tabB: 1 } } } } };

  const result = mergeVaultPayload(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.equal(result.payload.videoMeta.v1.shorts.playCount, 5);
  assert.deepEqual(result.payload.videoMeta.v1.shorts.playCountByClient, { tabA: 1, tabB: 1 });

  const repeated = mergeVaultPayload(base, local, local);
  assert.deepEqual(repeated.conflicts, []);
  assert.equal(repeated.payload.videoMeta.v1.shorts.playCount, 4);
});
