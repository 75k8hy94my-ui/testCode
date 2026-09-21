import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-list-filter-events.js', 'utf8');

function loadFactory() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-list-filter-events.js' });
  return context.MangaListFilterEventsFactory;
}

function button() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((candidate) => candidate !== handler));
    },
    click() {
      for (const handler of listeners.get('click') || []) handler({ type: 'click' });
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
  };
}

test('filter events factory exposes one frozen create API', () => {
  const factory = loadFactory();
  assert.ok(factory);
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.equal(Object.isFrozen(factory), true);
  assert.equal(typeof factory.create, 'function');
});

test('create requires all three callbacks and returns only a frozen bind API', () => {
  const factory = loadFactory();
  for (const key of ['onToggle', 'onApply', 'onClear']) {
    const deps = { onToggle() {}, onApply() {}, onClear() {} };
    delete deps[key];
    assert.throws(() => factory.create(deps), (error) => error.name === 'TypeError' && error.message.includes(key));
    for (const value of [undefined, null, 'bad', {}]) {
      const invalid = { onToggle() {}, onApply() {}, onClear() {} };
      invalid[key] = value;
      assert.throws(() => factory.create(invalid), (error) => error.name === 'TypeError' && error.message.includes(key));
    }
  }
  const instance = factory.create({ onToggle() {}, onApply() {}, onClear() {} });
  assert.deepEqual(Object.keys(instance), ['bind']);
  assert.equal(Object.isFrozen(instance), true);
});

test('bind maps each click to its callback once without passing the event', () => {
  const factory = loadFactory();
  const calls = [];
  const instance = factory.create({ onToggle() { calls.push('toggle'); }, onApply() { calls.push('apply'); }, onClear() { calls.push('clear'); } });
  const filterButton = button();
  const applyButton = button();
  const clearButton = button();
  const cleanup = instance.bind({ filterButton, applyButton, clearButton });
  assert.equal(typeof cleanup, 'function');
  filterButton.click();
  applyButton.click();
  clearButton.click();
  assert.deepEqual(calls, ['toggle', 'apply', 'clear']);
  assert.equal(filterButton.listenerCount('click'), 1);
  assert.equal(applyButton.listenerCount('click'), 1);
  assert.equal(clearButton.listenerCount('click'), 1);
});

test('bind rejects invalid buttons and duplicate binding', () => {
  const factory = loadFactory();
  const instance = factory.create({ onToggle() {}, onApply() {}, onClear() {} });
  const valid = button();
  for (const deps of [undefined, null, {}, { filterButton: valid }, { filterButton: {}, applyButton: valid, clearButton: valid }]) {
    assert.throws(() => instance.bind(deps), (error) => error.name === 'TypeError');
  }
  instance.bind({ filterButton: valid, applyButton: button(), clearButton: button() });
  assert.throws(() => instance.bind({ filterButton: button(), applyButton: button(), clearButton: button() }), (error) => error.name === 'TypeError');
  assert.equal(valid.listenerCount('click'), 1);
});

test('cleanup removes all handlers, is idempotent, and makes the instance terminal', () => {
  const factory = loadFactory();
  const calls = [];
  const instance = factory.create({ onToggle() { calls.push('toggle'); }, onApply() { calls.push('apply'); }, onClear() { calls.push('clear'); } });
  const filterButton = button();
  const applyButton = button();
  const clearButton = button();
  const cleanup = instance.bind({ filterButton, applyButton, clearButton });
  cleanup();
  cleanup();
  filterButton.click();
  applyButton.click();
  clearButton.click();
  assert.deepEqual(calls, []);
  assert.equal(filterButton.listenerCount('click'), 0);
  assert.equal(applyButton.listenerCount('click'), 0);
  assert.equal(clearButton.listenerCount('click'), 0);
  assert.throws(() => instance.bind({ filterButton: button(), applyButton: button(), clearButton: button() }), (error) => error.name === 'TypeError');
});

test('factory has no DOM search, global, persistence, timer, route, or rendering dependencies', () => {
  assert.doesNotMatch(source, /document|window|globalThis|querySelector|getElementById|localStorage|sessionStorage|MangaVault|Supabase|VPN|fetch|location|history|render|setTimeout|setInterval|requestAnimationFrame/);
});
