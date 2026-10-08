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

test('protected-data access is granted only after an allowed VPN verdict', () => {
  const Gate = loadGate();
  assert.equal(Gate.getStatus(), 'pending');
  assert.equal(Gate.canReadProtectedData(), false);
  Gate.setAllowedForTesting(false);
  assert.equal(Gate.canReadProtectedData(), false);
  Gate.setAllowedForTesting(true);
  assert.equal(Gate.canReadProtectedData(), true);
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

test('non-Japan IP is treated as VPN even when the provider VPN flag is false', async () => {
  const currentIp = '203.0.113.55';
  const calls = [];
  const Gate = loadGate({
    fetch: async (url) => {
      calls.push(String(url));
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: currentIp }) };
      if (String(url).startsWith(Gate.CHECK_URL)) {
        return { ok: true, json: async () => ({
          is_vpn: false,
          is_proxy: false,
          location: { country_code: 'US', country: 'United States' },
        }) };
      }
      throw new Error('Proton fallback should not run for a non-Japan IP');
    },
    setTimeout,
    clearTimeout,
  });
  assert.equal(await Gate.checkVpn({ external: false }), true);
  const diagnostics = Gate.getDiagnostics();
  assert.equal(diagnostics.countryCode, 'US');
  assert.equal(diagnostics.countryName, 'United States');
  assert.equal(diagnostics.countryPolicy, 'non-jp-vpn');
  assert.equal(diagnostics.final, 'allowed');
  assert.equal(calls.length, 3);
  assert.ok(calls.some((url) => url.startsWith(Gate.PROTON_EXIT_IPS_URL)));
});

test('Japan IP is not treated as VPN by country rule alone', async () => {
  const currentIp = '203.0.113.56';
  const Gate = loadGate({
    fetch: async (url) => {
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: currentIp }) };
      if (String(url).startsWith(Gate.CHECK_URL)) {
        return { ok: true, json: async () => ({
          is_vpn: false,
          is_proxy: false,
          location: { country_code: 'JP', country: 'Japan' },
        }) };
      }
      return { ok: true, json: async () => [] };
    },
    setTimeout,
    clearTimeout,
  });
  assert.equal(await Gate.checkVpn({ external: false }), false);
  const diagnostics = Gate.getDiagnostics();
  assert.equal(diagnostics.countryCode, 'JP');
  assert.equal(diagnostics.countryPolicy, 'jp');
  assert.equal(diagnostics.final, 'blocked');
});


test('ordinary VPN checks still resolve IP country even when the general VPN verdict is skipped', async () => {
  const calls = [];
  const Gate = loadGate({
    fetch: async (url) => {
      calls.push(String(url));
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: '198.51.100.123' }) };
      if (String(url).startsWith(Gate.CHECK_URL)) return { ok: true, json: async () => ({ location: { country_code: 'JP' }, is_vpn: true }) };
      return { ok: true, json: async () => [] };
    },
    setTimeout,
    clearTimeout,
  });
  assert.equal(await Gate.checkVpn({ external: false }), false);
  assert.equal(calls.some((url) => url.startsWith(Gate.CHECK_URL)), true);
  const diagnostics = Gate.getDiagnostics();
  assert.equal(diagnostics.generic.status, 'country-only');
  assert.equal(diagnostics.countryCode, 'JP');
  assert.equal(diagnostics.countryPolicy, 'jp');
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
  assert.equal(calls.some((url) => /ProtonVPN-IPs/.test(url)), true);
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
  assert.equal(diagnostics.error, 'IP国・一般VPN判定APIを利用できません (HTTP 429)');
});

test('country lookup falls back to ipapi.is when the primary VPN API is unavailable', async () => {
  const currentIp = '198.51.100.79';
  const calls = [];
  const Gate = loadGate({
    fetch: async (url) => {
      calls.push(String(url));
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: currentIp }) };
      if (String(url).startsWith(Gate.CHECK_URL)) return { ok: false, status: 429, json: async () => ({}) };
      if (String(url).startsWith(Gate.COUNTRY_FALLBACK_URL)) return { ok: true, json: async () => ({ country: 'Japan' }) };
      if (String(url).startsWith(Gate.PROTON_EXIT_IPS_URL)) return { ok: true, json: async () => [] };
      throw new Error('Unexpected request: ' + url);
    },
    setTimeout,
    clearTimeout,
  });

  assert.equal(await Gate.checkVpn({ external: false }), false);
  const diagnostics = Gate.getDiagnostics();
  assert.equal(diagnostics.countryName, 'Japan');
  assert.equal(diagnostics.countryPolicy, 'jp');
  assert.equal(diagnostics.generic.status, 'country-fallback');
  assert.equal(diagnostics.error, null);
  assert.equal(calls.some((url) => url.startsWith(Gate.COUNTRY_FALLBACK_URL + '?q=' + currentIp)), true);
});

test('country-only fallback never fabricates a successful general VPN verdict', async () => {
  const currentIp = '198.51.100.80';
  const Gate = loadGate({
    fetch: async (url) => {
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: currentIp }) };
      if (String(url).startsWith(Gate.CHECK_URL)) return { ok: false, status: 503, json: async () => ({}) };
      if (String(url).startsWith(Gate.COUNTRY_FALLBACK_URL)) return { ok: true, json: async () => ({ country: 'Japan' }) };
      if (String(url).startsWith(Gate.PROTON_EXIT_IPS_URL)) return { ok: true, json: async () => [] };
      throw new Error('Unexpected request: ' + url);
    },
    setTimeout,
    clearTimeout,
  });

  assert.equal(await Gate.checkVpn(), false);
  const diagnostics = Gate.getDiagnostics();
  assert.equal(diagnostics.generic.status, 'unavailable');
  assert.equal(diagnostics.generic.httpStatus, 503);
  assert.equal(diagnostics.generic.verdict, null);
  assert.equal(diagnostics.final, 'blocked');
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
  const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
  assert.match(recommendations, /document\.write\([\s\S]*media-access-gate\.js/);
  assert.match(reader, /media-access-gate\.js/);
  assert.match(source, /patchSrcProperty\(root\.HTMLImageElement\)/);
  assert.match(source, /patchSrcProperty\(root\.HTMLMediaElement\)/);
  assert.match(source, /patchSrcProperty\(root\.HTMLIFrameElement\)/);
  assert.match(source, /data-vpn-blocked-src/);
  assert.match(source, /VPN診断/);
  assert.match(source, /国判定ルール: 日本以外のIPはVPNとして扱う/);
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

test('explicit VPN recheck uses the full external verdict path', () => {
  assert.match(source, /closest\('\[data-vpn-recheck-button\]'\)/);
  assert.match(source, /recheckButton[\s\S]*checkVpn\(\{ external: true \}\)/);
  assert.match(source, /diagnosticsButton[\s\S]*renderDiagnostics\(\)/);
});

test('VPN UI can be resynchronized after route controls mount', () => {
  assert.match(source, /syncUi:\s*\(\) => updateStatusButtons\(status\)/);
});

test('a slow older VPN check cannot overwrite a newer allowed result', async () => {
  let completeOld;
  let ipCalls = 0;
  const Gate = loadGate({
    fetch: async (url) => {
      if (url.includes('api.ipify.org')) {
        ipCalls++;
        return ipCalls === 1
          ? new Promise((resolve) => { completeOld = resolve; })
          : { ok: true, json: async () => ({ ip: '37.19.205.223' }) };
      }
      return { ok: true, json: async () => ({ location: { country_code: 'JP' }, is_vpn: false }) };
    },
    setTimeout, clearTimeout,
  });
  const older = Gate.checkVpn();
  assert.equal(await Gate.checkVpn(), true);
  completeOld({ ok: true, json: async () => ({ ip: '198.51.100.200' }) });
  assert.equal(await older, false);
  assert.equal(Gate.getStatus(), 'allowed');
  assert.equal(Gate.getDiagnostics().ip, '37.19.205.223');
});

test('periodic VPN refresh detects lost access without resetting a verified Reader during the request', async () => {
  const intervals = [];
  const windowEvents = new Map();
  const docEvents = new Map();
  const doc = {
    readyState: 'loading', visibilityState: 'visible', body: null,
    addEventListener(name, fn) { docEvents.set(name, fn); },
    querySelectorAll() { return []; },
    getElementById() { return null; },
  };
  let release;
  const Gate = loadGate({
    document: doc,
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; },
    addEventListener(name, fn) { windowEvents.set(name, fn); },
    fetch: async (url) => {
      if (url === Gate.IP_URL) return new Promise((resolve) => { release = resolve; });
      if (url.startsWith(Gate.CHECK_URL)) return { ok: true, json: async () => ({ location: { country_code: 'JP' }, is_vpn: false }) };
      return { ok: true, json: async () => [] };
    },
    setTimeout, clearTimeout,
  });
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].ms, Gate.VPN_REFRESH_MS);
  Gate.setAllowedForTesting(true);
  const check = intervals[0].fn();
  assert.equal(Gate.canReadProtectedData(), true);
  release({ ok: true, json: async () => ({ ip: '198.51.100.203' }) });
  assert.equal(await check, false);
  assert.equal(Gate.canReadProtectedData(), false);
  Gate.setAllowedForTesting(true);
  windowEvents.get('offline')();
  assert.equal(Gate.canReadProtectedData(), false);
  assert.equal(Gate.getDiagnostics().final, 'blocked');
  doc.visibilityState = 'hidden';
  assert.equal(intervals[0].fn(), undefined);
});
