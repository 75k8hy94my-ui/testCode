import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const page = read('video-shorts-page.js');
const html = read('video-shorts.html');
const css = read('video-shorts-player.css');
const asset = fs.readFileSync(new URL('../assets/shorts-heart.png', import.meta.url));

test('like control uses only the generated heart image with white and pale-red states', () => {
  assert.match(page, /assets\/shorts-heart\.png/);
  assert.match(page, /aria-pressed/);
  assert.match(page, /shortsLike/);
  assert.match(css, /filter:[^;}]*#f2a7b4|filter:[^;}]*sepia/);
  assert.equal(asset.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('play count increments on entry start and early-swipe count remains separate from ordinary open count', () => {
  assert.match(page, /recordShortsPlay/);
  assert.match(page, /playCount\s*\+\s*1/);
  assert.match(page, /earlySwipeCount\s*\+\s*1/);
  assert.doesNotMatch(page, /openCount\s*\+\s*1/);
});

test('seek bar stays thin and neutral; scrubbing preview follows source aspect and shows time below', () => {
  assert.match(css, /shortsScrubTrack[^}]*height:\s*3px/);
  assert.match(css, /shortsScrubPreviewFrame[^}]*aspect-ratio:\s*var\(--preview-ratio/);
  assert.match(css, /shortsScrubTime/);
  assert.doesNotMatch(css, /shortsScrubArea:active[^}]*height:/);
  assert.match(page, /\+\s*'\s*\/\s*'\s*\+\s*formatTime/);
});

test('landscape rotation is mobile-only, width adjusts for landscape, and resets when a clip ends', () => {
  assert.match(page, /shortsRotate/);
  assert.match(page, /resetLandscapeRotation/);
  assert.match(css, /\.shortsStage\.is-rotated/);
  assert.match(css, /@media\s*\(max-width:\s*899px\)/);
  assert.match(css, /@media\s*\(min-width:\s*900px\)[\s\S]*\.shortsStage\.is-landscape/);
});

test('Shorts includes configured source rotation for the clip and scrub preview', () => {
  assert.match(html, /video-player-rotation\.js/);
  assert.match(page, /getDisplayDimensions/);
  assert.match(page, /getRotationDirection/);
  assert.match(css, /shortsStage video\.videoPlayerRotatedLeft/);
  assert.match(css, /shortsScrubPreviewFrame video\.videoPlayerRotatedRight/);
});

test('shorts gestures suppress native selection and long-press callouts across the stage and video', () => {
  assert.match(css, /\.shortsStage\s*\{[^}]*touch-action:\s*none/);
  assert.match(css, /\.shortsStage\s*,\s*\.shortsStage\s*\*\s*\{[^}]*-webkit-user-select:\s*none/);
  assert.match(css, /\.shortsStage\s*,\s*\.shortsStage\s*\*\s*\{[^}]*user-select:\s*none/);
  assert.match(css, /\.shortsStage\s*,\s*\.shortsStage\s*\*\s*\{[^}]*-webkit-touch-callout:\s*none/);
  assert.match(css, /\.shortsStage\s*,\s*\.shortsStage\s*\*\s*\{[^}]*-webkit-user-drag:\s*none/);
  assert.match(page, /stage\.addEventListener\('contextmenu',[^;]*preventDefault/);
});

test('mobile Shorts layout reserves the app header, bottom navigation, and iPhone safe areas', () => {
  assert.match(css, /viewport-fit=cover|env\(safe-area-inset-bottom/);
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /100dvh\s*-\s*64px\s*-\s*82px/);
  assert.match(css, /is-shorts-rotated #mobileBottomNav/);
});
