import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { signedDistance, createDisplacementPixels, supportsOpticalBackdrop } =
  require('../reader-liquid-glass.js');
const html = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../reader-liquid-glass.css', import.meta.url), 'utf8');

test('rounded lens has neutral center and genuine directional edge displacement', () => {
  const w = 180;
  const h = 68;
  const pixels = createDisplacementPixels(w, h, 22);
  const rgba = (x, y) => Array.from(pixels.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
  assert.equal(pixels.length, w * h * 4);
  assert.deepEqual(rgba(90, 34), [128, 128, 128, 255]);
  assert.ok(rgba(2, 34)[0] > 128, 'left rim bends the backdrop inward');
  assert.ok(rgba(177, 34)[0] < 128, 'right rim bends the backdrop inward');
  assert.ok(rgba(90, 2)[1] > 128, 'top rim bends the backdrop inward');
  assert.ok(rgba(90, 65)[1] < 128, 'bottom rim bends the backdrop inward');
  assert.ok(signedDistance(90, 34, w, h, 22) < -15);
});

test('optical filter is limited to supporting desktop Chromium implementations', () => {
  const fake = (agent, supported) => ({
    navigator: { userAgent: agent },
    CSS: { supports: () => supported },
    ResizeObserver: class {},
  });
  assert.equal(supportsOpticalBackdrop(fake('Mozilla/5.0 Chrome/131.0.0.0', true)), true);
  assert.equal(supportsOpticalBackdrop(fake('Mozilla/5.0 Edg/131.0', true)), true);
  assert.equal(supportsOpticalBackdrop(fake('Mozilla/5.0 Safari/605.1.15', true)), false);
  assert.equal(supportsOpticalBackdrop(fake('Mozilla/5.0 CriOS/131.0', true)), false);
  assert.equal(supportsOpticalBackdrop(fake('Mozilla/5.0 Chrome/131.0', false)), false);
});

test('reader hooks load a progressive enhancement without mutating the image stage', () => {
  assert.match(html, /<script src="reader-liquid-glass\.js\?v=20261114-optical"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="reader-liquid-glass\.css\?v=20261114-optical">/);
  assert.match(css, /#topbar\.reader-glass-refracting/);
  assert.match(css, /#controls\.reader-glass-refracting/);
  assert.match(css, /backdrop-filter: var\(--reader-optical-filter\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /#pageStage|\.readerPageImage|#viewer/);
  assert.match(html, /<section id="viewer" aria-label="ページ表示"><div id="pageStage"><\/div><\/section>/);
});
