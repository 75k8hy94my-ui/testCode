import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL('../'+name, import.meta.url), 'utf8');

test('recommendations bootstrap loads the video enhancement after existing reader code', () => {
  const source = read('recommendations.js');
  assert.match(source, /video-data\.js/);
  assert.match(source, /video-library\.js/);
  assert.match(source, /video-routing-fix\.js/);
  assert.match(source, /DOMContentLoaded/);
});

test('video library provides search filters sorting view modes folders and editor hooks', () => {
  const source = read('video-library.js');
  for (const marker of ['videoLibrarySearch','videoLibraryQuick','videoLibraryFolder','videoLibraryTag','videoLibraryService','videoLibrarySort','videoLibraryView','videoLibrarySheet','videoLibraryFolders']) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /mangaReaderVideoMeta/);
  assert.match(source, /mangaReaderVideoFolders/);
  assert.match(source, /MangaVaultPayload\.buildFromLocalStorage/);
  assert.match(source, /MangaVault\.savePayload/);
  assert.match(source, /videoDeleteBtn/);
  assert.match(source, /history\.pushState/);
});

test('video list ellipsis navigates directly to the dedicated editor without an action popup', () => {
  const library = read('video-library.js');
  const editor = read('video-edit-page.js');
  const editorHtml = read('video-edit.html');
  assert.match(library, /const edit = document\.createElement\('a'\)/);
  assert.match(library, /edit\.href = 'video-edit\.html\?id=' \+ encodeURIComponent\(video\.id\) \+ '&return=list'/);
  assert.match(library, /edit\.setAttribute\('aria-label', '詳細を編集'\)/);
  assert.doesNotMatch(library, /className = 'vl-menu'|className = 'vl-menu-panel'|createMenuButton\(/);
  assert.match(editor, /name="hidden" type="checkbox"/);
  assert.match(editor, /name="status"/);
  assert.match(editor, /data-delete/);
  assert.match(editor, /source\.href = current\.url/);
  assert.match(editor, /remaining = latestVideos\.filter/);
  assert.match(editor, /delete remainingMeta\[videoId\]/);
  assert.match(editor, /MangaVault\.savePayload\(window\.MangaVaultPayload\.buildFromLocalStorage\(\)\)/);
  assert.match(editor, /name="thumbnailTime"/);
  assert.match(editor, /Data\.parseMediaTime\(timestamp\)/);
  assert.match(editorHtml, /video-edit-page\.js\?v=20261009-add-page-contrast/);
  assert.doesNotMatch(editorHtml, /auth-pending/);
  assert.match(read('video-list-route.js'), /video-library\.js\?v=20261009-add-page-contrast/);
});

test('video cards delegate thumbnail rendering to the shared renderer', () => {
  const library = read('video-library.js');
  const route = read('video-list-route.js');
  assert.match(library, /MangaReaderVideoThumbnailRenderer/);
  assert.match(library, /render\(thumb, video/);
  assert.match(route, /video-thumbnail-renderer\.js/);
});

test('video add and edit fields use stronger contrast, spacing, and visible focus treatment', () => {
  const library = read('video-library.js');
  assert.match(library, /\.vl-field\{padding:10px 11px 11px/);
  assert.match(library, /\.vl-field label\{display:block;color:var\(--text\)/);
  assert.match(library, /\.vl-field:focus-within/);
  assert.match(library, /font-size:16px;min-height:46px/);
});

test('enhanced editor presents URL as the only playback locator while legacy fields stay internal', () => {
  const library = read('video-library.js');
  const bridge = read('video-routing-fix.js');
  assert.match(library, /id=["']videoLibraryUrl["']/);
  assert.match(bridge, /videoLibraryLegacyService/);
  assert.match(bridge, /videoLibraryLegacyId/);
  assert.match(bridge, /classifyVideoUrl/);
  assert.match(bridge, /\.remove\(\)/);
  assert.match(bridge, /addEventListener\(['"]submit['"],[\s\S]*true\)/);
});

test('video editor locks URL until the explicit edit button and exposes one-click existing tags', () => {
  const library = read('video-library.js');
  assert.match(library, /videoLibraryUrlEdit/);
  assert.match(library, /readOnly/);
  assert.match(library, /videoLibrarySuggestedTags/);
  assert.match(library, /suggestedTag\.addEventListener\(['"]click['"]/);
});

test('remaining folder sheet keeps explicit close behavior and the URL classifier accepts http URLs', () => {
  const library = read('video-library.js');
  assert.match(library, /dom\.sheet\.addEventListener\(['"]click['"],\s*\(event\)\s*=>\s*\{\s*if \(event\.target === dom\.sheet\) return;/);
  assert.match(library, /Data\.classifyVideoUrl\(rawUrl\)/);
  assert.match(library, /classified\.kind === ['"]invalid['"]/);
  assert.doesNotMatch(library, /sheetClose.*closeSheet/);
  assert.doesNotMatch(library, /invokeLegacyAdd|confirmVideoAddBtn|既存の動画追加機能を利用できません/);
});

test('adding a video navigates to the dedicated form with opaque surfaces', () => {
  const library = read('video-library.js');
  const editor = read('video-edit-page.js');
  const html = read('video-edit.html');
  assert.match(library, /video-edit\.html\?mode=add&return=list/);
  assert.doesNotMatch(library, /dom\.add\.addEventListener\('click', \(\) => openEditor\(null\)/);
  assert.match(library, /#videoLibrarySheet\{--bg-soft:#fff;--panel:#fff/);
  assert.match(library, /html\[data-theme="dark"\] #videoLibrarySheet\{--bg-soft:#10141c/);
  assert.match(html, /\.videoEditForm\{display:grid;gap:13px;padding:20px;[^}]*background:var\(--panel,#fff\)/);
  assert.match(editor, /const isAddMode = new URLSearchParams\(location\.search\)\.get\('mode'\) === 'add'/);
  assert.match(editor, /isAddMode \? \[nextBase, \.\.\.savedVideos\]/);
  assert.match(editor, /if \(!isAddMode\) form\.querySelector\('\[data-delete\]'\)/);
});

test('video library saves enhanced records through its own Vault boundary', () => {
  const library = read('video-library.js');
  assert.match(library, /MangaVaultPayload\.buildFromLocalStorage\(\)/);
  assert.match(library, /MangaVault\.savePayload\(MangaVaultPayload\.buildFromLocalStorage\(\)\)/);
  assert.doesNotMatch(read('reader.html'), /video-data\.js|video-library\.js|mangaReaderVideos/);
});

test('video library never reads or mutates protected records without VPN access', () => {
  const library = read('video-library.js');
  const load = library.slice(library.indexOf('function loadLibraryState'), library.indexOf('function effectiveVideo'));
  assert.match(library, /function canReadProtectedData\(\)/);
  assert.ok(load.indexOf('if (!canReadProtectedData())') < load.indexOf('readJson(VIDEO_KEY'));
  assert.match(library, /if \(isProtectedDataKey\(key\) && !canReadProtectedData\(\)\) return fallback/);
  assert.match(library, /if \(isProtectedDataKey\(key\) && !canReadProtectedData\(\)\) return false/);
  assert.match(library, /if \(!canReadProtectedData\(\)\) return;[\s\S]*MangaVaultPayload\.buildFromLocalStorage/);
});

test('video playback and thumbnail helpers honor access loss before protected reads, media work, writes, and sync', () => {
  const routing = read('video-routing-fix.js');
  const thumbnail = read('video-thumbnail-time.js');
  assert.match(routing, /function readJson\(key, fallback\)\s*\{\s*if \(PROTECTED_KEYS\.has\(key\) && !canReadProtectedData\(\)\) return fallback/);
  assert.match(routing, /function scanDirectVideoThumbnails\(\)\s*\{\s*if \(!canReadProtectedData\(\)\) return false/);
  assert.match(routing, /function persistPlaybackProgress\(base, video, options\)\s*\{\s*if \(!canReadProtectedData\(\)/);
  assert.match(routing, /if \(!canReadProtectedData\(\)\) return;[\s\S]*MangaVaultPayload\.buildFromLocalStorage/);
  const persistThumbnail = thumbnail.slice(thumbnail.indexOf('function persistThumbnailTimeAfterSave'), thumbnail.indexOf('function installEditor'));
  assert.match(persistThumbnail, /if \(!canReadProtectedData\(\)\) return/);
  assert.match(thumbnail, /setTimeout\(async \(\) => \{\s*if \(!canReadProtectedData\(\)\) return/);
});

test('video URL additions reject an exact duplicate without writing another record', () => {
  const library = read('video-library.js');
  assert.match(library, /list\.some\(\(item\)\s*=>\s*Data\.normalizeVideo\(item\)\.url\s*===\s*url\)/);
  assert.match(library, /同じ動画URLはすでに追加されています/);
});

test('video library supports hiding videos and restoring them from the hidden list', () => {
  const library = read('video-library.js');
  assert.match(library, /videoLibraryHidden/);
  const editor = read('video-edit-page.js');
  assert.match(editor, /name="hidden" type="checkbox"/);
  assert.match(editor, /elements\.hidden\.checked = current\.hidden/);
  assert.match(editor, /hidden: elements\.hidden\.checked/);
  assert.match(library, /state\.showHidden/);
});

test('video list reuses thumbnail DOM when the visible records do not change', () => {
  const library = read('video-library.js');
  assert.match(library, /let renderedResultsKey = null/);
  assert.match(library, /const resultsKey = JSON\.stringify\(\[state\.view, state\.showHidden, videos\]\)/);
  assert.match(library, /if \(resultsKey === renderedResultsKey\) return;[\s\S]*dom\.results\.replaceChildren\(\)/);
});

test('video editor exposes a persistent 90-degree rotation setting', () => {
  const library = read('video-library.js');
  assert.match(library, /videoLibraryRotate90Direction/);
  assert.match(library, /rotate90/);
  assert.match(library, /videoLibraryRotate90Direction/);
  assert.doesNotMatch(library, /videoLibraryRotateLeftStart|videoLibraryRotateLeftEnd|左90°回転 開始秒|左90°回転 終了秒/);
  assert.match(library, /rotate90Direction\.disabled = !Data\.isDirectVideoUrl\(video\.url\)/);
  assert.match(library, /rotate90Direction: Data\.isDirectVideoUrl\(url\) \? dom\.rotate90Direction\.value : 'none'/);
});

test('video routing bridge plays direct video URLs with a video element and keeps legacy iframe playback', () => {
  const source = read('video-routing-fix.js');
  assert.match(source, /\.vl-open/);
  assert.match(source, /vl-inline-player/);
  assert.match(source, /classifyVideoUrl/);
  assert.match(source, /createElement\(['"]video['"]\)/);
  assert.match(source, /\.controls\s*=\s*true/);
  assert.match(source, /\.playsInline\s*=\s*true/);
  assert.match(source, /createElement\(['"]iframe['"]\)/);
  assert.match(source, /stopImmediatePropagation/);
  assert.match(source, /recordOpen/);
  assert.match(source, /addEventListener\(['"]click['"],[\s\S]*true\)/);
  assert.doesNotMatch(source, /node\.click\(\)/);
  assert.doesNotMatch(source, /screen=video-player/);
  assert.match(source, /MangaVaultPayload\.buildFromLocalStorage/);
  assert.match(source, /MangaVault\.savePayload/);
});

test('browser backup hook commits encrypted video sidecars only after import confirmation', () => {
  const source = read('recommendations.js');
  assert.match(source, /MangaReaderBackup\.migrateBackup/);
  assert.match(source, /installVideoBackupRestoreHook/);
  assert.match(source, /root\.confirm/);
  assert.match(source, /accepted[\s\S]*mangaReaderVideoFolders/);
  assert.match(source, /accepted[\s\S]*mangaReaderVideoMeta/);
  assert.match(source, /setTimeout[\s\S]*root\.confirm/);
});

test('backup restore hook is reader-only while video library loading is page-specific', () => {
  const source = read('recommendations.js');
  assert.match(source, /const page = String\(\(root\.location && root\.location\.pathname\) \|\| ''\)\.split\('\/'\)\.pop\(\);/);
  assert.match(source, /if \(page !== 'reader\.html'\) return;\s*installVideoBackupRestoreHook\(\);/);
  assert.ok(source.indexOf("if (page !== 'reader.html') return;") < source.indexOf('installVideoBackupRestoreHook();'));
  assert.ok(source.indexOf('installVideoBackupRestoreHook();') < source.indexOf("loadBrowserScript('video-data.js')"));
});

test('backup sidecar fields remain part of the existing migration and payload boundaries', () => {
  const recommendations = read('recommendations.js');
  const backup = read('backup-format.js');
  const payload = read('vault-payload.js');
  assert.match(recommendations, /mangaReaderVideoFolders/);
  assert.match(recommendations, /mangaReaderVideoMeta/);
  assert.match(backup, /videoFolders/);
  assert.match(backup, /videoMeta/);
  assert.match(payload, /videoFolders/);
  assert.match(payload, /videoMeta/);
});
