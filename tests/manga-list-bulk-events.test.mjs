import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../manga-list-bulk-events.js', import.meta.url), 'utf8');

function factory() {
  const self = {};
  Function('self', source)(self);
  return self.MangaListBulkEventsFactory;
}

function button() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    click() { listeners.get('click')?.({ type: 'click' }); },
    get size() { return listeners.size; },
  };
}

test('bulk factory exposes only frozen create and bind APIs', () => {
  const value = factory();
  assert.ok(Object.isFrozen(value));
  assert.deepEqual(Object.keys(value), ['create']);
  const instance = value.create({ onEdit() {}, onUndo() {} });
  assert.ok(Object.isFrozen(instance));
  assert.deepEqual(Object.keys(instance), ['bind']);
});

test('bulk buttons invoke callbacks once without passing events', () => {
  const calls = [];
  const instance = factory().create({ onEdit: (...args) => calls.push(['edit', args]), onUndo: (...args) => calls.push(['undo', args]) });
  const editButton = button();
  const undoButton = button();
  instance.bind({ editButton, undoButton });
  editButton.click();
  undoButton.click();
  assert.deepEqual(calls, [['edit', []], ['undo', []]]);
});

test('bulk factory validates and provides terminal cleanup', () => {
  const value = factory();
  for (const key of ['onEdit', 'onUndo']) {
    const deps = { onEdit() {}, onUndo() {} };
    deps[key] = null;
    assert.throws(() => value.create(deps), (error) => error.name === 'TypeError' && error.message.includes(key));
  }
  const instance = value.create({ onEdit() {}, onUndo() {} });
  const editButton = button();
  const undoButton = button();
  const cleanup = instance.bind({ editButton, undoButton });
  assert.equal(editButton.size, 1);
  assert.equal(undoButton.size, 1);
  assert.throws(() => instance.bind({ editButton, undoButton }), (error) => error.name === 'TypeError');
  cleanup();
  cleanup();
  assert.equal(editButton.size, 0);
  assert.equal(undoButton.size, 0);
  assert.throws(() => instance.bind({ editButton, undoButton }), (error) => error.name === 'TypeError');
});

test('bulk factory has no application, overlay, storage, or global listener dependencies', () => {
  assert.doesNotMatch(source, /document|window|globalThis|localStorage|sessionStorage|bulkEditMode|bulkSelectedIds|renderSavedList|openReaderScreen|closeReaderScreen|persistAll|MangaVault|VPN|setTimeout|setInterval|requestAnimationFrame/);
});
