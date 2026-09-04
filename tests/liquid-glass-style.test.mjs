import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const files = {
  'hyakusen.html': read('hyakusen.html'),
  'home.html': read('home.html'),
  'index-search.html': read('index-search.html'),
};

for (const [name, html] of Object.entries(files)) {
  test(`${name} defines theme-aware Liquid Glass optical tokens`, () => {
    assert.match(html, /--glass-highlight:/, `${name} should define a specular highlight token`);
    assert.match(html, /--glass-edge:/, `${name} should define a lower-edge/refraction token`);
    assert.match(html, /--glass-shadow-deep:/, `${name} should define a deep floating shadow token`);
    assert.match(html, /--glass-shadow-soft:/, `${name} should define a near-contact shadow token`);
    assert.match(html, /html\[data-theme="(?:light|dark)"\][^{]*\{[^}]*--glass-highlight:/s, `${name} should retune the highlight for the opposite theme`);
  });
}

test('hyakusen glass surfaces use layered refraction, specular edges and physical depth', () => {
  const html = files['hyakusen.html'];
  assert.match(html, /\.glass,\.glassBtn,\.hyakusenRow\s*\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--panel\)/s);
  assert.match(html, /\.glass,\.glassBtn,\.hyakusenRow\s*\{[^}]*box-shadow:[^;]*inset 0 1px 1px 0 var\(--glass-highlight\)[^;]*inset 0 -1px 0 var\(--glass-edge\)[^;]*var\(--glass-shadow-deep\)[^;]*var\(--glass-shadow-soft\)/s);
  assert.match(html, /backdrop-filter:\s*blur\([^)]*\)\s+saturate\([^)]*\)\s+contrast\([^)]*\)/);
});

test('home glass buttons and add panel share the layered material', () => {
  const html = files['home.html'];
  assert.match(html, /\.glassBtn\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
  assert.match(html, /\.addPanel\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
  assert.match(html, /\.glassBtn\{[^}]*box-shadow:[^;]*inset 0 1px 1px 0 var\(--glass-highlight\)[^;]*var\(--glass-shadow-deep\)/s);
});

test('index search glass controls, sticky search surface and filter menu share the optical model', () => {
  const html = files['index-search.html'];
  assert.match(html, /\.glassBtn,\.tabBtn\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
  assert.match(html, /\.searchCard\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
  assert.match(html, /\.filterMenu\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
});
