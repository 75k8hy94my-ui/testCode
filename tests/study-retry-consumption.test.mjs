import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';
import StudyQuiz from '../study-quiz.js';

function definition(id) {
  return {
    id,
    subjectId: 'criminal-procedure',
    genreId: 'evidence',
    title: id,
    modelText: '公判外の供述を内容とする供述または書面',
    contentRevision: 1,
    memoryUnits: [
      { id: `${id}-core`, text: '公判外の供述', required: true, importantTerms: ['公判外の供述'], acceptedVariants: [] }
    ],
    clozeCandidates: [{ unitId: `${id}-core`, terms: ['公判外の供述'] }]
  };
}

function correctAttempt(definitionId) {
  return {
    id: `attempt-${definitionId}`,
    definitionId,
    definitionRevision: 1,
    occurredAt: '2026-08-26T00:00:00.000Z',
    localStudyDate: '2026-08-26',
    sequence: 1,
    questionKind: 'cloze',
    stageAtAttempt: 2,
    answerText: '公判外の供述',
    grading: {
      status: 'final',
      result: 'correct',
      recalledUnitIds: [`${definitionId}-core`],
      missingUnitIds: [],
      wrongUnitIds: [],
      confusions: [],
      feedback: '',
      confidence: 'high',
      source: 'local'
    }
  };
}

test('a due retry is consumed when the retried definition is answered correctly', () => {
  const study = StudyData.createEmptyStudy();
  study.definitions = [definition('d1'), definition('d2')];
  const session = StudyQuiz.createSession(study, { mode: 'all' }, 0);
  session.scheduledRetries = [{ definitionId: 'd1', targetStage: 2, afterQuestion: 0 }];

  const retryQuestion = StudyQuiz.nextQuestion(study, session, 0, () => 0);
  assert.equal(retryQuestion.definitionId, 'd1');

  const outcome = StudyQuiz.applyOutcome(study, session, correctAttempt('d1'), 0, () => 0);
  assert.deepEqual(outcome.session.scheduledRetries.filter((x) => x.definitionId === 'd1'), []);
});
