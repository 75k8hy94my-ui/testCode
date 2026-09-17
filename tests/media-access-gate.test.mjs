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
    assert.match(calls[1], /ip-api\.dev\/api\?q=203\.0\.113\.9&format=json/);
});

test('ordinary VPN checks skip the general external API unless explicitly requested', async () => {
  const calls = [];
  const Gate = loadGate({
    fetch: async (url) => {
      calls.push(String(url));
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: '198.51.100.123' }) };
      return { ok: true, json: async () => [] };
    },
    setTimeout,
    clearTimeout,
  });
  assert.equal(await Gate.checkVpn({ external: false }), false);
  assert.equal(calls.some((url) => url.startsWith(Gate.CHECK_URL)), false);
  assert.equal(Gate.getDiagnostics().generic.status, 'skipped-manual');
});

test('known public VPN IP snapshot is used before external VPN lookup', async () => {
  const currentIp = '37.19.205.223';
  const calls = [];
  const Gate = loadGate({
    fetch: async (url) => {
      calls.push(String(url));
      if (calls.length === 1) return { ok: true, json: async () => ({ ip: currentIp }) };
      throw new Error('external VPN API must not be needed for a known IP');
    },
    setTimeout,
    clearTimeout,
  });
  assert.equal(Gate.isKnownVpnIp(currentIp), true);
  assert.equal(await Gate.checkVpn(), true);
  assert.deepEqual(calls, [Gate.IP_URL]);
  assert.equal(Gate.getDiagnostics().generic.status, 'skipped-known-ip');
});

test('VPN check honors a manually designated VPN IP', async () => {
  const store = new Map();
  const currentIp = '198.51.100.120';
  const Gate = loadGate({
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, value),
    },
    confirm: () => true,
    fetch: async (url) => {
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: currentIp }) };
      return { ok: true, json: async () => ({ is_vpn: false, is_proxy: false }) };
    },
    setTimeout,
    clearTimeout,
  });
  assert.equal(Gate.setManualIpDesignation(currentIp, 'vpn'), true);
  assert.equal(await Gate.checkVpn(), true);
  assert.equal(Gate.getDiagnostics().manualDesignation, 'vpn');
  assert.equal(Gate.getDiagnostics().final, 'allowed');
  assert.equal(Gate.clearManualVpnDesignation(currentIp), true);
  assert.equal(Gate.getManualIpDesignation(currentIp), null);
});

test('manual VPN approval is remembered for the same IP during the browser session', async () => {
  const store = new Map();
  const session = new Map();
  let prompts = 0;
  const currentIp = '198.51.100.125';
  const Gate = loadGate({
    localStorage: { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
    sessionStorage: { getItem: (key) => session.get(key) || null, setItem: (key, value) => session.set(key, value), removeItem: (key) => session.delete(key) },
    confirm: () => { prompts += 1; return true; },
    fetch: async (url) => {
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: currentIp }) };
      return { ok: true, json: async () => [] };
    },
    setTimeout,
    clearTimeout,
  });
  assert.equal(Gate.setManualIpDesignation(currentIp, 'vpn'), true);
  assert.equal(await Gate.checkVpn({ external: false }), true);
  assert.equal(await Gate.checkVpn({ external: false }), true);
  assert.equal(prompts, 1);
});

test('VPN check does not prompt or allow an unregistered non-VPN IP', async () => {
  let prompted = false;
  const Gate = loadGate({
    confirm: () => { prompted = true; return true; },
    fetch: async (url) => {
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: '198.51.100.121' }) };
      if (url.startsWith(Gate.CHECK_URL)) return { ok: true, json: async () => ({ is_vpn: false, is_proxy: false }) };
      return { ok: true, json: async () => [] };
    },
    setTimeout,
    clearTimeout,
  });
  assert.equal(await Gate.checkVpn(), false);
  assert.equal(prompted, false);
  assert.equal(Gate.getDiagnostics().final, 'blocked');
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
  assert.equal(Gate.getDiagnostics().error, null);
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

test('generic API outage is reported as unavailable rather than a VPN verdict', async () => {
  const currentIp = '198.51.100.78';
  const Gate = loadGate({
    fetch: async (url) => {
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: currentIp }) };
      if (url.startsWith(Gate.CHECK_URL)) return { ok: false, status: 429, json: async () => ({}) };
      return { ok: true, json: async () => [] };
    },
    setTimeout,
    clearTimeout,
  });
  assert.equal(await Gate.checkVpn(), false);
  const diagnostics = Gate.getDiagnostics();
  assert.equal(diagnostics.generic.status, 'unavailable');
  assert.equal(diagnostics.generic.httpStatus, 429);
  assert.equal(diagnostics.error, '一般VPN判定APIを利用できません (HTTP 429)');
});

test('VPN check accepts an IP in a Proton-listed /24 exit block', async () => {
  const currentIp = '37.19.205.204';
  const Gate = loadGate({
    fetch: async (url) => {
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: currentIp }) };
      if (url.startsWith(Gate.CHECK_URL)) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, json: async () => ['37.19.205.223'] };
    },
    setTimeout,
    clearTimeout,
  });
  assert.equal(await Gate.checkVpn(), true);
  assert.equal(Gate.getDiagnostics().protonExitMatch, true);
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
  assert.equal(d.generic.status, 'unavailable');
  assert.equal(d.generic.httpStatus, 429);
  assert.equal(d.protonExitMatch, true);
  assert.equal(d.final, 'allowed');
});

test('reader bootstrap loads the VPN gate before reader media and the gate covers image/video/iframe src', () => {
  const recommendations = fs.readFileSync(new URL('../recommendations.js', import.meta.url), 'utf8');
  const reader = ['reader.html', 'reader-saved-list-template.js', 'reader-author-list-template.js', 'reader-toc-template.js', 'reader-mobile-nav-template.js', 'reader-feature-overlays-template.js']
    .map((name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')).join('\n');
  assert.match(recommendations, /document\.write\([\s\S]*media-access-gate\.js/);
  assert.match(reader, /data-vpn-header="saved-list"/);
  assert.match(reader, /data-vpn-status-button/);
  assert.match(reader, /data-vpn-diagnostics-button/);
  assert.match(source, /patchSrcProperty\(root\.HTMLImageElement\)/);
  assert.match(source, /patchSrcProperty\(root\.HTMLMediaElement\)/);
  assert.match(source, /patchSrcProperty\(root\.HTMLIFrameElement\)/);
  assert.match(source, /data-vpn-blocked-src/);
  assert.match(source, /VPN診断/);
  assert.doesNotMatch(source, /button\.id = DIAGNOSTICS_BUTTON_ID/);
  assert.match(source, /closest\('\[data-vpn-diagnostics-button\]'\)/);
  assert.match(source, /abort\(\), 15000/);
  assert.match(source, /getDiagnostics/);
  assert.match(source, /checkVpn/);
});

test('VPN diagnostics panel toggles closed and hides on SPA route changes', () => {
  assert.match(source, /function hideDiagnosticsPanel\(\)/);
  assert.match(source, /home-profile-routechange/);
  assert.match(source, /addEventListener\('home-profile-routechange',[\s\S]*hideDiagnosticsPanel\(\)/);
  assert.match(source, /panel\.style\.display === 'none' \? 'block' : 'none'/);
});

test('profile exposes controls to release manually fixed non-VPN IPs', () => {
  const spa = fs.readFileSync(new URL('../home-profile-spa.js', import.meta.url), 'utf8');
  assert.match(spa, /profileNonVpnIps/);
  assert.match(spa, /profileClearNonVpn/);
  assert.match(spa, /testCode\.manualNonVpnIps/);
});
