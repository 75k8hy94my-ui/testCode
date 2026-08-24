import test from 'node:test';
import assert from 'node:assert/strict';
import parser from '../url-parser.js';
const { parseHttpUrl } = parser;

test('accepts ordinary and direct numbered http URLs', () => {
  assert.equal(parseHttpUrl('example.com/foo/').protocol, 'https:');
  assert.equal(parseHttpUrl('https://example.com/foo/01.jpg?x=1#p').pathname, '/foo/01.jpg');
});

test('rejects non-http schemes and malformed input', () => {
  assert.equal(parseHttpUrl('javascript:alert(1)'), null);
  assert.equal(parseHttpUrl('data:text/html,x'), null);
  assert.equal(parseHttpUrl('not a url'), null);
});
