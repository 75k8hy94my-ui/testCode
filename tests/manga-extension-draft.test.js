const test = require('node:test');
const assert = require('node:assert/strict');
const extractor = require('../extension/content/extractor.js');

test('extractDraft prefers pages when two or more are found', () => {
  const title = { textContent: ' 作品 A ' };
  const root = {
    querySelector(selector) { return selector === '#title' ? title : null; },
    querySelectorAll(selector) { return selector === '.page' ? [{currentSrc:'https://x/1.jpg'},{currentSrc:'https://x/2.jpg'}] : []; }
  };
  const rule = { fields: { title: { candidates:[{selector:'#title'}] }, allPageImages: { selector: '.page' } } };
  const draft = extractor.extractDraft(rule, root, 'https://example.com/book/1');
  assert.equal(draft.title, '作品 A');
  assert.deepEqual(draft.pages, ['https://x/1.jpg','https://x/2.jpg']);
  assert.equal(draft.url, undefined);
});

test('extractDraft rejects a draft without a usable image source', () => {
  const root = { querySelector() { return {textContent:'A'}; }, querySelectorAll() { return []; } };
  assert.throws(() => extractor.extractDraft({fields:{title:{candidates:[{selector:'#x'}]}}}, root, 'https://example.com/x'), /画像/);
});