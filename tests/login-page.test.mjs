import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('login primary buttons keep contrast when backdrop-filter fallback is active', () => {
  const fallback = source.match(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{([\s\S]*?)\n    \}/);
  assert.ok(fallback, 'fallback CSS block should exist');
  assert.match(fallback[1], /button:not\(\.link-button\), input \{ background: rgba\(255,255,255,\.98\); \}/);
  assert.match(fallback[1], /button\.primary \{/);
  assert.match(fallback[1], /background: var\(--accent\);/);
  assert.match(fallback[1], /color: #fff;/);
  assert.match(fallback[1], /-webkit-text-fill-color: #fff;/);
});

test('login form submit remains a primary button', () => {
  assert.match(source, /<form id="loginForm">[\s\S]*?<button class="primary" type="submit">ログイン<\/button>/);
});
