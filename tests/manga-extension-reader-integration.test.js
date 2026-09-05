const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../manga-extension-bridge.js', import.meta.url), 'utf8');

test('reader exposes a narrow extension host from inside its closure', () => {
  assert.match(reader, /window\.MangaReaderExtensionHost\s*=\s*\{/);
  assert.match(reader, /getSavedItems:\s*\(\)\s*=>\s*savedItems/);
  assert.match(reader, /persistItems:\s*\(\)\s*=>\s*persistItems\(\)/);
  assert.match(reader, /genId:\s*\(prefix\)\s*=>\s*genId\(prefix\)/);
});

test('bridge consumes the reader extension host instead of closure locals', () => {
  assert.match(bridge, /root\.MangaReaderExtensionHost/);
  assert.doesNotMatch(bridge, /typeof savedItems === 'undefined'/);
});
