import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');

test('vault session supports same-origin cross-tab handoff without localStorage key persistence', () => {
  assert.match(source, /BroadcastChannel/);
  assert.match(source, /mangaReaderVaultSession/);
  assert.match(source, /vault-request/);
  assert.match(source, /vault-response/);
  assert.doesNotMatch(source, /localStorage\.setItem\(ACTIVE_KEY/);
});

test('saving and clearing active vault announces state to peer tabs', () => {
  assert.match(source, /function channelPost\([\s\S]*postMessage/);
  assert.match(source, /function saveActive\([^)]*\)[^{]*\{[^}]*channelPost\(\{ type: 'vault-response'/);
  assert.match(source, /function clearActive\([^)]*\)[^{]*\{[^}]*channelPost\(\{ type: 'vault-cleared'/);
});
