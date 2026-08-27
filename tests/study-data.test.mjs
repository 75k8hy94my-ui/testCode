import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';

function finalAttempt(id, offsetSeconds = 0) {
  return {
    id,
    definitionId: 'd1',
    definitionRevision: 1,
    occurredAt: new Date(Date.UTC(2026, 7, 26, 0, 0, 0) + offsetSeconds * 1000).toISOString(),
    deviceId: 'device-a',
    questionKind: 'full',
    stageAtAttempt: 4,
    answerText: 'answer',
    gradingContext: null,
    grading: {
      status: 'final', result: 'correct', recalledUnitIds: [], missingUnitIds: [],
      wrongUnitIds: [], confusions: [], feedback: '', confidence: 'high', source: 'ai'
    }
  };
}

test('empty study contains eight legal subjects and defaults', () => {
  const study = StudyData.createEmptyStudy();
  assert.equal(study.schemaVersion, 1);
  assert.deepEqual(study.subjects.map((x) => x.name), ['憲法', '行政法', '民法', '商法', '民事訴訟法', '刑法', '刑事訴訟法', '労働法']);
  assert.equal(study.preferences.autoSpeak, false);
  assert.deepEqual(study.arguments, []);
  assert.deepEqual(study.argumentDrafts, {});
  assert.deepEqual(study.argumentProgress, {});
  assert.deepEqual(study.appliedOperationIds, []);
});

test('legacy missing study normalizes to v1', () => {
  assert.deepEqual(StudyData.normalizeStudy(null), StudyData.createEmptyStudy());
});

test('normalization preserves valid user data but repairs invalid containers', () => {
  const study = StudyData.normalizeStudy({
    subjects: 'bad',
    genres: [{ id: 'g1', subjectId: 'civil-law', name: '債権' }],
    definitions: [{ id: 'd1', title: '定義' }],
    arguments: [{ id: 'a1', title: '論証' }],
    argumentDrafts: { 'argument:a1': { argumentId: 'a1', title: '下書き', body: '途中', savedAt: '2026-08-28T00:00:00.000Z' } },
    argumentProgress: { a1: { status: 'memorized' } },
    progress: null,
    preferences: { autoSpeak: true }
  });
  assert.equal(study.subjects.length, 8);
  assert.equal(study.genres.length, 1);
  assert.equal(study.definitions.length, 1);
  assert.equal(study.arguments.length, 1);
  assert.equal(study.argumentDrafts['argument:a1'].title, '下書き');
  assert.equal(study.argumentProgress.a1.status, 'memorized');
  assert.deepEqual(study.progress, {});
  assert.equal(study.preferences.autoSpeak, true);
});

test('pruning keeps newest 2000 finalized attempts plus every pending attempt', () => {
  const study = StudyData.createEmptyStudy();
  study.recentAttempts = Array.from({ length: 2005 }, (_, i) => finalAttempt(`a${i}`, i));
  const pending = {
    ...finalAttempt('pending', 9999),
    gradingContext: { modelText: '模範', memoryUnits: [] },
    grading: { ...finalAttempt('pending').grading, status: 'pending', result: null, source: 'pending' }
  };
  study.recentAttempts.push(pending);
  study.pendingGradings.push('pending');
  study.pendingSyncOps.push({ id: 'op1', type: 'preference.changed', payload: { autoSpeak: true }, occurredAt: '2026-08-26T00:00:00Z' });
  const result = StudyData.pruneRecentAttempts(study);
  assert.equal(result.recentAttempts.filter((a) => a.grading.status === 'final').length, 2000);
  assert.equal(result.recentAttempts.some((a) => a.id === 'a0'), false);
  assert.equal(result.recentAttempts.some((a) => a.id === 'a2004'), true);
  assert.equal(result.recentAttempts.some((a) => a.id === 'pending'), true);
  assert.deepEqual(result.pendingGradings, ['pending']);
  assert.equal(result.pendingSyncOps.length, 1);
});

test('load and save use mangaReaderStudy with Map storage', () => {
  const storage = new Map();
  const study = StudyData.createEmptyStudy();
  study.preferences.autoSpeak = true;
  StudyData.save(study, storage);
  assert.equal(storage.has('mangaReaderStudy'), true);
  assert.equal(StudyData.load(storage).preferences.autoSpeak, true);
});

test('createId returns distinct non-empty IDs', () => {
  const a = StudyData.createId();
  const b = StudyData.createId();
  assert.equal(typeof a, 'string');
  assert.notEqual(a, '');
  assert.notEqual(a, b);
});
