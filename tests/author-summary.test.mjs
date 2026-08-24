import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildAuthorSummary } = require('../author-summary.js');

test('author summary groups related works, series, tags, videos, and recent reads', () => {
  const summary = buildAuthorSummary(
    { name: '作者', circleName: 'サークル' },
    [
      { id: 'old', author: '作者', series: 'シリーズA', tags: ['タグA'], lastReadAt: 10 },
      { id: 'new', author: 'サークル', series: 'シリーズA', tags: ['タグA', 'タグB'], lastReadAt: 20 },
      { id: 'other', author: '別作者', series: '別シリーズ', tags: ['別タグ'], lastReadAt: 30 }
    ],
    [{ title: '動画タイトル' }]
  );
  assert.deepEqual(summary.relatedItems.map((item) => item.id), ['old', 'new']);
  assert.deepEqual(summary.series, ['シリーズA']);
  assert.deepEqual(summary.tags, ['タグA', 'タグB']);
  assert.deepEqual(summary.recentItems.map((item) => item.id), ['new', 'old']);
  assert.deepEqual(summary.videos.map((video) => video.title), ['動画タイトル']);
});
