import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('desktop app pages use the shared 920px content width', () => {
  const rail = read('app-desktop-rail.js');
  assert.match(rail, /--app-desktop-content-max:\s*920px/);
  assert.match(rail, /max-width:\s*var\(--app-desktop-content-max\)/);
});
