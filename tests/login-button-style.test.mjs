import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('primary auth buttons override the generic Liquid Glass button background', () => {
  const genericRule = html.indexOf('button:not(.link-button) {');
  const primaryRule = html.indexOf('button.primary { background: linear-gradient(145deg, rgba(37,99,235,.96), rgba(37,99,235,.72));');

  assert.ok(genericRule >= 0, 'generic Liquid Glass button rule should exist');
  assert.ok(primaryRule > genericRule, 'button.primary must override the generic glass button rule with equal-or-higher selector specificity');
  assert.match(
    html,
    /button\.primary:hover\s*\{\s*background:\s*linear-gradient\(145deg, rgba\(29,78,216,\.98\), rgba\(37,99,235,\.78\)\);\s*\}/,
  );
});
