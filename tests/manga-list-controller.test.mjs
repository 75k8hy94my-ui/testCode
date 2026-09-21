import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-list-controller.js', 'utf8');

function loadFactory() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-list-controller.js' });
  return context.MangaListControllerFactory;
}

test('controller factory exposes one frozen create API', () => {
  const factory = loadFactory();
  assert.ok(factory);
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.equal(Object.isFrozen(factory), true);
});

test('controller factory preserves function references and freezes the controller', () => {
  const factory = loadFactory();
  const deps = {
    init() { return 'init'; },
    render(value) { return ['render', value]; },
    open(...args) { return args; },
    activate() { return 'activate'; },
    getElements() { return 'elements'; },
  };
  const controller = factory.create(deps);
  assert.deepEqual(Object.keys(controller), ['init', 'render', 'open', 'activate', 'getElements']);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(controller.init, deps.init);
  assert.equal(controller.render, deps.render);
  assert.equal(controller.open, deps.open);
  assert.equal(controller.activate, deps.activate);
  assert.equal(controller.getElements, deps.getElements);
  assert.deepEqual(controller.open(false, false), [false, false]);
  assert.deepEqual(controller.render('page'), ['render', 'page']);
});

test('controller factory rejects every missing or non-function dependency', () => {
  const factory = loadFactory();
  for (const key of ['init', 'render', 'open', 'activate', 'getElements']) {
    const missingDeps = { init() {}, render() {}, open() {}, activate() {}, getElements() {} };
    delete missingDeps[key];
    assert.throws(() => factory.create(missingDeps), (error) => error.name === 'TypeError' && error.message.includes(key));
    for (const value of [undefined, null, 'bad', {}, 1]) {
      const invalidDeps = { init() {}, render() {}, open() {}, activate() {}, getElements() {} };
      invalidDeps[key] = value;
      assert.throws(() => factory.create(invalidDeps), (error) => error.name === 'TypeError' && error.message.includes(key));
    }
  }
});

test('controller factory has no browser or persistence dependencies', () => {
  assert.doesNotMatch(source, /document|window|localStorage|sessionStorage|MangaVault|Supabase|VPN|addEventListener|setTimeout|setInterval|new Map|new Set/);
});
