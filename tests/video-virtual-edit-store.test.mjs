import test from 'node:test';
import assert from 'node:assert/strict';
import Edit from '../video-virtual-edit.js';
import Store from '../video-virtual-edit-store.js';
import VideoData from '../video-data.js';
import VaultPayload from '../vault-payload.js';
import Backup from '../backup-format.js';

const clip = (sourceVideoId, startSeconds, endSeconds) => ({ sourceVideoId, startSeconds, endSeconds });
const videos = [
  { id: 'source-a', url: 'https://cdn.example.test/a.mp4?token=secret' },
  { id: 'source-b', url: 'https://cdn.example.test/b.mp4' },
];
const projectEdit = () => Edit.createEdit([clip('source-a', 5, 15), clip('source-b', 2, 9)]);

function setup({ allowed = () => true, sync = async () => true } = {}) {
  const raw = new Map([
    [Store.VIDEO_KEY, JSON.stringify(videos)],
    [Store.META_KEY, JSON.stringify({ 'source-a': { favorite: true }, 'source-b': { tags: ['sample'] } })],
  ]);
  const storage = {
    getItem: (k) => raw.get(k) ?? null,
    setItem: (k, v) => raw.set(k, v),
    removeItem: (k) => raw.delete(k),
  };
  let counter = 0;
  const repository = Store.createRepository({
    storage, canAccess: allowed, sync, now: () => 1000 + counter,
    generateId: () => 've-' + String(++counter).padStart(10, '0'),
  });
  return { repository, raw, storage };
}

test('saving a project does not alter registered MP4 sources or ordinary metadata', async () => {
  const { repository, raw } = setup();
  const priorVideoJson = raw.get(Store.VIDEO_KEY);
  const input = projectEdit();
  const result = await repository.save({ title: ' 仮想編集１ ', edit: input });
  assert.equal(result.localSaved, true);
  assert.equal(result.synced, true);
  assert.match(result.project.id, /^ve-/);
  assert.equal(result.project.title, '仮想編集１');
  assert.equal(result.project.revision, 1);
  assert.deepEqual(repository.get(result.project.id), result.project);
  assert.equal(repository.inspect(result.project.id).usable, true);
  assert.equal(raw.get(Store.VIDEO_KEY), priorVideoJson);
  const meta = JSON.parse(raw.get(Store.META_KEY));
  assert.deepEqual(meta['source-a'], { favorite: true });
  assert.deepEqual(meta['source-b'], { tags: ['sample'] });
  assert.equal(meta[Store.PROJECTS_KEY].projects.length, 1);
  assert.equal(raw.get(Store.META_KEY).includes('token=secret'), false, 'signed source URL must not be copied into projects');
  assert.deepEqual(input.clips, projectEdit().clips);
});

test('two independent edit projects can share original MP4 sources', async () => {
  const { repository } = setup();
  const first = await repository.save({ title: 'Part 1', edit: Edit.createEdit([clip('source-a', 0, 2)]) });
  const second = await repository.save({ title: 'Part 2', edit: Edit.createEdit([clip('source-a', 2, 5)]) });
  assert.equal(repository.list().length, 2);
  assert.notEqual(first.project.id, second.project.id);
  await repository.remove(first.project.id, first.project.revision);
  assert.equal(repository.get(first.project.id), null);
  assert.equal(repository.list().length, 1);
  assert.equal(repository.inspect(second.project.id).usable, true);
});

test('updating a project checks revision and retains the original creation time', async () => {
  const { repository } = setup();
  const created = (await repository.save({ title: 'Start', edit: projectEdit() })).project;
  await assert.rejects(repository.save({ id: created.id, title: 'Wrong', edit: projectEdit() }), /古い/);
  const changed = (await repository.save({
    id: created.id, expectedRevision: created.revision, title: 'Done',
    edit: Edit.createEdit([clip('source-b', 2, 3)]),
  })).project;
  assert.equal(changed.revision, 2);
  assert.equal(changed.createdAt, created.createdAt);
  assert.equal(changed.title, 'Done');
  await assert.rejects(repository.save({
    id: created.id, expectedRevision: created.revision, title: 'Stale', edit: projectEdit(),
  }), (error) => error.code === 'VIRTUAL_EDIT_CONFLICT');
  await assert.rejects(repository.remove(created.id, created.revision), (error) => error.code === 'VIRTUAL_EDIT_CONFLICT');
  assert.equal(repository.get(created.id).title, 'Done');
});

test('deleted or replaced sources invalidate, but never erase saved projects', async () => {
  const { repository, raw } = setup();
  const created = (await repository.save({ title: 'Linked', edit: projectEdit() })).project;
  raw.set(Store.VIDEO_KEY, JSON.stringify([{ id: 'source-a', url: videos[0].url }]));
  const deleted = repository.inspect(created.id);
  assert.equal(deleted.usable, false);
  assert.deepEqual(deleted.missingSourceIds, ['source-b']);
  assert.equal(repository.get(created.id).id, created.id);
  await assert.rejects(repository.save({
    id: created.id, expectedRevision: 1, title: 'Linked', edit: projectEdit(),
  }), /変更・削除/);

  raw.set(Store.VIDEO_KEY, JSON.stringify([
    { id: 'source-a', url: 'https://cdn.example.test/replacement.mp4' }, videos[1],
  ]));
  assert.deepEqual(repository.inspect(created.id).changedSourceIds, ['source-a']);
  raw.set(Store.VIDEO_KEY, JSON.stringify([
    { id: 'source-a', url: 'https://cdn.example.test/video.webm' }, videos[1],
  ]));
  assert.deepEqual(repository.inspect(created.id).nonMp4SourceIds, ['source-a']);
  assert.equal(repository.list().length, 1);
  await repository.remove(created.id, created.revision);
  assert.equal(repository.list().length, 0, 'orphaned edits remain explicitly deletable');
});

test('effective source URLs from existing video metadata are checked', async () => {
  const { repository, raw } = setup();
  const meta = JSON.parse(raw.get(Store.META_KEY));
  meta['source-a'].url = 'https://cdn.example.test/override.webm';
  raw.set(Store.META_KEY, JSON.stringify(meta));
  await assert.rejects(repository.save({ title: 'Bad source', edit: projectEdit() }), /missing or is not/);
  assert.equal(repository.list().length, 0);
});

test('unpermitted VPN access blocks all protected reads and writes', async () => {
  let access = true;
  const { repository, raw } = setup({ allowed: () => access });
  const original = raw.get(Store.META_KEY);
  access = false;
  assert.throws(() => repository.list(), /VPN/);
  assert.throws(() => repository.get('ve-test-id'), /VPN/);
  await assert.rejects(repository.save({ title: 'Denied', edit: projectEdit() }), /VPN/);
  assert.equal(raw.get(Store.META_KEY), original);
});

test('cloud sync failures preserve local changes and report a recoverable error', async () => {
  const { repository } = setup({ sync: async () => { throw new Error('revision conflict'); } });
  await assert.rejects(repository.save({ title: 'Local', edit: projectEdit() }),
    (error) => error.code === 'VIRTUAL_EDIT_SYNC_FAILED' && error.localSaved === true);
  assert.equal(repository.list().length, 1);
});

test('outdated metadata writes never roll back a newer virtual-project revision', async () => {
  const { repository, raw } = setup();
  const stale = JSON.parse(raw.get(Store.META_KEY));
  const first = (await repository.save({ title: 'New', edit: projectEdit() })).project;
  const current = JSON.parse(raw.get(Store.META_KEY));
  const merged = VideoData.mergeVideoMetaPreservingThumbnailTime(current, { ...stale, unrelated: { memo: 'new' } });
  assert.deepEqual(merged[Store.PROJECTS_KEY], current[Store.PROJECTS_KEY]);
  assert.equal(merged.unrelated.memo, 'new');
  const updated = (await repository.save({
    id: first.id, expectedRevision: 1, title: 'Changed', edit: projectEdit(),
  })).project;
  const latest = JSON.parse(raw.get(Store.META_KEY));
  const oldRegistry = current[Store.PROJECTS_KEY];
  const blended = VideoData.mergeVideoMetaPreservingThumbnailTime(latest,
    { ...latest, [Store.PROJECTS_KEY]: oldRegistry });
  assert.equal(blended[Store.PROJECTS_KEY].projects[0].revision, updated.revision);
});

test('vault save / apply, portable backup and logout retain or clear exactly the expected metadata', async () => {
  const { repository, storage, raw } = setup();
  const original = (await repository.save({ title: 'Vault-edited', edit: projectEdit() })).project;
  const vault = VaultPayload.buildFromLocalStorage(storage);
  const imported = new Map();
  VaultPayload.applyToLocalStorage(vault, imported);
  assert.deepEqual(JSON.parse(imported.get(Store.META_KEY))[Store.PROJECTS_KEY].projects[0], original);

  const backup = Backup.createBackup(vault);
  assert.deepEqual(Backup.migrateBackup(backup).videoMeta[Store.PROJECTS_KEY].projects[0], original);
  VaultPayload.clearDeviceData(imported);
  assert.equal(imported.has(Store.META_KEY), false);
  assert.equal(JSON.parse(raw.get(Store.META_KEY))[Store.PROJECTS_KEY].projects.length, 1);
});

test('malformed registry or corrupt JSON does not silently replace source metadata', async () => {
  const { repository, raw } = setup();
  const meta = JSON.parse(raw.get(Store.META_KEY));
  meta[Store.PROJECTS_KEY] = { schemaVersion: 999, revision: 5, projects: [] };
  raw.set(Store.META_KEY, JSON.stringify(meta));
  const before = raw.get(Store.META_KEY);
  assert.throws(() => repository.list(), /Unsupported/);
  await assert.rejects(repository.save({ title: 'Cannot overwrite', edit: projectEdit() }), /Unsupported/);
  assert.equal(raw.get(Store.META_KEY), before);
  raw.set(Store.META_KEY, '{invalid');
  assert.throws(() => repository.list(), SyntaxError);
  assert.equal(raw.get(Store.META_KEY), '{invalid');
});

test('unexpected older storage revisions are rejected before writes', async () => {
  const { repository, raw } = setup();
  const first = (await repository.save({ title: 'Revision1', edit: projectEdit() })).project;
  const meta = JSON.parse(raw.get(Store.META_KEY));
  meta[Store.PROJECTS_KEY].revision = 0; // simulated restore over a current edit
  raw.set(Store.META_KEY, JSON.stringify(meta));
  // A project-level revision can only be known from the current snapshot;
  // a normal editor must supply the revision it last displayed.
  await assert.rejects(repository.save({
    id: first.id, expectedRevision: first.revision - 1, title: 'stale', edit: projectEdit(),
  }), (error) => error.code === 'VIRTUAL_EDIT_CONFLICT');
});
