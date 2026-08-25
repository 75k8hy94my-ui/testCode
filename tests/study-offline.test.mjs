import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';
import StudyOffline from '../study-offline.js';

function pendingAttempt(id, answerText = 'answer') {
  return {
    id,
    definitionId: 'd1',
    definitionRevision: 1,
    answerText,
    gradingContext: { modelText: 'model', memoryUnits: [] },
    grading: { status: 'pending', result: null, source: 'pending' }
  };
}

test('flushPending grades attempts in queue order and finalizes them', async () => {
  const study = StudyData.createEmptyStudy();
  study.recentAttempts = [pendingAttempt('a1'), pendingAttempt('a2')];
  study.pendingGradings = ['a1', 'a2'];
  const seen = [];
  const result = await StudyOffline.flushPending(study, {
    gradeAttempt: async (attempt) => {
      seen.push(`grade:${attempt.id}`);
      return { result: 'correct', recalledUnitIds: [], missingUnitIds: [], wrongUnitIds: [], confusions: [], feedback: '', confidence: 'high' };
    },
    finalizeAttempt: (nextStudy, attempt) => {
      seen.push(`final:${attempt.id}`);
      return nextStudy;
    },
    createOperation: () => null,
    queueOperation: (nextStudy) => nextStudy
  });
  assert.deepEqual(seen, ['grade:a1', 'final:a1', 'grade:a2', 'final:a2']);
  assert.deepEqual(result.study.pendingGradings, []);
  assert.equal(result.study.recentAttempts.every((a) => a.grading.status === 'final'), true);
  assert.equal(result.study.recentAttempts.some((a) => 'gradingContext' in a), false);
});

test('first grading failure stops processing and preserves remaining queue and answer text', async () => {
  const study = StudyData.createEmptyStudy();
  study.recentAttempts = [pendingAttempt('a1', 'original-one'), pendingAttempt('a2', 'original-two')];
  study.pendingGradings = ['a1', 'a2'];
  const result = await StudyOffline.flushPending(study, {
    gradeAttempt: async () => { throw new Error('offline'); },
    finalizeAttempt: (nextStudy) => nextStudy,
    createOperation: () => null,
    queueOperation: (nextStudy) => nextStudy
  });
  assert.equal(result.stopped, true);
  assert.deepEqual(result.study.pendingGradings, ['a1', 'a2']);
  assert.equal(result.study.recentAttempts[0].answerText, 'original-one');
  assert.equal(result.study.recentAttempts[1].answerText, 'original-two');
});

test('enqueuePending is idempotent', () => {
  let study = StudyData.createEmptyStudy();
  study = StudyOffline.enqueuePending(study, 'a1');
  study = StudyOffline.enqueuePending(study, 'a1');
  assert.deepEqual(study.pendingGradings, ['a1']);
});
