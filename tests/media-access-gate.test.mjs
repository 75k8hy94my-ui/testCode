import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../media-access-gate.js', import.meta.url), 'utf8');
function loadGate(overrides = {}) {
  const window = { ...overrides };
  vm.runInContext(source, vm.createContext({ window, globalThis: window, URL, setTimeout, clearTimeout, console }));
  return window.MangaReaderMediaAccess;
}
const db = {
  updated: '2026-10-12T00:00:00Z',
  ipv4: ['1.0.16.0/20', ...Array(100).fill('133.0.0.0/8')],
  ipv6: ['2001:200::/32', ...Array(100).fill('2404:7a80::/32')],
};
const response = (body) => ({ ok: true, json: async () => body });
function setup(ip, dbResponse = db) {
  const calls = [];
  const Gate = loadGate({
    fetch: async (url) => {
      calls.push(String(url));
      if (String(url).includes('ipify.org')) return response({ ip });
      if (String(url) === 'ip-country-jp.json') {
        if (dbResponse instanceof Error) throw dbResponse;
        return response(dbResponse);
      }
      throw new Error('Unexpected external API: ' + url);
    },
    setTimeout, clearTimeout
  });
  return { Gate, calls };
}

test('same-origin media stays available while external media are protected', () => {
  const gate = loadGate();
  const base = 'https://75k8hy94my-ui.github.io/testCode/reader.html';
  assert.equal(gate.isProtectedMediaUrl('https://example.com/a.jpg', base), true);
  assert.equal(gate.isProtectedMediaUrl('/testCode/icon-152.png', base), false);
  assert.equal(gate.mediaUrl('https://example.com/a.jpg', base), '');
  gate.setAllowedForTesting(true);
  assert.equal(gate.mediaUrl('https://example.com/a.jpg', base), 'https://example.com/a.jpg');
});

test('Japanese IPv4 is rejected using the local static database', async () => {
  const { Gate, calls } = setup('1.0.16.1');
  assert.equal(await Gate.checkVpn(), false);
  assert.equal(Gate.getDiagnostics().countryCode, 'JP');
  assert.equal(calls.length, 2);
});

test('non-Japanese IPv4 is accepted without any VPN or GeoIP API', async () => {
  const { Gate, calls } = setup('8.8.8.8');
  assert.equal(await Gate.checkVpn(), true);
  assert.equal(Gate.canReadProtectedData(), true);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes('ipify.org'));
  assert.equal(calls[1], 'ip-country-jp.json');
});

test('Japanese IPv6 is rejected', async () => {
  const { Gate } = setup('2001:200::1');
  assert.equal(await Gate.checkVpn(), false);
});

test('foreign IPv6 is accepted', async () => {
  const { Gate } = setup('2606:4700:4700::1111');
  assert.equal(await Gate.checkVpn(), true);
});

test('private, reserved and documentation IPs fail closed', async () => {
  for (const ip of ['127.0.0.1','192.168.1.1','203.0.113.5','2001:db8::1','::1']) {
    const { Gate } = setup(ip);
    assert.equal(await Gate.checkVpn(), false, ip);
  }
});

test('database failure or incomplete database fails closed', async () => {
  const broken = setup('8.8.8.8', new Error('network offline'));
  assert.equal(await broken.Gate.checkVpn(), false);
  const incomplete = setup('8.8.8.8', { ipv4: [], ipv6: [] });
  assert.equal(await incomplete.Gate.checkVpn(), false);
});

test('local Japan detection is never bypassed by a Proton IP or manual overrides', async () => {
  const { Gate } = setup('1.0.16.10');
  assert.equal(await Gate.checkVpn(), false);
  assert.equal(Gate.getStatus(), 'blocked');
});

test('reader bootstrapping and existing UI modules still use media-access-gate', () => {
  const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
  assert.match(reader, /media-access-gate\\.js/);
});
