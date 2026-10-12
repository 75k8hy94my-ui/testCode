import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('manga page turns preserve the document scroll position', () => {
  const route = fs.readFileSync('manga-list-route.js', 'utf8');
  const handler = route.slice(
    route.indexOf('onPageChange: (delta) => {'),
    route.indexOf('swipeSurface: elements.savedListItems')
  );
  assert.match(handler, /runtime\.renderSavedList\(delta\)/);
  assert.doesNotMatch(handler, /scrollIntoView|scrollTo|scrollTop|scrollY|focus\(/);
});
