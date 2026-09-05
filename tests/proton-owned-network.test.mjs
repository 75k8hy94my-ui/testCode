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

test('Proton-owned Seattle exit network is accepted even when external VPN lookups fail', async () => {
  const currentIp = '159.26.103.230';
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return { ok: true, json: async () => ({ ip: currentIp }) };
    return { ok: false, status: 429, json: async () => ({}) };
  };
  const Gate = loadGate({ fetch, setTimeout, clearTimeout });
  assert.equal(Gate.isKnownProtonOwnedIp(currentIp), true);
  assert.equal(await Gate.checkVpn(), true);
  const d = Gate.getDiagnostics();
  assert.equal(d.ip, currentIp);
  assert.equal(d.protonOwnedNetworkMatch, true);
  assert.equal(d.final, 'allowed');
});
