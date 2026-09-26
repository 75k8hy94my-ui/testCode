import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'game', 'game.js'), 'utf8');

test('game keeps a timer fallback when requestAnimationFrame is unavailable', () => {
  assert.match(source, /const requestFrame = typeof window\.requestAnimationFrame === "function"/);
  assert.match(source, /window\.setTimeout\(\(\) => callback\(performance\.now\(\)\), 16\)/);
  assert.match(source, /requestFrame\(frame\)/);
});

test('game reports an unavailable canvas context instead of failing silently', () => {
  assert.match(source, /typeof canvas\.getContext === "function"/);
  assert.match(source, /Canvas API を利用できません/);
});

test('game surfaces uncaught runtime errors on the game surface', () => {
  assert.match(source, /window\.addEventListener\("error"/);
  assert.match(source, /window\.addEventListener\("unhandledrejection"/);
  assert.match(source, /ゲームの実行中にエラーが発生しました/);
});
