import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('judicial exam study page uses query history routing', () => {
  const source = read('study.html');
  for (const view of ['subjects', 'arguments', 'past-questions', 'review', 'progress']) {
    assert.match(source, new RegExp(`['\\"]${view}['\\"]`));
  }
  assert.match(source, /searchParams\.get\(['"]view['"]\)/);
  assert.match(source, /searchParams\.set\(['"]view['"],\s*normalized\)/);
  assert.match(source, /history\.pushState\(/);
  assert.match(source, /history\.replaceState\(/);
  assert.match(source, /addEventListener\(['"]popstate['"]/);
  assert.doesNotMatch(source, /<dialog\b/i);
});

test('judicial exam study dock matches reader Liquid Glass behavior', () => {
  const source = read('study.html');
  for (const id of ['studyNavHome', 'studyNavSubjects', 'studyNavArguments', 'studyNavPastQuestions', 'studyNavReview']) {
    assert.match(source, new RegExp(`id=['\\"]${id}['\\"]`));
  }
  assert.match(source, /id=['"]studyBottomNav['"]/);
  assert.match(source, /id=['"]liquidRefraction['"]/);
  assert.match(source, /--glass-light-x/);
  assert.match(source, /--glass-light-y/);
  assert.match(source, /pointermove[\s\S]*updateGlassLight/);
  assert.match(source, /pointerdown[\s\S]*glass-pressed/);
  assert.match(source, /#studyBottomNav::before/);
  assert.match(source, /#studyBottomNav::after/);
  assert.match(source, /backdrop-filter:\s*blur\(38px\)\s+saturate\(180%\)\s+contrast\(106%\)/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /aria-current/);
});

test('judicial exam study page reuses the reader authentication guard', () => {
  const source = read('study.html');
  assert.match(source, /class=['"]auth-pending['"]/);
  assert.match(source, /supabase-config\.js/);
  assert.match(source, /vault-session\.js/);
  assert.match(source, /mangaReaderSupabaseSession/);
  assert.match(source, /MangaVault\.loadActive\(\)/);
  assert.match(source, /window\.location\.replace\(['"]sync\.html['"]\)/);
  assert.match(source, /window\.location\.replace\(['"]index\.html['"]\)/);
});

test('reader exposes the judicial exam study area through its loaded chrome helper', () => {
  const source = read('feature-flags.js');
  assert.match(source, /id\s*=\s*['"]mobileNavStudy['"]/);
  assert.match(source, /司法試験学習/);
  assert.match(source, /window\.location\.href\s*=\s*['"]study\.html['"]/);
});

test('study page provides Liquid Glass and a no-backdrop fallback', () => {
  const source = read('study.html');
  assert.match(source, /backdrop-filter/);
  assert.match(source, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
});

test('study page inline JavaScript parses and is covered by the static verifier', () => {
  const source = read('study.html');
  for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    new vm.Script(match[1], { filename: 'study.html:inline' });
  }
  assert.match(read('scripts/check-static.mjs'), /['"]study\.html['"]/);
});

test('study phase one does not add study-data persistence', () => {
  const source = read('study.html');
  assert.doesNotMatch(source, /indexedDB|mangaReaderStudy|MangaVaultPayload|savePayload\(/);
});
