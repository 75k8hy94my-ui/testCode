import test from 'node:test';
import assert from 'node:assert/strict';
import statutes from '../statute-data.js';

const { LAW_CATALOG, normalizeArticleQuery, searchArticles } = statutes;

test('catalog contains the six selected statutes and uses Company Act instead of Commercial Code', () => {
  assert.deepEqual(LAW_CATALOG.map((law) => law.title), ['憲法', '民法', '会社法', '刑法', '民事訴訟法', '刑事訴訟法']);
  assert.equal(LAW_CATALOG.some((law) => law.title === '商法'), false);
});

test('article query normalization accepts common Japanese article input forms', () => {
  assert.equal(normalizeArticleQuery('第709条'), '709');
  assert.equal(normalizeArticleQuery('７０９条'), '709');
  assert.equal(normalizeArticleQuery('3条の2'), '3_2');
  assert.equal(normalizeArticleQuery('第３条の２'), '3_2');
});

test('article search matches article numbers and body text', () => {
  const law = {
    articles: [
      { num: '1', title: '第一条', caption: '基本原則', text: 'この法律は基本原則を定める。' },
      { num: '709', title: '第七百九条', caption: '不法行為による損害賠償', text: '故意又は過失によって他人の権利を侵害した者は、損害を賠償する責任を負う。' }
    ]
  };
  assert.deepEqual(searchArticles(law, '709').map((article) => article.num), ['709']);
  assert.deepEqual(searchArticles(law, '損害賠償').map((article) => article.num), ['709']);
});
