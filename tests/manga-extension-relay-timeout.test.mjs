import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../extension/content/testcode-content.js', import.meta.url), 'utf8');

test('reader relay timeout leaves room for vault handoff plus cloud save', () => {
  const match = source.match(/const\s+DELIVERY_TIMEOUT_MS\s*=\s*(\d+)/);
  assert.ok(match, 'DELIVERY_TIMEOUT_MS constant must be defined');
  assert.ok(Number(match[1]) >= 15000, 'delivery timeout must be at least 15 seconds');
  assert.match(source, /setTimeout\([^\n]*DELIVERY_TIMEOUT_MS/);
});