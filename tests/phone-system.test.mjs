import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import phoneModule from '../game/phone-system.js';

const phoneSource = fs.readFileSync(new URL('../game/phone-system.js', import.meta.url), 'utf8');
const gameSource = fs.readFileSync(new URL('../game/game.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../game/game.css', import.meta.url), 'utf8');

test('phone system exposes a broad app catalog', () => {
  assert.equal(phoneModule.appCount, 20);
  assert.equal(typeof phoneModule.createPhoneSystem, 'function');
  for (const id of [
    'phone','messages','maps','camera','photos','weather','calendar','clock',
    'notes','reminders','wallet','health','find','transit','mail','news',
    'music','calculator','home','settings'
  ]) {
    assert.match(phoneSource, new RegExp('"' + id + '"'));
  }
});

test('phone system is loaded before the game runtime', () => {
  assert.match(html, /phone-system\.js\?v=[^"]+/);
  assert.ok(html.indexOf('phone-system.js') < html.indexOf('game.js'));
  assert.match(gameSource, /CityDaysPhoneSystem\?\.createPhoneSystem/);
});

test('phone has iPhone-style system surfaces', () => {
  assert.match(phoneSource, /dynamic-island/);
  assert.match(phoneSource, /ios-home-indicator/);
  assert.match(phoneSource, /通知センター/);
  assert.match(phoneSource, /コントロールセンター/);
  assert.match(phoneSource, /ios-lock-screen/);
  assert.match(css, /\.dynamic-island/);
  assert.match(css, /\.ios-dock/);
  assert.match(css, /\.ios-home-indicator/);
});

test('phone maps integrate with walking and driving destinations', () => {
  assert.match(gameSource, /function setPhoneWaypoint\(placeId\)/);
  assert.match(gameSource, /state\.phone\.waypoint = place\.id/);
  assert.match(gameSource, /if \(state\.player\.inVehicle\)[\s\S]*setDrivingDestination\(place\)/);
  assert.match(gameSource, /徒歩ナビ:/);
  assert.match(gameSource, /const phoneWaypoint = PLACES\.find/);
});

test('phone camera stores actual game canvas captures', () => {
  assert.match(gameSource, /function capturePhonePhoto\(\)/);
  assert.match(gameSource, /tctx\.drawImage\(canvas/);
  assert.match(gameSource, /toDataURL\("image\/jpeg", \.72\)/);
  assert.match(phoneSource, /data-phone-action="take-photo"/);
  assert.match(phoneSource, /ios-photo-grid/);
});

test('phone receives live game data for health, contacts, transport and wallet', () => {
  assert.match(gameSource, /function phoneModelSnapshot\(\)/);
  assert.match(gameSource, /needs:\{ \.\.\.state\.needs \}/);
  assert.match(gameSource, /npcs:NPCS\.map/);
  assert.match(gameSource, /stations:TRAIN_STATIONS\.map/);
  assert.match(gameSource, /trains:trains\.map/);
  assert.match(gameSource, /nextRentDay:nextRentDay\(\)/);
});

test('phone waypoint persists in game snapshots', () => {
  assert.match(gameSource, /phone:\s*\{[\s\S]*waypoint: state\.phone\?\.waypoint/);
  assert.match(gameSource, /saved\.phone && typeof saved\.phone\.waypoint === "string"/);
});


test('phone remains clickable inside the pointer-disabled HUD', () => {
  assert.match(css, /\.smartphone-panel\{[\s\S]*pointer-events:auto/);
  assert.match(css, /\.smartphone-panel button\{[\s\S]*pointer-events:auto/);
});

test('live phone updates do not replace buttons during pointer interaction', () => {
  assert.match(phoneSource, /let pointerActive = false/);
  assert.match(phoneSource, /root\.addEventListener\("pointerdown"[\s\S]*pointerActive = true/);
  assert.match(phoneSource, /if \(root\.hidden \|\| pointerActive\) return/);
  assert.match(phoneSource, /signature !== lastRenderedSignature/);
});
