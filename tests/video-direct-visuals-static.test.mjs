import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../video-routing-fix.js', import.meta.url), 'utf8');

test('direct video cards generate an automatic video-frame thumbnail when no manual thumbnail is set', () => {
  assert.match(source, /vl-thumb-direct-video/);
  assert.match(source, /thumbnailUrl/);
  assert.match(source, /muted\s*=\s*true/);
  assert.match(source, /preload\s*=\s*'auto'/);
  assert.match(source, /position:absolute;inset:0/);
  assert.match(source, /data-frame-ready/);
  assert.match(source, /addEventListener\('seeked'/);
});

test('direct video thumbnail adopts the media native aspect ratio', () => {
  assert.match(source, /videoWidth/);
  assert.match(source, /videoHeight/);
  assert.match(source, /thumb\.style\.aspectRatio/);
});

test('direct inline player adopts the media native aspect ratio after metadata loads', () => {
  assert.match(source, /player\.style\.aspectRatio/);
  assert.match(source, /loadedmetadata/);
  assert.match(source, /video\.videoWidth/);
  assert.match(source, /video\.videoHeight/);
});

test('direct inline player provides a large-display toggle and blocks context-menu saving', () => {
  assert.match(source, /大きく表示/);
  assert.match(source, /vl-large-player/);
  assert.match(source, /contextmenu/);
});

test('direct card thumbnail seeks to the persisted thumbnail timestamp before reveal', () => {
  assert.match(source, /effective\.thumbnailTimeSeconds/);
  assert.match(source, /requestedThumbnailTime/);
  assert.match(source, /preview\.currentTime = targetThumbnailTime/);
  assert.match(source, /fallback\.hidden = true/);
});

test('blocked or failed video embeds keep external playback only in the fallback UI', () => {
  assert.match(source, /function externalOpenLink/);
  assert.match(source, /rel = 'noopener noreferrer'/);
  assert.match(source, /video\.addEventListener\('error'/);
  assert.match(source, /appendFallback\(player, classified\.url/);
  assert.doesNotMatch(source, /appendExternalOpenShortcut/);
  assert.doesNotMatch(source, /vl-inline-external/);
});

test('embed restrictions fall back to a normal site iframe or external page', () => {
  assert.match(source, /X-Frame-Options\/frame-ancestors failures/);
  assert.match(source, /explicit in-place retry using the original site URL/);
  assert.match(source, /外部で開く/);
});

test('legacy video embeds can retry by embedding the ordinary site page', () => {
  assert.match(source, /function appendSiteEmbedToggle/);
  assert.match(source, /サイト表示を試す/);
  assert.match(source, /動画埋め込みに戻す/);
  assert.match(source, /iframe\.src = showingSite \? videoEmbedUrl : siteUrl/);
  assert.match(source, /appendSiteEmbedToggle\(player, iframe, url, videoEmbedUrl\)/);
});

test('ordinary video page URLs are tried as site iframes without overlaying an external button', () => {
  assert.match(source, /classified\.kind === 'link'/);
  assert.match(source, /configureSiteIframe/);
  assert.match(source, /iframe\.dataset\.siteEmbed = '1'/);
  assert.doesNotMatch(source, /appendExternalOpenShortcut\(player, classified\.url\)/);
});

test('inline playback does not overlay custom close or external-open controls on the provider player', () => {
  assert.doesNotMatch(source, /vl-inline-close/);
  assert.doesNotMatch(source, /className = 'vl-inline-external'/);
  assert.doesNotMatch(source, /aria-label', '再生を閉じる'/);
});

test('clicking the active card body again closes inline playback without an overlay button', () => {
  assert.match(source, /activeVideoId === videoId[\s\S]*closeActivePlayer\(\);[\s\S]*return;/);
});
