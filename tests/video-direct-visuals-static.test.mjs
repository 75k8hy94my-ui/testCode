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

test('direct card thumbnail seeks to the persisted thumbnail timestamp before reveal', () => {
  assert.match(source, /effective\.thumbnailTimeSeconds/);
  assert.match(source, /requestedThumbnailTime/);
  assert.match(source, /preview\.currentTime = targetThumbnailTime/);
  assert.match(source, /fallback\.hidden = true/);
});

test('blocked or failed video embeds provide an external-playback fallback', () => {
  assert.match(source, /function externalOpenLink/);
  assert.match(source, /rel = 'noopener noreferrer'/);
  assert.match(source, /appendExternalOpenShortcut\(player, classified\.url\)/);
  assert.match(source, /appendExternalOpenShortcut\(player, url\)/);
  assert.match(source, /video\.addEventListener\('error'/);
  assert.match(source, /appendFallback\(player, classified\.url/);
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

test('ordinary video page URLs are tried as site iframes before external fallback', () => {
  assert.match(source, /classified\.kind === 'link'/);
  assert.match(source, /configureSiteIframe/);
  assert.match(source, /iframe\.dataset\.siteEmbed = '1'/);
  assert.match(source, /appendExternalOpenShortcut\(player, classified\.url\)/);
});
