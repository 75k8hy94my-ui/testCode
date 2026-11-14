import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PRESETS, createMaterialEngine } = require('../liquid-glass-engine.js');
const source = fs.readFileSync(new URL('../liquid-glass-engine.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../liquid-glass.css', import.meta.url), 'utf8');

test('every standalone page loads the same material CSS and engine exactly once', () => {
  const root = new URL('..', import.meta.url);
  const files = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
  assert.ok(files.length >= 19);
  for (const path of [...files, 'game/index.html']) {
    const html = fs.readFileSync(new URL(path, root), 'utf8');
    assert.equal((html.match(/liquid-glass\.css\?v=20261114-shared-material/g) || []).length, 1, path);
    assert.equal((html.match(/liquid-glass-engine\.js\?v=20261114-shared-material/g) || []).length, 1, path);
  }
});

test('the previous Reader-specific filter is retired, with one source of material truth', () => {
  assert.equal(fs.existsSync(new URL('../reader-liquid-glass.js', import.meta.url)), false);
  const layout = fs.readFileSync(new URL('../reader-liquid-glass.css', import.meta.url), 'utf8');
  assert.doesNotMatch(layout, /backdrop-filter|feDisplacementMap/);
  assert.match(css, /\.lg-surface\.lg-optical/);
  assert.match(source, /feDisplacementMap/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /function register\(selector, options = \{\}\)/);
});

test('shared selectors cover both desktop and mobile existing glass surfaces', () => {
  const selectors = PRESETS.map((x) => x.selector).join(' ');
  for (const name of [
    '#readerApp #topbar', '#readerApp #controls', '#readerApp .ctrlBtn',
    '#mobileBottomNav.liquidGlassNav', '.liquidGlassSelection', '#mobileUtilityMenu',
    '#appGlobalHeader.globalAppHeader', '#mangaListSection .bookshelf-pagination',
    '#statutesLawMenu', '#accountMenu', '.vl-round', '.glassBtn', '#gameShell .ios-dock'
  ]) assert.ok(selectors.includes(name), name);
  assert.match(source, /\[data-liquid-glass\]/);
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('Safari fallback registers and disposes a dynamically shared button cleanly', () => {
  const classes = new Set();
  const node = {
    isConnected: true,
    classList: { add(...values) { values.forEach((v) => classes.add(v)); }, remove(...values) { values.forEach((v) => classes.delete(v)); } },
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    addEventListener() {},
    removeEventListener() {}
  };
  const doc = {
    documentElement: {},
    querySelectorAll: (selector) => selector === '.glass, .glassBtn' ? [node] : [],
  };
  const win = {
    navigator: { userAgent: 'Safari/605.1.15' },
    CSS: { supports: () => true },
    MutationObserver: class { observe() {} disconnect() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: (fn) => fn(),
    addEventListener() {}
  };
  const engine = createMaterialEngine(doc, win);
  assert.ok(classes.has('lg-surface'));
  assert.equal(node.dataset.lgMaterial, 'button');
  assert.equal(typeof engine.register, 'function');
  engine.destroy();
  assert.equal(classes.has('lg-surface'), false);
  assert.equal('lgMaterial' in node.dataset, false);
});
