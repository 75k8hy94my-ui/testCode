const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../extension/content/rule-locator.js');

test('selectBestRule chooses the most specific matching pattern on the same origin', () => {
  const candidates = [
    { id: 'broad', origin: 'https://example.com', urlPattern: '/manga/*' },
    { id: 'viewer', origin: 'https://example.com', urlPattern: '/manga/*/viewer/*' }
  ];
  assert.equal(rules.selectBestRule(candidates, 'https://example.com/manga/12/viewer/3?token=x').id, 'viewer');
});

test('rules never match a different origin', () => {
  assert.equal(rules.selectBestRule([{ id: 'x', origin: 'https://a.example', urlPattern: '/*' }], 'https://b.example/1'), null);
});

test('normalizePathPattern discards query and hash', () => {
  assert.equal(rules.normalizePathPattern('https://example.com/manga/*?x=1#top'), '/manga/*');
});