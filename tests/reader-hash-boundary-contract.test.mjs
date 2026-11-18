import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL('../'+file, import.meta.url), 'utf8');
const reader = read('reader-runtime.js');
test('hash iframe boundary retains bounded correction and cancellation', () => {
  assert.match(reader, /function cancelHashCorrections\(\)/);
  assert.match(reader, /hashCorrectionGeneration \+= 1/);
  assert.match(reader, /for \(const delay of \[0, 45, 150, 360\]\)/);
  assert.match(reader, /ownGeneration !== hashCorrectionGeneration/);
  assert.match(reader, /function disposeHashObservation\(iframe\)/);
  assert.match(reader, /removeEventListener\?\.\('keydown', entry\.onChildKeydown, true\)/);
});
test('cross-origin restrictions remain explicit and protected page state is not inferred', () => {
  assert.match(reader, /catch \(_\) \{ return false; \} \/\/ A cross-origin iframe exposes no URL/);
  assert.match(reader, /hashConfirmedPages\.has\(number - 1\)/);
  assert.match(reader, /readerKeyboardSink/);
  assert.match(reader, /win\.setInterval\(reclaimHashKeyboardFocus, 80\)/);
  assert.match(read('reader.html'), /id="readerKeyboardSink"/);
});
