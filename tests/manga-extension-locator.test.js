const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../extension/content/rule-locator.js');

test('generateLocatorCandidates prefers stable id then data attributes', () => {
  const element = {
    id: 'book-title',
    classList: ['title','css-9af31c'],
    attributes: [
      { name: 'id', value: 'book-title' },
      { name: 'data-testid', value: 'manga-title' },
      { name: 'class', value: 'title css-9af31c' }
    ],
    tagName: 'H1', parentElement: null
  };
  const candidates = rules.generateLocatorCandidates(element);
  assert.equal(candidates[0].selector, '#book-title');
  assert.equal(candidates[1].selector, '[data-testid="manga-title"]');
});

test('resolveLocator falls back when the first selector stops matching', () => {
  const target = { ok: true };
  const root = { querySelector(selector) { return selector === '[data-testid="title"]' ? target : null; } };
  assert.equal(rules.resolveLocator(root, [{selector:'#missing'},{selector:'[data-testid="title"]'}]), target);
});