import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../media-access-gate.js', import.meta.url), 'utf8');

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    dump() { return Object.fromEntries(values.entries()); },
  };
}

function loadGate(overrides = {}) {
  const window = { ...overrides };
  const context = vm.createContext({ window, globalThis: window, URL, setTimeout, clearTimeout, console });
  vm.runInContext(source, context);
  return window.MangaReaderMediaAccess;
}

test('manual VPN override allows an IP even when automatic detection says no', async () => {
  const currentIp = '198.51.100.10';
  const localStorage = makeStorage();
  const Gate = loadGate({
    localStorage,
    fetch: async (url) => {
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: currentIp }) };
      if (url.startsWith(Gate.CHECK_URL)) return { ok: true, json: async () => ({ is_vpn: false, is_proxy: false }) };
      return { ok: true, json: async () => [] };
    },
    setTimeout,
    clearTimeout,
  });

  assert.equal(Gate.saveVpnOverride(currentIp), true);
  assert.equal(await Gate.checkVpn(), true);
  assert.equal(Gate.getDiagnostics().manualOverride, 'vpn');
});

test('manual non-VPN override blocks an IP even when automatic detection says VPN', async () => {
  const currentIp = '198.51.100.20';
  const localStorage = makeStorage();
  const Gate = loadGate({
    localStorage,
    fetch: async (url) => {
      if (url === Gate.IP_URL) return { ok: true, json: async () => ({ ip: currentIp }) };
      return { ok: true, json: async () => ({ is_vpn: true, is_proxy: false }) };
    },
    setTimeout,
    clearTimeout,
  });

  assert.equal(Gate.saveNonVpnOverride(currentIp), true);
  assert.equal(await Gate.checkVpn(), false);
  assert.equal(Gate.getDiagnostics().manualOverride, 'non-vpn');
});

test('non-VPN override is locked and cannot be replaced by a VPN override', () => {
  const currentIp = '198.51.100.30';
  const localStorage = makeStorage();
  const Gate = loadGate({ localStorage });

  assert.equal(Gate.saveNonVpnOverride(currentIp), true);
  assert.equal(Gate.saveVpnOverride(currentIp), false);
  assert.equal(Gate.getIpOverride(currentIp), 'non-vpn');
});

test('diagnostics source includes controls but no UI path for removing non-VPN lock', () => {
  assert.match(source, /このIPはVPN/);
  assert.match(source, /このIPはVPNではない/);
  assert.doesNotMatch(source, /非VPN指定を解除/);
});
