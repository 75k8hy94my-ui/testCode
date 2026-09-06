import test from 'node:test';
import assert from 'node:assert/strict';
import cover from '../index-book-cover.js';

test('fits an uploaded cover inside 800px without enlarging it', () => {
  assert.deepEqual(cover.calculateContainSize(1600, 2400, 800), { width: 533, height: 800 });
  assert.deepEqual(cover.calculateContainSize(400, 600, 800), { width: 400, height: 600 });
});

test('normalizes URL and uploaded cover metadata', () => {
  assert.deepEqual(cover.normalizeCover({ type: 'url', value: ' https://example.com/book.jpg ' }), { type: 'url', value: 'https://example.com/book.jpg' });
  assert.deepEqual(cover.normalizeCover({ type: 'upload', value: 'data:image/webp;base64,abc' }), { type: 'upload', value: 'data:image/webp;base64,abc' });
});