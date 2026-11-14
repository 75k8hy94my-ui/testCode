import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { roundedDistance, displacementPixels, canRefract, PRESETS } =
  require('../liquid-glass-engine.js');
const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../liquid-glass-engine.js', import.meta.url), 'utf8');
const material = fs.readFileSync(new URL('../liquid-glass.css', import.meta.url), 'utf8');

test('one reusable rounded lens bends the four edges but not the center', () => {
  const width = 180;
  const height = 68;
  const pixels = displacementPixels(width, height, 22);
  const rgba = (x, y) => Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
  assert.equal(pixels.length, width * height * 4);
  assert.deepEqual(rgba(90, 34), [128, 128, 128, 255]);
  assert.ok(rgba(2, 34)[0] > 128);
  assert.ok(rgba(177, 34)[0] < 128);
  assert.ok(rgba(90, 2)[1] > 128);
  assert.ok(rgba(90, 65)[1] < 128);
  assert.ok(roundedDistance(90, 34, width, height, 22) < -15);
});

test('the same material has explicit Safari fallback and Chromium refraction', () => {
  const fake = (ua, support) => ({
    navigator: { userAgent: ua },
    CSS: { supports: () => support },
    ResizeObserver: class {}
  });
  assert.equal(canRefract(fake('Chrome/131.0.0.0', true)), true);
  assert.equal(canRefract(fake('Edg/131.0', true)), true);
  assert.equal(canRefract(fake('Safari/605.1.15', true)), false);
  assert.equal(canRefract(fake('CriOS/131.0', true)), false);
  assert.equal(canRefract(fake('Chrome/131.0', false)), false);
  assert.match(source, /feDisplacementMap/);
  assert.match(material, /lg-surface\.lg-optical/);
  assert.match(material, /blur\(var\(--lg-blur\)\)/);
});

test('Reader and mobile navigation are registered in the one engine', () => {
  const selectors = PRESETS.map((p) => p.selector).join(' ');
  for (const s of ['#readerApp #topbar', '#readerApp #controls', '#mobileBottomNav.liquidGlassNav', '.liquidGlassSelection', '#mobileUtilityMenu', '#statutesLawMenu']) {
    assert.ok(selectors.includes(s), s);
  }
  assert.match(reader, /<section id="viewer" aria-label="ページ表示"><div id="pageStage"><\/div><\/section>/);
  assert.doesNotMatch(source, /drawImage\(|html2canvas|\.readerPageImage/);
});
