import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'game', 'game.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'game', 'index.html'), 'utf8');
const mapSource = fs.readFileSync(path.join(root, 'game', 'map-model.js'), 'utf8');

test('game keeps a timer fallback when requestAnimationFrame is unavailable', () => {
  assert.match(source, /const requestFrame = typeof window\.requestAnimationFrame === "function"/);
  assert.match(source, /window\.setTimeout\(\(\) => callback\(performance\.now\(\)\), 16\)/);
  assert.match(source, /requestFrame\(frame\)/);
});

test('game reports an unavailable canvas context instead of failing silently', () => {
  assert.match(source, /typeof canvas\.getContext === "function"/);
  assert.match(source, /Canvas API を利用できません/);
});

test('game defines the traffic signal state helper used by rendering and updates', () => {
  assert.match(source, /function signalStateAt\(worldX, worldY, orientation\)/);
  assert.match(source, /signalStateAt\(signal\.x, signal\.y, signal\.orientation\)/);
  assert.match(source, /signalStateAt\(wx, wy, "h"\)/);
});

test('game defines the ambient prop drawing helpers used by the city renderer', () => {
  assert.match(source, /function drawTree\(x, y, scale = 1\)/);
  assert.match(source, /function drawLamp\(x, y\)/);
});

test('game defines the saved-car road migration helper', () => {
  assert.match(source, /function nearestRoadSegmentInfo\(x, y, searchRadius = 2\)/);
  assert.match(source, /nearestRoadSegmentInfo\(personalCar\.x, personalCar\.y, 3\)/);
});

test('game surfaces uncaught runtime errors on the game surface', () => {
  assert.match(source, /window\.addEventListener\("error"/);
  assert.match(source, /window\.addEventListener\("unhandledrejection"/);
  assert.match(source, /ゲームの実行中にエラーが発生しました/);
});

test('game loads and validates the shared Japanese map model before runtime start', () => {
  assert.match(html, /<script src="\.\/map-model\.js\?v=[^"]+"><\/script>/);
  assert.ok(html.indexOf('map-model.js') < html.indexOf('game.js'));
  assert.match(source, /CityDaysMapModel\?\.createMapModel\?\.\(\)/);
  assert.match(source, /mapModel\.validate\(\)/);
});

test('game keeps all existing place and station identifiers from the map model', () => {
  for (const id of ['home', 'cafe', 'store', 'park', 'gym', 'library', 'west', 'central', 'east']) {
    assert.match(mapSource, new RegExp(`['\"]${id}['\"]`));
  }
});
