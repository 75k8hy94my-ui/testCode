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

test('overseas Proton IP is verified by offline country data', async () => {
  const ip='159.26.103.230';
  const calls=[];
  const fetch=async url => {
    calls.push(String(url));
    if(String(url).includes('ipify.org')) return {ok:true,json:async()=>({ip})};
    if(String(url)==='ip-country-jp.json') return {ok:true,json:async()=>({
      ipv4:Array(100).fill('127.0.0.0/8'),ipv6:Array(100).fill('::1/128'),updated:'2026-10-21'
    })};
    return {ok:false,status:429,json:async()=>({})};
  };
  const Gate=loadGate({fetch,setTimeout,clearTimeout});
  assert.equal(Gate.isKnownProtonOwnedIp(ip),true);
  assert.equal(await Gate.checkVpn(),true);
  const d=Gate.getDiagnostics();
  assert.equal(d.ip,ip);
  assert.equal(d.countryPolicy,'non-jp-vpn');
  assert.equal(d.final,'allowed');
  assert.deepEqual(calls,['https://api64.ipify.org?format=json','ip-country-jp.json']);
});
