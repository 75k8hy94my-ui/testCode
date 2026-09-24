import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

function spaSource(html) {
  const match = html.match(/<script[^>]+src=["']([^"']*home-profile-spa\.js[^"']*)["']/i);
  assert.ok(match, 'entry page must load home-profile-spa.js');
  return match[1];
}

function scriptSources(html) {
  return [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]);
}

test('manga and video entry shells use the same versioned SPA bootstrap', () => {
  const manga = read('manga.html');
  const video = read('video.html');
  const mangaSource = spaSource(manga);
  const videoSource = spaSource(video);
  assert.equal(mangaSource, videoSource);
  assert.match(mangaSource, /home-profile-spa\.js\?v=20260924-liquid-glass-nav$/);
  const videoScripts = scriptSources(video);
  for (const dependency of ['backup-format.js?v=20260822-backup-scope-fix']) {
    assert.ok(videoScripts.includes(dependency), `video entry must load ${dependency}`);
  }
});

test('all home-family entry pages use the current shared SPA bootstrap', () => {
  const pages = ['home.html', 'profile.html', 'manga.html', 'video.html'];
  const expected = 'home-profile-spa.js?v=20260924-liquid-glass-nav';
  for (const page of pages) assert.equal(spaSource(read(page)), expected, `${page} must use the current shared SPA bootstrap`);
});
