import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';
import StudyQuiz from '../study-quiz.js';

function makeDefinition(id = 'only') {
  return {
    id,
    subjectId: 'criminal-procedure',
    genreId: 'evidence',
    title: '伝聞証拠',
    modelText: '公判外供述の内容の真実性を証明するために用いられるもの',
    contentRevision: 1,
    memoryUnits: [
      { id: `${id}-core`, text: '公判外供述', required: true, importantTerms: ['公判外供述'], acceptedVariants: [] }
    ],
    clozeCandidates: []
  };
}

function correctAttempt(definitionId) {
  return {
    id: 'attempt-1',
    definitionId,
    definitionRevision: 1,
    occurredAt: '2026-08-26T00:00:00.000Z',
    localStudyDate: '2026-08-26',
    sequence: 1,
    stageAtAttempt: 4,
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

test('a quiz with only one available definition ends after answering it once', () => {
  const study = StudyData.createEmptyStudy();
  const definition = makeDefinition();
  study.definitions = [definition];
  const session = StudyQuiz.createSession(study, { mode: 'all' }, 0);

  const first = StudyQuiz.nextQuestion(study, session, 0, () => 0);
  assert.equal(first.definitionId, definition.id);

  const outcome = StudyQuiz.applyOutcome(study, session, correctAttempt(definition.id), 0, () => 0);
  const second = StudyQuiz.nextQuestion(outcome.study, outcome.session, 0, () => 0);

  assert.equal(second, null);
});
