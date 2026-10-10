import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');

test('Vault exposes remote payload loading and records its revision before game autosave', () => {
  assert.match(source, /async function loadPayload\(\)/);
  assert.match(source, /async function loadPayload\(\)[\s\S]*fetchRecord\(token, user\)[\s\S]*decryptPayload\(record\.payload\)[\s\S]*setMeta\(user\.id/);
  assert.match(source, /window\.MangaVault\s*=\s*\{[\s\S]*loadPayload/);
});
