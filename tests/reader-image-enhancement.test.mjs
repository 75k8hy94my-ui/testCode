import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { self: {}, console };
const moduleUrl = new URL('../reader-image-enhancement.js', import.meta.url);
if (fs.existsSync(moduleUrl)) vm.runInNewContext(fs.readFileSync(moduleUrl, 'utf8'), context);
const enhancement = context.self.ReaderImageEnhancement;

test('reader auto-correction locally lifts a dark scan while preserving alpha', () => {
  assert.ok(enhancement, 'ReaderImageEnhancement must exist');
  const imageData = { data: new Uint8ClampedArray([0, 0, 0, 255, 30, 30, 30, 128, 60, 60, 60, 0]) };
  assert.equal(enhancement.autoCorrectImageData(imageData), true);
  assert.ok(imageData.data[4] > 30);
  assert.equal(imageData.data[3], 255);
  assert.equal(imageData.data[7], 128);
  assert.equal(imageData.data[11], 0);
});

test('reader auto-correction leaves already balanced white artwork unchanged', () => {
  assert.ok(enhancement, 'ReaderImageEnhancement must exist');
  const data = new Uint8ClampedArray(256 * 4);
  for (let value = 0; value < 256; value += 1) data.set([value, value, value, 255], value * 4);
  const imageData = { data };
  const before = Array.from(imageData.data);
  assert.equal(enhancement.autoCorrectImageData(imageData), false);
  assert.deepEqual(Array.from(imageData.data), before);
});
