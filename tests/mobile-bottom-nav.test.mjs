import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const js = read('mobile-bottom-nav.js');
const css = read('mobile-bottom-nav.css');

test('SPA Liquid Glass nav has four icon-and-label destinations', () => {
  for (const [id, href, label] of [
    ['mobileNavHome','home.html','ホーム'],
    ['mobileNavManga','manga.html','漫画'],
    ['mobileNavVideo','video.html','動画'],
    ['mobileNavProfile','profile.html','プロフィール'],
  ]) {
    assert.ok(js.includes(id), id);
    assert.ok(js.includes(href), href);
    assert.ok(js.includes(label), label);
  }
  assert.match(js, /mobileNavGlyph/);
  assert.match(js, /liquidGlassNavLabel/);
});

test('one movable lens represents the active tab', () => {
  assert.match(js, /createLens\(\)/);
  assert.match(js, /liquidGlassSelection/);
  assert.match(js, /lens\.animate\(/);
  assert.match(js, /state\.lensMetrics/);
  assert.match(js, /cubic-bezier\(\.22,\.86,\.36,1\)/);
  assert.match(css, /\.liquidGlassSelection\{/);
  assert.match(css, /will-change:transform,width/);
});

test('glass responds to touch position, press, scrolling, and accessibility preferences', () => {
  assert.match(js, /pointermove/);
  assert.match(js, /pointerdown/);
  assert.match(js, /requestAnimationFrame/);
  assert.match(js, /--glass-light-x/);
  assert.match(js, /liquidPressed/);
  assert.match(js, /liquidNavCompact/);
  assert.match(js, /document\.addEventListener\('scroll'/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /prefers-reduced-transparency:reduce/);
  assert.match(css, /@supports not \(\(backdrop-filter:blur\(1px\)\)/);
});

test('glass is theme-aware, safe-area-aware, and constrained on phones', () => {
  assert.match(css, /width:min\(360px,calc\(100vw - 32px\)\)/);
  assert.match(css, /bottom:max\(10px,env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /html\[data-theme="light"\] #mobileBottomNav\.liquidGlassNav/);
  assert.match(css, /--glass-fill:/);
  assert.match(css, /blur\\(34px\\) saturate\\(180%\\) contrast\\(106%\\)/);
  assert.match(css, /inset 0 1px 0 var\(--glass-highlight\)/);
});

test('reader keeps its special controls while using the shared glass engine', () => {
  const reader = read('reader.html');
  const template = read('reader-mobile-nav-template.js');
  assert.match(template, /mobileNavManga/);
  assert.match(template, /mobileNavVideo/);
  assert.match(template, /mobileNavMore/);
  assert.ok(reader.indexOf('reader-mobile-nav-template.js') < reader.indexOf('mobile-bottom-nav.js?v=20260924-liquid-glass-nav-edge'));
  assert.match(js, /readerFallbackTarget/);
  assert.match(js, /nav\.classList\.contains\('reader-mode'\)/);
  assert.match(js, /querySelector\('#mobileNavMore'\)/);
});

test('shared nav is loaded by all target mobile pages', () => {
  for (const page of ['home.html','profile.html','manga.html','video.html','reader.html','video-player.html']) {
    const source = read(page);
    assert.match(source, /mobile-bottom-nav\.css\?v=20260924-liquid-glass-nav-edge/, page);
    assert.match(source, /mobile-bottom-nav\.js\?v=20260924-liquid-glass-nav-edge/, page);
  }
});

test('light glass stays translucent instead of becoming a white card', () => {
  assert.match(css, /--glass-fill:rgba\\(244,247,251,.30\\)/);
  assert.match(css, /--glass-lens:rgba\\(238,244,251,.085\\)/);
  assert.match(css, /--glass-lens-edge:rgba\\(255,255,255,.56\\)/);
  assert.match(css, /blur\\(10px\\) saturate\\(165%\\) brightness\\(1.035\\)/);
  assert.match(css, /Light glass optical tuning/);
});

test('selected lens is edge-driven rather than white-filled', () => {
  assert.match(css, /--glass-lens:rgba\\(229,238,248,.055\\)/);
  assert.match(css, /\.liquidGlassSelection::before/);
  assert.match(css, /\.liquidGlassSelection::after/);
  assert.match(css, /bottom:2px/);
  assert.match(css, /rgba\(93,108,130,.16\)/);
});

test('clear glass remains legible on a flat light background', () => {
  assert.match(css, /Edge-defined clear glass/);
  assert.match(css, /inset 0 1\.4px 0 rgba\(255,255,255,.92\)/);
  assert.match(css, /inset 0 -1\.4px 0 rgba\(91,103,120,.16\)/);
  assert.match(css, /inset 0 1\.5px 0 rgba\(255,255,255,.94\)/);
  assert.match(css, /inset 0 -1\.5px 0 rgba\(83,96,114,.18\)/);
  assert.match(css, /rgba\(102,124,151,.20\)/);
});
