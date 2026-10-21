import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('home and guest boot load VPN gate automatically',()=>{
 const spa=read('home-profile-spa.js');
 const start=spa.slice(spa.indexOf('async function start(){'));
 assert.equal((start.match(/await ensureVpnGate\(\)\.catch\(\(\)=>null\)/g)||[]).length,2);
 assert.match(read('media-access-gate.js'),/root\.setInterval\(refreshVpn, VPN_REFRESH_MS\)/);
 assert.match(read('media-access-gate.js'),/visibilitychange/);
});
test('SPA entries load new boot code',()=>{
 for(const name of ['home.html','video.html','manga.html','profile.html'])
  assert.match(read(name),/home-profile-spa\.js\?v=[\w-]+/);
});