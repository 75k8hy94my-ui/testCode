const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const toolbar = fs.readFileSync('extension/content/site-toolbar.js', 'utf8');
const background = fs.readFileSync('extension/background.js', 'utf8');

test('toolbar bounds QUEUE_DRAFT request and reports background timeout', () => {
  assert.match(toolbar, /QUEUE_REQUEST_TIMEOUT_MS\s*=\s*\d+/);
  assert.match(toolbar, /background-timeout/);
  assert.match(toolbar, /Promise\.race/);
});

test('background returns queue diagnostics before delivery flush can hang the response', () => {
  assert.match(background, /queue-write-start/);
  assert.match(background, /queue-write-success/);
  assert.match(background, /flush-start/);
  assert.match(background, /flushPending/);
  assert.match(background, /deliveryPending/);
});
