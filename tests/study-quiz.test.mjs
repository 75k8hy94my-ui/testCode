import test from 'node:test';
import assert from 'node:assert/strict';
import StudyData from '../study-data.js';
import StudyQuiz from '../study-quiz.js';

function makeDefinition(id, subjectId = 'civil-law', genreId = 'contracts') {
  return {
    id, subjectId, genreId, title: `定義${id}`, modelText: '主体が直接効果を生じる法律上の行為', contentRevision: 1,
    memoryUnits: [
      { id: `${id}-actor`, text: '主体', required: true, importantTerms: ['主体'], acceptedVariants: [] },
      { id: `${id}-direct`, text: '直接効果', required: true, importantTerms: ['直接'], acceptedVariants: [] },
      { id: `${id}-legal`, text: '法律上', required: true, importantTerms: ['法律上'], acceptedVariants: [] }
    ],
    clozeCandidates: [{ unitId: `${id}-direct`, terms: ['直接'] }, { unitId: `${id}-legal`, terms: ['法律上'] }]
  };
}

function finalAttempt(definitionId, stageAtAttempt, result, missingUnitIds = [], confidence = 'high', sequence = 1) {
  return {
    id: `a-${definitionId}-${sequence}`,
    definitionId,
    definitionRevision: 1,
    occurredAt: '2026-08-26T00:00:00.000Z',
    localStudyDate: '2026-08-26',
    sequence,
    stageAtAttempt,
    grading: {
      status: 'final', result,
      recalledUnitIds: result === 'correct' ? [`${definitionId}-actor`, `${definitionId}-direct`, `${definitionId}-legal`] : [],
      missingUnitIds,
      wrongUnitIds: [], confusions: [], feedback: '', confidence, source: 'local'
    }
  };
}

test('new definition starts with full recall probe', () => {
  assert.equal(StudyQuiz.createInitialProgress(makeDefinition('d1'), 0).stage, 4);
});

test('scope filters by subject and genre', () => {
  const study = StudyData.createEmptyStudy();
  study.definitions = [makeDefinition('a', 'civil-law', 'contracts'), makeDefinition('b', 'criminal-law', 'complicity')];
  assert.deepEqual(
    StudyQuiz.filterDefinitions(study, { mode: 'scope', subjectId: 'criminal-law', genreIds: ['complicity'] }).map((d) => d.id),
    ['b']
  );
});

test('gave-up schedules an easier retry three to six answered questions later', () => {
  const study = StudyData.createEmptyStudy();
  study.definitions = [makeDefinition('d1'), makeDefinition('d2'), makeDefinition('d3'), makeDefinition('d4')];
  const session = StudyQuiz.createSession(study, { mode: 'all' }, 0);
  const result = StudyQuiz.applyOutcome(study, session, finalAttempt('d1', 4, 'gave-up', ['d1-actor'], 'high', 1), 0, () => 0);
  const retry = result.session.scheduledRetries.find((x) => x.definitionId === 'd1');
  assert.equal(retry.targetStage <= 2, true);
  assert.equal(retry.afterQuestion >= 3 && retry.afterQuestion <= 6, true);
});

test('gave-up records the failure without awarding xp', () => {
  const study = StudyData.createEmptyStudy();
  study.definitions = [makeDefinition('d1')];
  const result = StudyQuiz.reduceFinalAttempt(study, finalAttempt('d1', 4, 'gave-up', ['d1-actor', 'd1-direct', 'd1-legal']));
  assert.equal(result.progress.d1.gaveUpCount, 1);
  assert.equal(result.gamification.xp, 0);
});

test('low-confidence wrong answer cannot harshly demote stage four to stage two', () => {
  const study = StudyData.createEmptyStudy();
  study.definitions = [makeDefinition('d1')];
  study.progress.d1 = StudyQuiz.createInitialProgress(study.definitions[0], 0);
  const result = StudyQuiz.reduceFinalAttempt(study, finalAttempt('d1', 4, 'wrong', ['d1-legal'], 'low', 1));
  assert.equal(result.progress.d1.stage >= 3, true);
});

test('nextQuestion avoids the same definition consecutively when alternatives exist', () => {
  const study = StudyData.createEmptyStudy();
  study.definitions = [makeDefinition('d1'), makeDefinition('d2')];
  const session = StudyQuiz.createSession(study, { mode: 'all' }, 0);
  session.lastDefinitionId = 'd1';
  const question = StudyQuiz.nextQuestion(study, session, 0, () => 0);
  assert.equal(question.definitionId, 'd2');
});

test('weakness-targeted stage two question uses cloze form', () => {
  const definition = makeDefinition('d1');
  const progress = StudyQuiz.createInitialProgress(definition, 0);
  progress.stage = 2;
  progress.weakUnits['d1-legal'].misses = 3;
  const question = StudyQuiz.buildQuestion(definition, progress, 1);
  assert.equal(question.kind, 'cloze');
  assert.deepEqual(question.targetUnitIds, ['d1-legal']);
  assert.match(question.prompt, /【　】/);
});

test('checkpoint reports capability changes without accuracy fields', () => {
  const study = StudyData.createEmptyStudy();
  const definition = makeDefinition('d1');
  study.definitions = [definition];
  const before = StudyQuiz.createInitialProgress(definition, 0);
  before.stage = 2;
  study.progress.d1 = structuredClone(before);
  const session = StudyQuiz.createSession(study, { mode: 'all' }, 0);
  study.progress.d1.stage = 3;
  study.gamification.xp = 20;
  const checkpoint = StudyQuiz.buildCheckpoint(study, session);
  assert.equal(checkpoint.capabilities[0].message, 'この問題が答えられるようになっています');
  assert.equal('accuracy' in checkpoint, false);
  assert.equal('correctCount' in checkpoint, false);
});

test('keyboard viewport mode uses the visible mobile viewport and keeps quiz input compact', () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const properties = new Map();
  const classes = new Set();
  const input = { matches: (selector) => selector.includes('#quizInputArea textarea') };
  const visualViewport = { height: 430, offsetTop: 12, addEventListener() {} };
  const documentElement = { clientHeight: 800, style: { setProperty: (name, value) => properties.set(name, value) } };
  const body = { classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) } };
  const documentFake = {
    documentElement,
    body,
    head: { appendChild() {} },
    activeElement: input,
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '' }),
    addEventListener() {}
  };
  const windowFake = {
    visualViewport,
    innerHeight: 800,
    navigator: { maxTouchPoints: 1 },
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn) => fn()
  };
  try {
    globalThis.window = windowFake;
    globalThis.document = documentFake;
    assert.equal(StudyQuiz.installKeyboardViewport(), true);
    assert.equal(properties.get('--quiz-visual-height'), '430px');
    assert.equal(properties.get('--quiz-visual-offset-top'), '12px');
    assert.equal(classes.has('keyboard-active'), true);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
