const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.join(__dirname, '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));

test('manifest entry paths are relative to extension directory', () => {
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.action.default_popup, 'popup.html');
  for (const script of manifest.content_scripts.flatMap((entry) => entry.js || [])) {
    assert.equal(script.startsWith('extension/'), false);
    assert.equal(fs.existsSync(path.join(extensionRoot, script)), true);
  }
});