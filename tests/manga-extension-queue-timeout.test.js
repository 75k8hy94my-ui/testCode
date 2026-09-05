const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const toolbar = fs.readFileSync('extension/content/site-toolbar.js', 'utf8');
const background = fs.readFileSync('extension/background.js', 'utf8');

test('toolbar bounds queue and delivery requests independently', () => {
  assert.match(toolbar, /QUEUE_REQUEST_TIMEOUT_MS\s*=\s*\d+/);
  assert.match(toolbar, /FLUSH_REQUEST_TIMEOUT_MS\s*=\s*\d+/);
  assert.match(toolbar, /background-timeout/);
  assert.match(toolbar, /flush-timeout/);
  assert.match(toolbar, /Promise\.race/);
});

test('queue acknowledgement is independent from explicit delivery flush', () => {
  assert.match(background, /queue-write-start/);
  assert.match(background, /queue-write-success/);
  assert.match(background, /message\.type === 'FLUSH_PENDING'/);
  assert.match(background, /flushPending/);
  assert.doesNotMatch(background, /deliveryPending/);
});

test('toolbar explicitly flushes after a successful durable enqueue', () => {
  assert.match(toolbar, /type:'QUEUE_DRAFT'/);
  assert.match(toolbar, /type:'FLUSH_PENDING'/);
  assert.match(toolbar, /await queueDraft\(draft\)[\s\S]*await flushDraft\(\)/);
});
