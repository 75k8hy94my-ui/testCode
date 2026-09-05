const test = require('node:test');
const assert = require('node:assert/strict');
const picker = require('../extension/content/element-picker.js');

test('picker state does not start twice and stops cleanly', () => {
  const state = picker.createPickerState();
  assert.equal(state.start(), true);
  assert.equal(state.start(), false);
  assert.equal(state.active, true);
  assert.equal(state.stop(), true);
  assert.equal(state.active, false);
});