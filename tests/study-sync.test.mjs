import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';
import StudySync from '../study-sync.js';

function finalAttempt(id, result = 'correct') {
  return { id, definitionId: 'd1', grading: { status: 'final', result } };
}

test('createOperation creates stable operation metadata', () => {
  const op = StudySync.createOperation('preference.changed', { autoSpeak: true }, { id: 'op1', occurredAt: '2026-08-26T00:00:00Z' });
  assert.deepEqual(op, { id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' });
});

test('operation replay is idempotent by operation ID', () => {
  const study = StudyData.createEmptyStudy();
  const op = { id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' };
  const once = StudySync.applyOperation(study, op);
  const twice = StudySync.applyOperation(once, op);
  assert.equal(twice.preferences.autoSpeak, true);
  assert.deepEqual(twice.appliedOperationIds, ['op1']);
});

test('definition operations upsert and delete without touching other definitions', () => {
  let study = StudyData.createEmptyStudy();
  study.definitions = [{ id: 'keep', title: 'keep' }, { id: 'd1', title: 'old' }];
  study.progress.d1 = { stage: 4 };
  study = StudySync.applyOperation(study, { id: 'u1', type: 'definition.upserted', payload: { definition: { id: 'd1', title: 'new' } }, occurredAt: '2026-08-26T00:00:00Z' });
  assert.deepEqual(study.definitions.map((d) => d.title), ['keep', 'new']);
  study = StudySync.applyOperation(study, { id: 'd1-op', type: 'definition.deleted', payload: { definitionId: 'd1' }, occurredAt: '2026-08-26T00:01:00Z' });
  assert.deepEqual(study.definitions.map((d) => d.id), ['keep']);
  assert.equal('d1' in study.progress, false);
});

test('argument operations upsert progress and delete independently', () => {
  let study = StudyData.createEmptyStudy();
  study.arguments = [{ id: 'keep', title: 'keep' }];
  study = StudySync.applyOperation(study, { id: 'a-upsert', type: 'argument.upserted', payload: { argument: { id: 'a1', subjectId: 'civil-law', title: '解除', body: '論証' } }, occurredAt: '2026-08-26T00:00:00Z' });
  assert.deepEqual(study.arguments.map((a) => a.id), ['keep', 'a1']);
  study = StudySync.applyOperation(study, { id: 'a-progress', type: 'argument.progress.changed', payload: { argumentId: 'a1', progress: { status: 'memorized', nextReviewAt: '2026-09-02T00:00:00Z' } }, occurredAt: '2026-08-26T00:01:00Z' });
  assert.equal(study.argumentProgress.a1.status, 'memorized');
  study = StudySync.applyOperation(study, { id: 'a-delete', type: 'argument.deleted', payload: { argumentId: 'a1' }, occurredAt: '2026-08-26T00:02:00Z' });
  assert.deepEqual(study.arguments.map((a) => a.id), ['keep']);
  assert.equal('a1' in study.argumentProgress, false);
});

test('argument draft operations sync with last-write-wins timestamps and tombstones', () => {
  let study = StudyData.createEmptyStudy();
  study = StudySync.applyOperation(study, {
    id: 'draft-newer',
    type: 'argument.draft.upserted',
    payload: { draftKey: 'argument:a1', draft: { argumentId: 'a1', title: 'newer', body: 'body', savedAt: '2026-08-28T00:00:10.000Z' } },
    occurredAt: '2026-08-28T00:00:10.000Z'
  });
  study = StudySync.applyOperation(study, {
    id: 'draft-older',
    type: 'argument.draft.upserted',
    payload: { draftKey: 'argument:a1', draft: { argumentId: 'a1', title: 'older', body: 'old', savedAt: '2026-08-28T00:00:05.000Z' } },
    occurredAt: '2026-08-28T00:00:05.000Z'
  });
  assert.equal(study.argumentDrafts['argument:a1'].title, 'newer');
  study = StudySync.applyOperation(study, {
    id: 'delete-old',
    type: 'argument.draft.deleted',
    payload: { draftKey: 'argument:a1', deletedAt: '2026-08-28T00:00:08.000Z' },
    occurredAt: '2026-08-28T00:00:08.000Z'
  });
  assert.equal(study.argumentDrafts['argument:a1'].title, 'newer');
  study = StudySync.applyOperation(study, {
    id: 'delete-new',
    type: 'argument.draft.deleted',
    payload: { draftKey: 'argument:a1', deletedAt: '2026-08-28T00:00:12.000Z' },
    occurredAt: '2026-08-28T00:00:12.000Z'
  });
  assert.deepEqual(study.argumentDrafts['argument:a1'], { deleted: true, savedAt: '2026-08-28T00:00:12.000Z' });
  study = StudySync.applyOperation(study, {
    id: 'stale-resurrection',
    type: 'argument.draft.upserted',
    payload: { draftKey: 'argument:a1', draft: { argumentId: 'a1', title: 'stale', body: 'old', savedAt: '2026-08-28T00:00:11.000Z' } },
    occurredAt: '2026-08-28T00:00:11.000Z'
  });
  assert.equal(study.argumentDrafts['argument:a1'].deleted, true);
  study = StudySync.applyOperation(study, {
    id: 'fresh-after-delete',
    type: 'argument.draft.upserted',
    payload: { draftKey: 'argument:a1', draft: { argumentId: 'a1', title: 'fresh', body: 'new', savedAt: '2026-08-28T00:00:13.000Z' } },
    occurredAt: '2026-08-28T00:00:13.000Z'
  });
  assert.equal(study.argumentDrafts['argument:a1'].title, 'fresh');
});

test('queueOperation queues once without applying twice', () => {
  const study = StudyData.createEmptyStudy();
  const op = { id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' };
  const applied = StudySync.applyOperation(study, op);
  const queued = StudySync.queueOperation(StudySync.queueOperation(applied, op), op);
  assert.equal(queued.pendingSyncOps.length, 1);
  assert.equal(queued.preferences.autoSpeak, true);
});

test('final attempt replaces pending copy and invokes reducer once', () => {
  const study = StudyData.createEmptyStudy();
  study.recentAttempts.push({ id: 'a1', grading: { status: 'pending', result: null } });
  let calls = 0;
  const op = { id: 'op-final', type: 'attempt.upserted', payload: { attempt: finalAttempt('a1') }, occurredAt: '2026-08-26T00:00:00Z' };
  const result = StudySync.applyOperation(study, op, { reduceFinalAttempt(s) { calls += 1; return s; } });
  assert.equal(result.recentAttempts.find((a) => a.id === 'a1').grading.status, 'final');
  assert.equal(calls, 1);
  const twice = StudySync.applyOperation(result, op, { reduceFinalAttempt() { calls += 1; } });
  assert.equal(calls, 1);
  assert.equal(twice.recentAttempts.length, 1);
});

test('conflicting final grading for same attempt is rejected', () => {
  const study = StudyData.createEmptyStudy();
  study.recentAttempts.push(finalAttempt('a1', 'correct'));
  assert.throws(() => StudySync.applyOperation(study, { id: 'op2', type: 'attempt.upserted', payload: { attempt: finalAttempt('a1', 'wrong') }, occurredAt: '2026-08-26T00:00:00Z' }), /conflicting final grading/);
});

test('rebase replays pending operations in time order', () => {
  const remote = StudyData.createEmptyStudy();
  const ops = [
    { id: 'later', type: 'preference.changed', payload: { autoSpeak: false }, occurredAt: '2026-08-26T00:02:00Z' },
    { id: 'earlier', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:01:00Z' }
  ];
  assert.equal(StudySync.rebaseStudy(remote, ops).preferences.autoSpeak, false);
});

test('non-study fingerprint ignores study only and detects manga changes', () => {
  const a = { folders: [], items: [], study: { x: 1 }, nested: { b: 1, a: 2 } };
  const b = { nested: { a: 2, b: 1 }, folders: [], items: [], study: { x: 2 } };
  const c = { folders: [{ id: 'f1' }], items: [], study: { x: 2 }, nested: { a: 2, b: 1 } };
  assert.equal(StudySync.fingerprintNonStudy(a), StudySync.fingerprintNonStudy(b));
  assert.notEqual(StudySync.fingerprintNonStudy(a), StudySync.fingerprintNonStudy(c));
});

test('controller saves pending operations and clears them only after success', async () => {
  const storage = new Map();
  const initial = { folders: [], items: [], study: StudyData.createEmptyStudy() };
  const op = { id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' };
  initial.study = StudySync.queueOperation(StudySync.applyOperation(initial.study, op), op);
  let localPayload = structuredClone(initial);
  const saved = [];
  const payloadApi = {
    buildFromLocalStorage() { return structuredClone(localPayload); },
    applyToLocalStorage(payload) { localPayload = structuredClone(payload); }
  };
  const vault = { savePayload: async (payload) => { saved.push(structuredClone(payload)); } };
  const controller = StudySync.createController({ vault, payloadApi, storage });
  controller.markBase();
  const result = await controller.syncNow();
  assert.equal(result.status, 'synced');
  assert.equal(saved[0].study.preferences.autoSpeak, true);
  assert.deepEqual(saved[0].study.pendingSyncOps, []);
  assert.deepEqual(localPayload.study.pendingSyncOps, []);
});

test('controller rebases study operations after a CAS conflict when non-study local data is unchanged', async () => {
  const op = { id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' };
  let localPayload = { folders: [], items: [], study: StudySync.queueOperation(StudySync.applyOperation(StudyData.createEmptyStudy(), op), op) };
  const remote = { folders: [{ id: 'remote-folder' }], items: [], study: StudyData.createEmptyStudy() };
  const saved = [];
  let saveCalls = 0;
  const vault = {
    async savePayload(payload) {
      saveCalls += 1;
      if (saveCalls === 1) throw new Error('別の端末で更新されています。現在の端末の変更はまだ残っています。');
      saved.push(structuredClone(payload));
    },
    async reloadPayload() { return { payload: structuredClone(remote), revision: 3, updatedAt: '2026-08-26T00:00:00Z' }; }
  };
  const payloadApi = { buildFromLocalStorage() { return structuredClone(localPayload); }, applyToLocalStorage(payload) { localPayload = structuredClone(payload); } };
  const controller = StudySync.createController({ vault, payloadApi, storage: new Map() });
  controller.markBase();
  const result = await controller.syncNow();
  assert.equal(result.status, 'synced-after-rebase');
  assert.deepEqual(saved[0].folders, [{ id: 'remote-folder' }]);
  assert.equal(saved[0].study.preferences.autoSpeak, true);
  assert.deepEqual(saved[0].study.pendingSyncOps, []);
});

test('controller refuses automatic rebase when non-study local data changed after baseline', async () => {
  const op = { id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' };
  let localPayload = { folders: [], items: [], study: StudySync.queueOperation(StudySync.applyOperation(StudyData.createEmptyStudy(), op), op) };
  let reloadCalls = 0;
  const vault = {
    async savePayload() { throw new Error('別の端末で更新されています。現在の端末の変更はまだ残っています。'); },
    async reloadPayload() { reloadCalls += 1; return null; }
  };
  const payloadApi = { buildFromLocalStorage() { return structuredClone(localPayload); }, applyToLocalStorage() {} };
  const controller = StudySync.createController({ vault, payloadApi, storage: new Map() });
  controller.markBase();
  localPayload.folders.push({ id: 'local-change' });
  const result = await controller.syncNow();
  assert.deepEqual(result, { status: 'conflict', reason: 'non-study-local-change' });
  assert.equal(reloadCalls, 0);
  assert.equal(localPayload.study.pendingSyncOps.length, 1);
});

test('reloadVaultPayload decrypts latest remote payload and updates sync meta', async () => {
  const storage = new Map();
  const vault = {
    META_KEY: 'mangaReaderSupabaseSyncMeta',
    async withSession(work) { return work('token', { id: 'u1' }); },
    async fetchRecordForUi() {
      return { payload: { encrypted: true }, revision: 3, updated_at: '2026-08-26T00:10:00Z' };
    }
  };
  const result = await StudySync.reloadVaultPayload(vault, {
    storage,
    decryptEnvelope: async (envelope) => ({ marker: envelope.encrypted ? 'ok' : 'bad' })
  });
  assert.deepEqual(result, { payload: { marker: 'ok' }, revision: 3, updatedAt: '2026-08-26T00:10:00Z' });
  assert.deepEqual(JSON.parse(storage.get('mangaReaderSupabaseSyncMeta')), { u1: { revision: 3, updatedAt: '2026-08-26T00:10:00Z' } });
});

test('reloadVaultPayload rejects legacy revision records', async () => {
  const vault = {
    META_KEY: 'mangaReaderSupabaseSyncMeta',
    async withSession(work) { return work('token', { id: 'u1' }); },
    async fetchRecordForUi() { return { payload: {}, legacyRevision: true, revision: 1 }; }
  };
  await assert.rejects(() => StudySync.reloadVaultPayload(vault, { storage: new Map(), decryptEnvelope: async () => ({}) }), /revision migration/);
});
