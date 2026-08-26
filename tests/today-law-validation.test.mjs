import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRecord, validateRecords, normalizeStatutoryText, extractTextLeaves
} from '../scripts/today-law-validation.mjs';
import { buildEgovVerificationUrl } from '../scripts/verify-today-laws.mjs';

const good = {
  id: 'civil-code-94-2', subject: 'civil-law', lawName: '民法', lawId: '129AC0000000089',
  article: '94', paragraph: '2', elm: 'MainProvision-Article_94-Paragraph_2',
  text: '前項の規定による意思表示の無効は、善意の第三者に対抗することができない。',
  story: '第三者保護の入口になる。', examPoint: '94条2項類推と接続する。', tags: ['意思表示'],
  sourceUrl: 'https://laws.e-gov.go.jp/law/129AC0000000089', verifiedOn: '2026-08-26'
};

test('valid record passes and duplicate IDs fail', () => {
  assert.deepEqual(validateRecord(good), []);
  assert.ok(validateRecords([good, { ...good }]).some((x) => x.includes('duplicate id')));
});

test('subject-scoped expected count validates a partial corpus', () => {
  assert.deepEqual(validateRecords([good], { expectedCounts: { 'civil-law': 1 } }), []);
});

test('source text normalization removes formatting whitespace only', () => {
  assert.equal(normalizeStatutoryText('前項の規定による意思表示の無効は、\n 善意の第三者に対抗することができない。'), good.text);
});

test('text leaves are concatenated in source order', () => {
  const value = { Sentence: ['前項の', { Ruby: ['意思表示'] }, 'の無効'] };
  assert.equal(extractTextLeaves(value), '前項の意思表示の無効');
});

test('e-Gov metadata, numbering labels, and ruby readings are not treated as statutory sentence text', () => {
  const value = {
    tag: 'Paragraph', attr: { Num: '2', WritingMode: 'vertical' },
    children: [
      { tag: 'ParagraphNum', children: ['２'] },
      { tag: 'Sentence', attr: { Num: '1' }, children: ['善意の', { tag: 'Ruby', children: ['第三者', { tag: 'Rt', children: ['だいさんしゃ'] }] }, 'を保護する。'] }
    ]
  };
  assert.equal(extractTextLeaves(value), '善意の第三者を保護する。');
});

test('invalid source, selector, tags, and date are rejected', () => {
  const bad = { ...good, elm: 'SupplProvision-Article_1', sourceUrl: 'http://example.com/law', tags: [], verifiedOn: '26-08-26' };
  const errors = validateRecord(bad).join('\n');
  assert.match(errors, /elm/);
  assert.match(errors, /sourceUrl/);
  assert.match(errors, /tags/);
  assert.match(errors, /verifiedOn/);
});

test('full corpus validation enforces exact subject counts and total', () => {
  const errors = validateRecords([good], { requireTotal: true });
  assert.ok(errors.some((x) => x.includes('total 370')));
  assert.ok(errors.some((x) => x.includes('constitutional-law')));
});

test('e-Gov verification URL targets the exact paragraph and JSON light response', () => {
  const url = buildEgovVerificationUrl(good);
  assert.ok(url.includes('/api/2/law_data/129AC0000000089'));
  assert.ok(url.includes('elm=MainProvision-Article_94-Paragraph_2'));
  assert.ok(url.includes('law_full_text_format=json'));
  assert.ok(url.includes('json_format=light'));
  assert.ok(url.includes('response_format=json'));
  assert.ok(url.includes('omit_amendment_suppl_provision=true'));
});
