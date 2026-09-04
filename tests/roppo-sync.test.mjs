import test from 'node:test';
import assert from 'node:assert/strict';
import { kanjiNumberToArabic, normalizeLegalReferences, convertLawTree } from '../scripts/roppo-sync-lib.mjs';

test('kanji legal numbers convert to Arabic without changing ordinary kanji numbers', () => {
  assert.equal(kanjiNumberToArabic('百五'), '105');
  assert.equal(kanjiNumberToArabic('千二百三十四'), '1234');
  assert.equal(normalizeLegalReferences('第百五条の二第二項及び第三号。金百万円を支払う。'), '第105条の2第2項及び第3号。金百万円を支払う。');
});

test('law tree conversion preserves official caption and separates paragraphs', () => {
  const law = {
    tag: 'Law', attr: {}, children: [{
      tag: 'LawBody', attr: {}, children: [
        { tag: 'LawTitle', attr: {}, children: ['民法'] },
        { tag: 'MainProvision', attr: {}, children: [{
          tag: 'Article', attr: { Num: '95' }, children: [
            { tag: 'ArticleCaption', attr: {}, children: ['（錯誤）'] },
            { tag: 'ArticleTitle', attr: {}, children: ['第九十五条'] },
            { tag: 'Paragraph', attr: { Num: '1' }, children: [
              { tag: 'ParagraphNum', attr: {}, children: ['１'] },
              { tag: 'ParagraphSentence', attr: {}, children: [{ tag: 'Sentence', attr: {}, children: ['意思表示は、第九十条の規定により…'] }] }
            ] },
            { tag: 'Paragraph', attr: { Num: '2' }, children: [
              { tag: 'ParagraphNum', attr: {}, children: ['２'] },
              { tag: 'ParagraphSentence', attr: {}, children: [{ tag: 'Sentence', attr: {}, children: ['前項の場合において…'] }] }
            ] }
          ]
        }] }
      ]
    }]
  };
  const out = convertLawTree(law, { id: '129AC0000000089', name: '民法', lawNumber: '明治二十九年法律第八十九号' }, '2026-09-04T00:00:00.000Z');
  assert.equal(out.articles.length, 1);
  assert.equal(out.articles[0].number, '第95条');
  assert.equal(out.articles[0].caption, '錯誤');
  assert.deepEqual(out.articles[0].paragraphs.map((p) => p.num), ['1', '2']);
  assert.match(out.articles[0].paragraphs[0].text, /第90条/);
  assert.equal(out.articles[0].bodyText, out.articles[0].paragraphs.map((p) => p.text).join('\n'));
});

test('article without ArticleCaption has no invented caption', () => {
  const law = { tag:'Law', attr:{}, children:[{ tag:'LawBody', attr:{}, children:[{ tag:'MainProvision', attr:{}, children:[{ tag:'Article', attr:{Num:'1'}, children:[{tag:'ArticleTitle',attr:{},children:['第一条']},{tag:'Paragraph',attr:{Num:'1'},children:[{tag:'ParagraphSentence',attr:{},children:[{tag:'Sentence',attr:{},children:['本文だけ'] }]}]}] }]}]}] };
  const out = convertLawTree(law, { id:'x', name:'法令', lawNumber:'' }, '2026-09-04T00:00:00.000Z');
  assert.equal(out.articles[0].caption, '');
});
