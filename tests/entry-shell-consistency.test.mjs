import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

function spaSource(html) {
  const match = html.match(/<script[^>]+src=["']([^"']*home-profile-spa\.js[^"']*)["']/i);
  assert.ok(match, 'entry page must load home-profile-spa.js');
  return match[1];
}

test('manga and video entry shells use the same versioned SPA bootstrap', () => {
  const mangaSource = spaSource(read('manga.html'));
  const videoSource = spaSource(read('video.html'));
  assert.equal(mangaSource, videoSource);
  assert.match(mangaSource, /home-profile-spa\.js\?v=20260922-spa-route-runtime$/);
});
