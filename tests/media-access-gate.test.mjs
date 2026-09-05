import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../media-access-gate.js', import.meta.url), 'utf8');

function loadGate() {
  const window = {};
  const context = vm.createContext({ window, globalThis: window, URL, setTimeout, clearTimeout, console });
  vm.runInContext(source, context);
  return window.MangaReaderMediaAccess;
}

test('VPN verdict accepts vpn/proxy signals and blocks ordinary connections', () => {
  const Gate = loadGate();
  assert.equal(Gate.isVpnVerdict({ is_vpn: true }), true);
  assert.equal(Gate.isVpnVerdict({ is_proxy: true }), true);
  assert.equal(Gate.isVpnVerdict({ is_vpn: false, is_proxy: false }), false);
  assert.equal(Gate.isVpnVerdict(null), false);
});

test('external http media is protected while same-origin and local blob/data assets remain available', () => {
  const Gate = loadGate();
  const base = 'https://75k8hy94my-ui.github.io/testCode/reader.html';
  assert.equal(Gate.isProtectedMediaUrl('https://example.com/page.jpg', base), true);
  assert.equal(Gate.isProtectedMediaUrl('https://cdn.example.com/video.mp4', base), true);
  assert.equal(Gate.isProtectedMediaUrl('/testCode/icon-heart-filled.svg', base), false);
  assert.equal(Gate.isProtectedMediaUrl('blob:https://75k8hy94my-ui.github.io/abc', base), false);
  assert.equal(Gate.isProtectedMediaUrl('data:image/png;base64,AAAA', base), false);
});

test('blocked state never returns an external media URL for assignment', () => {
  const Gate = loadGate();
  Gate.setAllowedForTesting(false);
  assert.equal(Gate.mediaUrl('https://example.com/page.jpg', 'https://75k8hy94my-ui.github.io/testCode/reader.html'), '');
  assert.equal(Gate.mediaUrl('/testCode/icon-152.png', 'https://75k8hy94my-ui.github.io/testCode/reader.html'), '/testCode/icon-152.png');
  Gate.setAllowedForTesting(true);
  assert.equal(Gate.mediaUrl('https://example.com/page.jpg', 'https://75k8hy94my-ui.github.io/testCode/reader.html'), 'https://example.com/page.jpg');
});

test('reader and video integration route external media through the VPN gate', () => {
  const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
  const library = fs.readFileSync(new URL('../video-library.js', import.meta.url), 'utf8');
  const routing = fs.readFileSync(new URL('../video-routing-fix.js', import.meta.url), 'utf8');
  assert.match(reader, /media-access-gate\.js/);
  assert.match(reader, /MangaReaderMediaAccess\.mediaUrl/);
  assert.match(library, /MangaReaderMediaAccess\.mediaUrl/);
  assert.match(routing, /MangaReaderMediaAccess\.canLoadExternalMedia/);
});
