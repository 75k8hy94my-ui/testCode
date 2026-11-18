import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => fs.readFileSync(new URL('../'+name, import.meta.url), 'utf8');
const html = read('statutes.html');
const css = read('statutes-page.css');
const interactions = read('statutes-page-interactions.js');

test('statutes page loads its route-scoped CSS without changing shared Liquid Glass entry', () => {
  assert.match(html, /<link rel="stylesheet" href="statutes-page\.css\?v=[\w-]+">/);
  assert.match(html, /liquid-glass\.css\?v=/);
  assert.match(html, /liquid-glass-engine\.js\?v=/);
  assert.doesNotMatch(html, /<style\b|\.statutesMain\{/);
  assert.match(css, /\.statutesMain\{/);
  assert.match(css, /statutesDefinitionSide|statutesPhoneResize/);
});

test('statutes interaction owner is loaded in original sequence after definitions and before search', () => {
  const defs = html.indexOf('statutes-definitions.js');
  const interaction = html.indexOf('statutes-page-interactions.js');
  const search = html.indexOf('statutes-search.js');
  assert.ok(defs >= 0 && defs < interaction && interaction < search);
  assert.doesNotMatch(interactions, /MangaVault\.save|StatutesVault\.sync|vault-payload/);
  assert.match(interactions, /contextmenu/);
  assert.match(interactions, /statutes:phone-pane-ratio/);
  assert.match(interactions, /mobile-bottom-nav-ready/);
  assert.match(interactions, /ResizeObserver/);
  assert.equal((interactions.match(/\(\(\) => \{/g) || []).length, 4);
});
