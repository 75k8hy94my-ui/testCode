import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('video-shorts.html');
const page = read('video-shorts-page.js');

test('Shorts is a separate standalone route with protected dependencies in order', () => {
  assert.match(html, /id="videoShortsPage"/);
  assert.ok(html.indexOf('vault-payload.js') < html.indexOf('video-shorts-state.js'));
  assert.ok(html.indexOf('video-shorts-queue.js') < html.indexOf('video-shorts-page.js'));
  assert.doesNotMatch(html, /manga\.html|reader\.html|<iframe/);
  assert.match(page, /MangaReaderVideoShortsQueue/);
  assert.match(page, /MangaReaderVideoShortsState/);
});

test('Shorts route does not render a title or queue counter', () => {
  assert.doesNotMatch(html + page, /縦スワイプ\s*\d+\s*\/|shortsCounter|videoTitle|videoDetails/);
});

test('route checks VPN state before protected local-storage reads and clears media on access loss', () => {
  const canRead = page.indexOf('canReadProtectedData()');
  const reads = page.indexOf('function readProtectedData()');
  assert.ok(canRead >= 0 && reads > canRead);
  assert.match(page, /manga-reader-vpn-status/);
  assert.match(page, /function disposeProtectedState\(/);
  assert.match(page, /removeAttribute\('src'\)/);
  assert.match(page, /protectedState\s*=\s*null/);
});

test('new videos invalidate saved ordering and storage event regenerates after metadata is probed', () => {
  assert.match(page, /observeVideos\(/);
  assert.match(page, /storage/);
  assert.match(page, /probeMetadata/);
  assert.match(page, /Queue\.generate/);
});

test('library adds a Shorts action beside add and the page uses only direct-linked videos', () => {
  assert.match(read('video-library.js'), /videoLibraryShorts/);
  assert.match(read('video-library.js'), /video-shorts\.html/);
  assert.match(page, /isDirectVideoUrl/);
});

test('double-tap hands the active id and absolute time to the ordinary player', () => {
  assert.match(page, /video-player\.html\?id=/);
  assert.match(page, /start=/);
  assert.match(read('video-player-page.js'), /new URLSearchParams\(location\.search\)\.get\('start'\)/);
  assert.match(read('video-player-page.js'), /video\.currentTime\s*=\s*Math\.min\(startTime/);
});
