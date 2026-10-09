import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('video-virtual-player.html');
const page = read('video-virtual-player-page.js');
const engine = read('video-virtual-playback.js');
const editor = read('video-virtual-editor.js');

test('virtual player is a dedicated route with correctly ordered dependencies', () => {
  assert.match(html, /id="virtualVideoPlayer"/);
  assert.ok(html.indexOf('media-access-gate.js') < html.indexOf('video-virtual-player-page.js'));
  assert.ok(html.indexOf('video-virtual-edit.js') < html.indexOf('video-virtual-edit-store.js'));
  assert.ok(html.indexOf('video-virtual-edit-store.js') < html.indexOf('video-virtual-playback.js'));
  assert.ok(html.indexOf('video-virtual-playback.js') < html.indexOf('video-virtual-player-page.js'));
  assert.match(read('video-virtual-player.css'), /vvpSeek/);
});
test('saved projects can open virtual playback without changing original player', () => {
  assert.match(editor, /編集版を再生/);
  assert.match(editor, /video-virtual-player\.html\?project=/);
  assert.match(page, /video-virtual-editor\.html\?project=/);
});
test('virtual player protects reads, URL fingerprints and cross-tab changes', () => {
  assert.match(page, /if \(!allowed\(\)\) throw new Error/);
  assert.match(page, /repo\.inspect\(projectId\)/);
  assert.match(page, /Store\.sourceFingerprint\(source\.url\)/);
  assert.match(page, /manga-reader-vpn-status/);
  assert.match(page, /window\.addEventListener\('storage'/);
  assert.match(page, /window\.addEventListener\('pagehide', stopPlayer\)/);
  assert.match(engine, /video\.removeAttribute\('src'\)/);
});
test('virtual playback UI exposes total-timeline seek and accessible segment list', () => {
  assert.match(page, /data-seek/);
  assert.match(page, /refs\.seek\.addEventListener\('input'/);
  assert.match(page, /aria-label="編集版の再生位置"/);
  assert.match(page, /player\.seek\(seconds\)/);
  assert.match(page, /player\.seek\(start\)/);
  assert.match(page, /aria-current/);
});
