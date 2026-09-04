import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cssUrl = new URL('../liquid-glass.css', import.meta.url);
const cssExists = fs.existsSync(cssUrl);
const css = cssExists ? fs.readFileSync(cssUrl, 'utf8') : '';
const rail = fs.readFileSync(new URL('../app-desktop-rail.js', import.meta.url), 'utf8');

test('shared Liquid Glass stylesheet exists and is loaded by the common desktop bootstrap', () => {
  assert.equal(cssExists, true, 'liquid-glass.css should exist');
  assert.match(rail, /liquid-glass\.css/);
  assert.match(rail, /appLiquidGlassStyles/);
});

test('shared optical tokens are theme-aware for Hyakusen, Home and Index Search', () => {
  assert.match(css, /\.shell\s*\{[^}]*--glass-highlight:[^}]*--glass-edge:[^}]*--glass-shadow-deep:[^}]*--glass-shadow-soft:/s);
  assert.match(css, /html\[data-theme="light"\]\s+\.shell\s*\{[^}]*--glass-highlight:/s);
  assert.match(css, /\.homeShell,\s*\.indexShell\s*\{[^}]*--glass-highlight:[^}]*--glass-edge:[^}]*--glass-shadow-deep:[^}]*--glass-shadow-soft:/s);
  assert.match(css, /html\[data-theme="dark"\]\s+\.homeShell,[^}]*html\[data-theme="dark"\]\s+\.indexShell\s*\{[^}]*--glass-highlight:/s);
});

test('Hyakusen surfaces use layered refraction, specular edges and physical depth', () => {
  assert.match(css, /\.shell\s+\.glass,\s*\.shell\s+\.glassBtn,\s*\.shell\s+\.hyakusenRow\s*\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
  assert.match(css, /\.shell\s+\.glass,\s*\.shell\s+\.glassBtn,\s*\.shell\s+\.hyakusenRow\s*\{[^}]*box-shadow:[^;]*inset 0 1px 1px 0 var\(--glass-highlight\)[^;]*inset 0 -1px 0 var\(--glass-edge\)[^;]*var\(--glass-shadow-deep\)[^;]*var\(--glass-shadow-soft\)/s);
  assert.match(css, /backdrop-filter:\s*blur\([^)]*\)\s+saturate\([^)]*\)\s+contrast\([^)]*\)/);
});

test('Home glass controls and panels share the layered material', () => {
  assert.match(css, /\.homeShell\s+\.glassBtn\s*\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
  assert.match(css, /\.homeShell\s+\.addPanel,\s*\.homeShell\s+\.homeCard\s*\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
  assert.match(css, /\.homeShell\s+\.glassBtn\s*\{[^}]*box-shadow:[^;]*inset 0 1px 1px 0 var\(--glass-highlight\)[^;]*var\(--glass-shadow-deep\)/s);
});

test('Index Search controls, sticky search surface and filter menu share the optical model', () => {
  assert.match(css, /\.indexShell\s+\.glassBtn,\s*\.indexShell\s+\.tabBtn\s*\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
  assert.match(css, /\.indexShell\s+\.searchCard\s*\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
  assert.match(css, /\.indexShell\s+\.filterMenu\s*\{[^}]*background:\s*radial-gradient\([^;]+linear-gradient\(135deg,[^;]+var\(--glass-base\)/s);
});
