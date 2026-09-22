import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('manga sandbox entry exists and is isolated from authentication and persistence', () => {
  const html = read('manga-sandbox.html');
  const script = read('manga-sandbox.js');
  assert.match(html, /manga-list-route\.js/);
  assert.match(html, /manga-sandbox\.js/);
  for (const forbidden of ['MangaVault', 'supabase-config', 'vault-session', 'localStorage', 'sessionStorage']) {
    assert.doesNotMatch(html + script, new RegExp(forbidden));
  }
  assert.doesNotMatch(script, /fetch\s*\(/);
});

test('manga sandbox exposes virtual save and sync controls', () => {
  const script = read('manga-sandbox.js');
  assert.match(script, /virtualSync/);
  assert.match(script, /virtual-save/);
  assert.match(script, /virtual-receive/);
  assert.match(script, /memoryStorage/);
});
