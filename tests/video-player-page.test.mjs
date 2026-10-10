import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../video-player-page.js', import.meta.url), 'utf8');
const controls = fs.readFileSync(new URL('../video-player-controls.js', import.meta.url), 'utf8');

test('video player page uses the normalized saved title and renders marker list', () => {
  assert.match(page, /document\.title\s*=\s*title/);
  assert.match(page, /videoMarkerList/);
  assert.match(page, /videoMarker/);
});

test('related videos use normalized thumbnail metadata and the shared renderer', () => {
  assert.match(page, /itemVideo/);
  assert.match(page, /MangaReaderVideoThumbnailRenderer\.render\(thumb, itemVideo/);
  assert.match(fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8'), /video-thumbnail-renderer\.js/);
});

test('video player waits for protected-data access before reading records or rendering metadata', () => {
  const accessCheck = page.indexOf('function canReadProtectedData()');
  const initialize = page.indexOf('function initializePlayer()');
  assert.ok(accessCheck >= 0 && initialize > accessCheck);
  assert.ok(page.indexOf('const baseVideos = read(VIDEO_KEY, [])') > initialize);
  assert.match(page, /manga-reader-vpn-status/);
  assert.match(page, /function disposePlayer\(\)/);
  assert.match(page, /page\.replaceChildren\(\)/);
  assert.match(controls, /manga-reader-vpn-status/);
  assert.match(controls, /function initializeControls\(\)/);
  assert.match(controls, /canReadProtectedData\(\)/);
});

test('video player edit action navigates to the dedicated editor instead of opening a dialog', () => {
  assert.match(page, /const edit = document\.createElement\('a'\)/);
  assert.match(page, /edit\.href = 'video-edit\.html\?id=' \+ encodeURIComponent\(id\) \+ '&return=player'/);
  assert.doesNotMatch(page, /videoEditDialog|videoEditPanel|openEditor|aria-haspopup/);
  assert.doesNotMatch(page, /document\.body\.append\(dialog\)/);

  const editorHtml = fs.readFileSync(new URL('../video-edit.html', import.meta.url), 'utf8');
  const editor = fs.readFileSync(new URL('../video-edit-page.js', import.meta.url), 'utf8');
  assert.match(editorHtml, /id="videoEditPage"/);
  assert.match(editorHtml, /video-edit-page\.js/);
  for (const field of ['name="title"', 'name="folder"', 'name="status"', 'name="tags"', 'name="memo"', 'name="favorite"', 'name="rotate"']) {
    assert.ok(editor.includes(field), field);
  }
  assert.match(editor, /MangaVault\.markLocalChangesPending\(\)/);
  assert.doesNotMatch(editor, /await window\.MangaVault\.saveLocalChanges\(\)/);
  assert.match(editor, /location\.href = returnTarget\(returnKind, savedId\)/);
  assert.match(editor, /if \(kind === 'player'\) return 'video-player\.html\?id='/);
});

test('dedicated video editor renders its loading and VPN gate instead of leaving the body hidden', () => {
  const html = fs.readFileSync(new URL('../video-edit.html', import.meta.url), 'utf8');
  const editor = fs.readFileSync(new URL('../video-edit-page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<html[^>]*\bauth-pending\b/);
  assert.match(html, /<main id="videoEditPage"/);
  assert.match(html, /video-edit-page\.js/);
  assert.match(editor, /function handleAccess\(\)/);
  assert.match(editor, /if \(canReadProtectedData\(\)\) initialize\(\)/);
  assert.match(editor, /page\.replaceChildren\(heading, lead, form\)/);
});

test('watch page applies and cleans up the saved rotation direction for direct video', () => {
  assert.match(page, /MangaReaderVideoRotation\.install\(frame, video, normalized\.rotate90Direction/);
  assert.match(page, /windowCleanups\.push\(cleanupRotation\)/);
  const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('video-player-rotation.js') < html.indexOf('video-player-page.js'));
  assert.match(fs.readFileSync(new URL('../home-profile-shell.css', import.meta.url), 'utf8'), /videoPlayerFrame video\.videoPlayerRotatedLeft/);
});

test('video title edits in place and player details follow the video in a watch-page layout', () => {
  assert.match(page, /heading\.contentEditable\s*=\s*['"]true['"]/);
  assert.match(page, /heading\.addEventListener\(['"]keydown['"]/);
  assert.match(page, /saveTitle/);
  assert.match(page, /main\.append\(frame, heading, info, actionBar, description, markerList, back\)/);
  assert.match(page, /videoPlayerActionBar/);
  assert.match(fs.readFileSync(new URL('../home-profile-shell.css', import.meta.url), 'utf8'), /\.videoPlayerActionBar/);
});

test('custom player defers single taps and maps double-tap zones to seek or fullscreen', () => {
  assert.match(controls, /Gestures\.create\(/);
  assert.match(controls, /onSingleTap: \(\) => \{ video\.paused \? video\.play\(\) : video\.pause\(\); \}/);
  assert.match(controls, /Gestures\.actionAt\(event\.clientX, video\.getBoundingClientRect\(\)\)/);
  assert.match(controls, /else toggleFullscreen\(\)/);
  assert.match(controls, /gestureController\.destroy\(\)/);
  const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('video-player-gestures.js') < html.indexOf('video-player-controls.js'));
});

test('video player document cache keys identify the current watch-page design', () => {
  const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
  assert.match(html, /home-profile-shell\\.css\\?v=20261010-related-video-scroll/);
  assert.match(html, /video-player-page\.js\?v=20261010-local-first-save/);
});

test('desktop watch page keeps related videos in an independently scrolling viewport', () => {
  const css = fs.readFileSync(new URL('../home-profile-shell.css', import.meta.url), 'utf8');
  assert.match(css, /@media\s*\(min-width:\s*901px\)[\s\S]*?\.videoRelated\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*[^)]+\)[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.videoRelated\s*\{[^}]*position:\s*sticky[^}]*align-self:\s*start/s);
});

test('player saves title locally first, resumes pending sync in background, and warns before leaving', () => {
  assert.match(page, /function hasPendingLocalSync\(\)/);
  assert.match(page, /resumePendingLocalSync\(\)/);
  assert.match(page, /syncRequestedWhileRunning/);
  assert.match(page, /guardPendingSyncLeave\(event, syncRunning\)/);
  assert.match(page, /listenWindow\('online',/);
  assert.match(page, /else resumePendingLocalSync\(\)/);
  assert.match(page, /videoPlayerSyncStatus/);
  assert.match(page, /markLocalChangesPending\(\)/);
  assert.doesNotMatch(page, /await window\.MangaVault\.saveLocalChanges\(\)/);
});

test('marker registration defaults to the current playback position', () => {
  assert.match(controls, /video\.currentTime/);
  assert.match(controls, /secondsInput\.value/);
  assert.match(controls, /currentTime/);
});

test('saved markers are rendered as seekable rows on the player page', () => {
  assert.match(page, /mangaReaderVideoMarkers/);
  assert.match(page, /currentTime\s*=\s*marker\.seconds/);
  assert.match(page, /videoMarkerList/);
});

