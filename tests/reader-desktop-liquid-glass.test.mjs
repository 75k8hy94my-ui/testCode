import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../reader-liquid-glass.css', import.meta.url), 'utf8');

test('Reader loads the dedicated desktop glass stylesheet after its inline defaults', () => {
  assert.match(reader, /<link rel="stylesheet" href="reader-liquid-glass\.css\?v=[^"]+">/);
  assert.ok(reader.indexOf('</style>') < reader.indexOf('reader-liquid-glass.css'));
});

test('glass visual overrides are desktop-scoped and do not replace the image stage', () => {
  assert.match(css, /^@media \(min-width: 801px\)/);
  assert.match(css, /#topbar,\s*#controls,\s*#nextVolumeBanner/);
  assert.match(css, /backdrop-filter: blur\(30px\)/);
  assert.doesNotMatch(css, /#viewer|#pageStage|\.readerPageImage/);
  assert.match(reader, /@media\(max-width:700px\)/);
});

test('floating controls retain chrome-hide behavior, keyboard focus, and fallback', () => {
  assert.match(css, /body\.reader-chrome-hidden #topbar/);
  assert.match(css, /body\.reader-chrome-hidden #controls/);
  assert.match(css, /#pageSlider:focus-visible/);
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
