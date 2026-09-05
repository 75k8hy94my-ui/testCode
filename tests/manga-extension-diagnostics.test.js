const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const background = fs.readFileSync('extension/background.js', 'utf8');
const toolbar = fs.readFileSync('extension/content/site-toolbar.js', 'utf8');
const relay = fs.readFileSync('extension/content/testcode-content.js', 'utf8');
const bridge = fs.readFileSync('manga-extension-bridge.js', 'utf8');

test('background reports delivery stages instead of swallowing tab errors', () => {
  assert.match(background, /diagnostics/);
  assert.match(background, /reader-detected/);
  assert.match(background, /relay-error/);
  assert.doesNotMatch(background, /catch \(_\) \{\}\n\s*\}/);
});

test('reader relay reports bridge lifecycle stages', () => {
  assert.match(relay, /bridge-ready/);
  assert.match(relay, /bridge-timeout/);
  assert.match(relay, /diagnostics/);
});

test('page bridge reports vault, bookshelf and cloud save stages', () => {
  assert.match(bridge, /vault-ready/);
  assert.match(bridge, /bookshelf-written/);
  assert.match(bridge, /cloud-save-start/);
  assert.match(bridge, /cloud-save-success/);
  assert.match(bridge, /cloud-save-failed/);
});

test('site toolbar renders diagnostic trace', () => {
  assert.match(toolbar, /診断/);
  assert.match(toolbar, /diagnostics/);
  assert.match(toolbar, /reader-detected/);
});
