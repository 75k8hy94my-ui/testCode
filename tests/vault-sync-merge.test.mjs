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

test('merges different properties on the same entity and preserves unknown properties', () => {
  const base = { videos: [{ id: 'v1', title: 'old', thumbnailUrl: 'old.jpg', futureField: { retained: true } }] };
  const local = { videos: [{ id: 'v1', title: 'new title', thumbnailUrl: 'old.jpg', futureField: { retained: true } }] };
  const remote = { videos: [{ id: 'v1', title: 'old', thumbnailUrl: 'new.jpg', futureField: { retained: true } }] };

  const result = mergeVaultPayload(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.payload.videos, [{ id: 'v1', title: 'new title', thumbnailUrl: 'new.jpg', futureField: { retained: true } }]);
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

test('reports different edits to the same property without choosing a winner', () => {
  const base = { videoMeta: { v1: { title: 'old' } } };
  const local = { videoMeta: { v1: { title: 'device title' } } };
  const remote = { videoMeta: { v1: { title: 'cloud title' } } };

  const result = mergeVaultPayload(base, local, remote);

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].path, 'videoMeta.v1.title');
  assert.equal(result.conflicts[0].local, 'device title');
  assert.equal(result.conflicts[0].remote, 'cloud title');
  assert.equal(result.payload.videoMeta.v1.title, 'old');
});

test('applies a user-selected conflict value while keeping all non-conflicting remote edits', () => {
  const base = { videoMeta: { v1: { title: 'old', favorite: false } } };
  const local = { videoMeta: { v1: { title: 'device', favorite: false } } };
  const remote = { videoMeta: { v1: { title: 'cloud', favorite: true } } };
  const result = mergeVaultPayload(base, local, remote);
  const resolved = mergeModule.applyConflictChoices(result.payload, result.conflicts, { 'videoMeta.v1.title': 'local' });

  assert.deepEqual(resolved.videoMeta.v1, { title: 'device', favorite: true });
});

test('reports delete versus edit rather than resurrecting or deleting the entity', () => {
  const base = { videos: [{ id: 'v1', title: 'old' }] };
  const local = { videos: [] };
  const remote = { videos: [{ id: 'v1', title: 'edited' }] };

  const result = mergeVaultPayload(base, local, remote);

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, 'delete-edit');
  assert.equal(result.conflicts[0].path, 'videos.v1');
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
