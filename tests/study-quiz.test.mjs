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
  assert.match(question.prompt, /【1】/);
  assert.equal(question.clozeItems.length, 1);
});

test('stage one recognition asks a real blank and never exposes the model answer as an option', () => {
  const modelText = '公判外の供述を内容とする供述または書面で、当該公判外供述の内容の真実性を証明するために用いられるもの';
  const definition = {
    id: 'hearsay-choice', subjectId: 'criminal-procedure', genreId: 'evidence', title: '伝聞証拠', contentRevision: 1,
    modelText,
    memoryUnits: [
      { id: 'hc-core', text: '公判外の供述を内容とする供述または書面で、', required: true, importantTerms: ['公判外の供述', '供述または書面'], acceptedVariants: [] },
      { id: 'hc-purpose', text: '当該公判外供述の内容の真実性を証明するために用いられるもの', required: true, importantTerms: ['真実性', '証明'], acceptedVariants: [] },
      { id: 'hc-whole', text: modelText, required: true, importantTerms: [], acceptedVariants: [] }
    ],
    clozeCandidates: [
      { unitId: 'hc-core', terms: ['公判外の供述'] },
      { unitId: 'hc-purpose', terms: ['真実性', '証明'] }
    ]
  };
  const progress = StudyQuiz.createInitialProgress(definition, 0);
  progress.stage = 1;
  progress.weakUnits['hc-core'].misses = 4;
  const question = StudyQuiz.buildQuestion(definition, progress, 1);
  assert.equal(question.kind, 'choice');
  assert.match(question.prompt, /【　】/);
  assert.equal(question.prompt.includes(modelText), false);
  assert.equal(question.options.includes(modelText), false);
  assert.equal(question.options.includes(definition.memoryUnits[0].text), false);
  assert.equal(question.options[question.correctOptionIndex], '公判外の供述');
  assert.equal(question.options.length >= 3, true);
});

test('stage one falls back to typed cloze when safe distractors are unavailable', () => {
  const definition = {
    id: 'single-term', subjectId: 'civil-law', genreId: 'general', title: '単語定義', contentRevision: 1,
    modelText: '法律上の効果を生じさせる意思表示',
    memoryUnits: [{ id: 'single-core', text: '意思表示', required: true, importantTerms: ['意思表示'], acceptedVariants: [] }],
    clozeCandidates: [{ unitId: 'single-core', terms: ['意思表示'] }]
  };
  const progress = StudyQuiz.createInitialProgress(definition, 0);
  progress.stage = 1;
  const question = StudyQuiz.buildQuestion(definition, progress, 1);
  assert.equal(question.kind, 'cloze');
  assert.match(question.prompt, /【1】/);
  assert.deepEqual(question.options, []);
  assert.equal(question.clozeItems[0].answer, '意思表示');
});

test('multi-term cloze exposes one numbered answer slot per blank', () => {
  const definition = {
    id: 'hearsay', subjectId: 'criminal-procedure', genreId: 'evidence', title: '伝聞証拠', contentRevision: 1,
    modelText: '公判外の供述を内容とする供述または書面で、当該公判外供述の内容の真実性を証明するために用いられるもの',
    memoryUnits: [{
      id: 'hearsay-core',
      text: '公判外の供述を内容とする供述または書面',
      required: true,
      importantTerms: ['公判外の供述', '供述または書面'],
      acceptedVariants: []
    }],
    clozeCandidates: [{ unitId: 'hearsay-core', terms: ['公判外の供述', '供述または書面'] }]
  };
  const progress = StudyQuiz.createInitialProgress(definition, 0);
  progress.stage = 2;
  const question = StudyQuiz.buildQuestion(definition, progress, 1);
  assert.equal(question.kind, 'cloze');
  assert.equal(question.clozeItems.length, 2);
  assert.deepEqual(question.clozeItems.map((item) => item.answer), ['公判外の供述', '供述または書面']);
  assert.match(question.prompt, /【1】/);
  assert.match(question.prompt, /【2】/);
});

test('cloze grading distinguishes correct, partial, and wrong answers per blank', () => {
  const question = {
    kind: 'cloze',
    targetUnitIds: ['hearsay-core'],
    clozeItems: [
      { index: 0, answer: '公判外の供述' },
      { index: 1, answer: '供述または書面' }
    ]
  };
  const correct = StudyQuiz.gradeClozeAnswers(question, ['公判外の供述', '供述または書面']);
  assert.equal(correct.result, 'correct');
  assert.deepEqual(correct.items.map((item) => item.correct), [true, true]);
  const partial = StudyQuiz.gradeClozeAnswers(question, ['公判外の供述', '口頭供述']);
  assert.equal(partial.result, 'almost');
  assert.equal(partial.correctCount, 1);
  assert.equal(partial.totalCount, 2);
  assert.deepEqual(partial.items.map((item) => item.correct), [true, false]);
  const wrong = StudyQuiz.gradeClozeAnswers(question, ['判決書', '証拠物']);
  assert.equal(wrong.result, 'wrong');
  assert.equal(wrong.correctCount, 0);
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

test('submission state keeps answering, grading, and feedback controls mutually exclusive', () => {
  const elements = {
    actions: { hidden: false },
    submit: { disabled: false, textContent: '判定する' },
    giveUp: { disabled: false },
    next: { hidden: true }
  };
  StudyQuiz.applySubmissionState(elements, 'grading');
  assert.equal(elements.actions.hidden, false);
  assert.equal(elements.next.hidden, true);
  assert.equal(elements.submit.disabled, true);
  assert.equal(elements.giveUp.disabled, true);
  assert.equal(elements.submit.textContent, '採点中…');
  StudyQuiz.applySubmissionState(elements, 'feedback');
  assert.equal(elements.actions.hidden, true);
  assert.equal(elements.next.hidden, false);
  assert.equal(elements.submit.disabled, false);
  assert.equal(elements.submit.textContent, '判定する');
});

test('submission state does not rewrite hidden attributes when state already matches', () => {
  let actionWrites = 0;
  let nextWrites = 0;
  const actions = {
    _hidden: true,
    get hidden() { return this._hidden; },
    set hidden(value) { actionWrites++; this._hidden = value; }
  };
  const next = {
    _hidden: false,
    get hidden() { return this._hidden; },
    set hidden(value) { nextWrites++; this._hidden = value; }
  };
  StudyQuiz.applySubmissionState({
    actions,
    submit: { disabled: false, textContent: '判定する' },
    giveUp: { disabled: false },
    next
  }, 'feedback');
  assert.equal(actionWrites, 0);
  assert.equal(nextWrites, 0);
});
