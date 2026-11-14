import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../reader-liquid-glass.css', import.meta.url), 'utf8');
const material = fs.readFileSync(new URL('../liquid-glass.css', import.meta.url), 'utf8');

test('Reader preserves its geometry but uses the shared glass engine', () => {
  assert.match(reader, /reader-liquid-glass\.css\?v=20261114-mobile-header-fix/);
  assert.match(reader, /liquid-glass\.css\?v=20261114-shared-material/);
  assert.match(reader, /liquid-glass-engine\.js\?v=20261114-shared-material/);
  assert.ok(reader.indexOf('reader-liquid-glass.css') < reader.indexOf('liquid-glass.css'));
  assert.doesNotMatch(reader, /reader-liquid-glass\.js/);
});

test('Reader layout has no optical filter or material painting implementation', () => {
  assert.match(layout, /@media \(min-width: 801px\)/);
  assert.match(layout, /#readerApp #topbar/);
  assert.match(layout, /#readerApp #controls/);
  assert.doesNotMatch(layout, /backdrop-filter|feDisplacementMap|--lg-fill/);
  assert.doesNotMatch(layout, /#viewer|#pageStage|\.readerPageImage/);
  assert.match(material, /#readerApp #topbar/);
  assert.match(material, /backdrop-filter:/);
});

test('Chrome hide, touch layout, keyboard accessibility, and fallback remain', () => {
  assert.match(layout, /body\.reader-chrome-hidden #readerApp #topbar/);
  assert.match(layout, /body\.reader-chrome-hidden #readerApp #controls/);
  assert.match(layout, /@media \(max-width: 800px\)/);
  assert.match(material, /#readerApp #pageSlider:focus-visible/);
  assert.match(material, /prefers-reduced-transparency: reduce/);
  assert.match(material, /prefers-reduced-motion: reduce/);
  assert.match(reader, /@media\(max-width:700px\)/);
});
