const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const relay = fs.readFileSync('extension/content/testcode-content.js', 'utf8');

test('relay diagnoses bridge script load and execution separately', () => {
  assert.match(relay, /bridge-script-inject/);
  assert.match(relay, /bridge-script-loaded/);
  assert.match(relay, /bridge-script-error/);
  assert.match(relay, /bridge-ready-timeout/);
  assert.match(relay, /script\.addEventListener\(['"]load['"]/);
  assert.match(relay, /script\.addEventListener\(['"]error['"]/);
});

test('relay does not misclassify a missing bridge as a locked vault', () => {
  assert.match(relay, /bridgeReady\s*\?\s*'invalid'\s*:\s*'invalid'/);
  assert.match(relay, /bridgeが応答しませんでした/);
});
