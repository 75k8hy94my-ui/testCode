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
