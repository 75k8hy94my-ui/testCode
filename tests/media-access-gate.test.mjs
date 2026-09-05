import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../media-access-gate.js', import.meta.url), 'utf8');

function loadGate(overrides = {}) {
  const window = { ...overrides };
  const context = vm.createContext({ window, globalThis: window, URL, setTimeout, clearTimeout, console });
  vm.runInContext(source, context);
  return window.MangaReaderMediaAccess;
}

test('VPN verdict accepts vpn/proxy signals and Proton-owned networks while blocking ordinary connections', () => {
  const Gate = loadGate();
  assert.equal(Gate.isVpnVerdict({ is_vpn: true }), true);
  assert.equal(Gate.isVpnVerdict({ is_proxy: true }), true);
  assert.equal(Gate.isVpnVerdict({ is_vpn: false, is_proxy: false, asn: { number: 209103, name: 'Proton AG' } }), true);
  assert.equal(Gate.isVpnVerdict({ is_vpn: false, is_proxy: false, asn: { number: 62371, name: 'Proton AG' } }), true);
  assert.equal(Gate.isVpnVerdict({ is_vpn: false, is_proxy: false, organization: { name: 'Proton AG' } }), true);
  assert.equal(Gate.isVpnVerdict({ is_vpn: false, is_proxy: false, asn: { number: 64500, name: 'Example ISP' } }), false);
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

test('VPN check discovers the current public IP before querying the VPN verdict API', async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return { ok: true, json: async () => ({ ip: '203.0.113.9' }) };
    return { ok: true, json: async () => ({ is_vpn: true, is_proxy: false }) };
  };
  const Gate = loadGate({ fetch, setTimeout, clearTimeout });
  assert.equal(await Gate.checkVpn(), true);
  assert.match(calls[0], /api\.ipify\.org/);
  assert.match(calls[1], /ip-api\.dev\/api\?q=203\.0\.113\.9/);
});

test('VPN check falls back to Proton exit IP list when generic detection returns false', async () => {
  const calls = [];
  const currentIp = '198.51.100.44';
  const fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return { ok: true, json: async () => ({ ip: currentIp }) };
    if (calls.length === 2) return { ok: true, json: async () => ({ is_vpn: false, is_proxy: false, asn: { number: 64500, name: 'Hosting Example' } }) };
    return { ok: true, json: async () => ([currentIp, '203.0.113.25']) };
  };
  const Gate = loadGate({ fetch, setTimeout, clearTimeout });
  assert.equal(await Gate.checkVpn(), true);
  assert.match(calls[2], /ProtonVPN-IPs/);
});

test('VPN check still uses Proton exit IP list when generic detection API errors', async () => {
  const calls = [];
  const currentIp = '198.51.100.77';
  const fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return { ok: true, json: async () => ({ ip: currentIp }) };
    if (calls.length === 2) return { ok: false, status: 429, json: async () => ({ error: 'Rate limit exceeded' }) };
    return { ok: true, json: async () => ([currentIp]) };
  };
  const Gate = loadGate({ fetch, setTimeout, clearTimeout });
  assert.equal(await Gate.checkVpn(), true);
  assert.match(calls[2], /ProtonVPN-IPs/);
});

test('diagnostics expose IP, generic lookup result, Proton match, and final decision', async () => {
  const currentIp = '198.51.100.88';
  let call = 0;
  const fetch = async () => {
    call += 1;
    if (call === 1) return { ok: true, json: async () => ({ ip: currentIp }) };
    if (call === 2) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, json: async () => ([currentIp]) };
  };
  const Gate = loadGate({ fetch, setTimeout, clearTimeout });
  assert.equal(await Gate.checkVpn(), true);
  const d = Gate.getDiagnostics();
  assert.equal(d.ip, currentIp);
  assert.equal(d.generic.status, 'error');
  assert.equal(d.generic.httpStatus, 429);
  assert.equal(d.protonExitMatch, true);
  assert.equal(d.final, 'allowed');
});

test('reader bootstrap loads the VPN gate before reader media and the gate covers image/video/iframe src', () => {
  const recommendations = fs.readFileSync(new URL('../recommendations.js', import.meta.url), 'utf8');
  const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
  assert.match(recommendations, /document\.write\([\s\S]*media-access-gate\.js/);
  assert.match(reader, /data-vpn-header="manga"/);
  assert.match(reader, /data-vpn-header="video"/);
  assert.match(reader, /data-vpn-header="video-player"/);
  assert.match(reader, /data-vpn-status-button/);
  assert.match(reader, /data-vpn-diagnostics-button/);
  assert.match(source, /patchSrcProperty\(root\.HTMLImageElement\)/);
  assert.match(source, /patchSrcProperty\(root\.HTMLMediaElement\)/);
  assert.match(source, /patchSrcProperty\(root\.HTMLIFrameElement\)/);
  assert.match(source, /data-vpn-blocked-src/);
  assert.match(source, /\.vl-open/);
  assert.match(source, /VPN診断/);
  assert.match(source, /querySelectorAll\('\[data-vpn-diagnostics-button\]'\)/);
  assert.doesNotMatch(source, /button\.id = DIAGNOSTICS_BUTTON_ID/);
  assert.match(source, /getDiagnostics/);
  assert.match(source, /checkVpn/);
});
