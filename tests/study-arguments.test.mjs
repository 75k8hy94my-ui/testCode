import test from 'node:test';
import assert from 'node:assert/strict';
import StudyArguments from '../study-arguments.js';

test('argument ranks normalize to A B C with B fallback', () => {
  assert.equal(StudyArguments.normalizeRank('a'), 'A');
  assert.equal(StudyArguments.normalizeRank('C'), 'C');
  assert.equal(StudyArguments.normalizeRank('x'), 'B');
});

test('memorized arguments become due after seven days', () => {
  const now = Date.UTC(2026, 7, 27, 0, 0, 0);
  const progress = StudyArguments.markProgress({}, 'memorized', now);
  assert.equal(progress.status, 'memorized');
  assert.equal(StudyArguments.isDue(progress, now + 6 * StudyArguments.DAY_MS), false);
  assert.equal(StudyArguments.isDue(progress, now + 7 * StudyArguments.DAY_MS), true);
});

test('review and learning statuses schedule immediate or next-day review', () => {
  const now = Date.UTC(2026, 7, 27, 0, 0, 0);
  const review = StudyArguments.markProgress({}, 'review', now);
  assert.equal(StudyArguments.isDue(review, now), true);
  const learning = StudyArguments.markProgress(review, 'learning', now);
  assert.equal(StudyArguments.isDue(learning, now), false);
  assert.equal(StudyArguments.isDue(learning, now + StudyArguments.DAY_MS), true);
});

test('argument filters combine subject genre rank status and due state', () => {
  const now = Date.UTC(2026, 7, 27, 0, 0, 0);
  const study = {
    arguments: [
      { id: 'a1', subjectId: 'civil-law', genreId: 'g1', rank: 'A', title: '解除' },
      { id: 'a2', subjectId: 'criminal-law', genreId: 'g2', rank: 'B', title: '共犯' }
    ],
    argumentProgress: {
      a1: StudyArguments.markProgress({}, 'review', now),
      a2: StudyArguments.markProgress({}, 'memorized', now)
    }
  };
  assert.deepEqual(StudyArguments.filterArguments(study, { subjectId: 'civil-law', rank: 'A', dueOnly: true }, now).map((a) => a.id), ['a1']);
  assert.deepEqual(StudyArguments.filterArguments(study, { status: 'memorized' }, now).map((a) => a.id), ['a2']);
  assert.deepEqual(StudyArguments.summarize(study, now), { total: 2, memorized: 1, due: 1 });
});


test('argument formatting exposes five marker colors in full and lower-third modes plus two underlines', () => {
  const styles = StudyArguments.VALID_ARGUMENT_STYLES;
  for (const color of ['pink','green','orange','yellow','blue']) {
    assert.equal(styles.has(`marker-${color}-full`), true);
    assert.equal(styles.has(`marker-${color}-low`), true);
  }
  assert.equal(styles.has('underline-red'), true);
  assert.equal(styles.has('underline-black'), true);
  assert.equal(styles.size, 12);
});

test('applying a marker replaces an overlapping marker but preserves underline', () => {
  let annotations = [];
  annotations = StudyArguments.applyStyle(annotations, 0, 5, 'marker-yellow-full', 10);
  annotations = StudyArguments.applyStyle(annotations, 2, 8, 'underline-red', 10);
  annotations = StudyArguments.applyStyle(annotations, 3, 7, 'marker-pink-low', 10);
  assert.deepEqual(annotations.filter((x) => x.style === 'underline-red'), [{ start: 2, end: 8, style: 'underline-red' }]);
  assert.deepEqual(annotations.filter((x) => x.style.startsWith('marker-')), [
    { start: 0, end: 3, style: 'marker-yellow-full' },
    { start: 3, end: 7, style: 'marker-pink-low' }
  ]);
});

test('clear formatting only removes the selected portion', () => {
  const annotations = [
    { start: 0, end: 10, style: 'marker-green-full' },
    { start: 2, end: 8, style: 'underline-black' }
  ];
  assert.deepEqual(StudyArguments.clearStyles(annotations, 4, 6, 10), [
    { start: 0, end: 4, style: 'marker-green-full' },
    { start: 2, end: 4, style: 'underline-black' },
    { start: 6, end: 8, style: 'underline-black' },
    { start: 6, end: 10, style: 'marker-green-full' }
  ]);
});

test('annotations after a text edit shift while formatting intersecting the edit is trimmed', () => {
  const annotations = [
    { start: 0, end: 4, style: 'marker-yellow-full' },
    { start: 6, end: 10, style: 'underline-red' }
  ];
  const result = StudyArguments.transformAnnotationsForTextChange('abcdefghij', 'abXYZcdefghij', annotations);
  assert.deepEqual(result, [
    { start: 0, end: 2, style: 'marker-yellow-full' },
    { start: 9, end: 13, style: 'underline-red' }
  ]);
});

test('annotated rendering escapes user text and composes marker with underline', () => {
  const html = StudyArguments.renderAnnotatedHtml('<規範>\n要件', [
    { start: 0, end: 4, style: 'marker-pink-full' },
    { start: 1, end: 3, style: 'underline-red' }
  ]);
  assert.match(html, /&lt;/);
  assert.match(html, /argument-marker-pink-full/);
  assert.match(html, /argument-underline-red/);
  assert.match(html, /<br>/);
  assert.doesNotMatch(html, /<規範>/);
});
