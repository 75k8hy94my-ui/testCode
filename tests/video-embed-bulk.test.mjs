import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import data from '../video-data.js';

const edit = fs.readFileSync(new URL('../video-edit-page.js', import.meta.url), 'utf8');
const player = fs.readFileSync(new URL('../video-player-page.js', import.meta.url), 'utf8');
const library = fs.readFileSync(new URL('../video-library.js', import.meta.url), 'utf8');
const routing = fs.readFileSync(new URL('../video-routing-fix.js', import.meta.url), 'utf8');

test('embed option survives canonical video normalization', () => {
  const enabled = data.normalizeVideo({ id: 'a', url: 'https://example.org/watch', embedPage: true });
  assert.equal(enabled.embedPage, true);
  assert.equal(data.normalizeVideo({ id: 'b', url: 'https://example.org/watch' }).embedPage, false);
});

test('editor exposes per-video embedding and bulk shared setting', () => {
  assert.match(edit, /name="embedPage"/);
  assert.match(edit, /data-bulk-embed/);
  assert.match(edit, /data-bulk-urls/);
  assert.match(edit, /async function importUrls/);
  assert.match(edit, /embedPage: embedPage && !Data\.isDirectVideoUrl\(url\)/);
  assert.match(edit, /!!elements\.embedPage\.checked/);
  assert.match(fs.readFileSync(new URL('../video-library-view.js', import.meta.url), 'utf8'), /videoLibraryEmbedPage/);
});

test('player only embeds external pages when the user explicitly opted in', () => {
  assert.match(player, /normalized\.embedPage === true/);
  assert.match(player, /classifyVideoUrl\(sourceUrl\)\.kind !== 'direct'/);
  assert.match(player, /iframe\.setAttribute\('sandbox'/);
  assert.match(player, /埋め込み表示できない場合は元ページを開く/);
});

test('embed ON routes bookmark card to internal player instead of source URL', () => {
  // Bookmark routing is presentation behavior; the library still owns navigation state.
  assert.match(fs.readFileSync(new URL('../video-library-view.js', import.meta.url), 'utf8'), /openHref: isBookmark && video\.embedPage !== true \? video\.url : null/);
  assert.match(routing, /embeddedPage = latestMeta && latestMeta\[videoId\]\?\.embedPage === true/);
  assert.match(routing, /card\.classList\.contains\('videoCard--bookmark'\) && !embeddedPage/);
  assert.match(routing, /window\.location\.href = targetUrl\.href/);
});
