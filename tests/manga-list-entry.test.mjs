import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

function loadEntry() {
  const context = { self: {}, console };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'manga-list-entry.js'), 'utf8'), context);
  return context.self.MangaListEntryFactory;
}

function factory(name, calls, method, result) {
  return {
    create(deps) {
      calls.push(`${name}.create`);
      assert.equal(typeof deps, 'object');
      return { [method](...args) { calls.push([`${name}.${method}`, ...args]); return result; } };
    },
  };
}

function validDeps(calls) {
  const cleanup = () => calls.push('events.cleanup');
  const mounted = { root: { id: 'root' }, elements: { id: 'elements' } };
  const controller = { id: 'controller' };
  return {
    mountFactory: {
      create(deps) {
        calls.push('mount.create');
        assert.equal(typeof deps, 'object');
        return { mount() { calls.push('mount.mount'); return mounted; } };
      },
    },
    mountDeps: { template: {}, resolver: {}, elementsFactory: {} },
    stateRuntimeFactory: factory('state', calls, 'initialize', undefined),
    renderRuntimeFactory: factory('render', calls, 'render', undefined),
    controllerFactory: factory('controller', calls, 'create', controller),
    bootstrapFactory: {
      create(deps) {
        calls.push('bootstrap.create');
        return {
          bootstrap(input) {
            calls.push(['bootstrap.bootstrap', input]);
            const mountedResult = deps.mount(input.mountElement);
            const createdController = deps.createController(mountedResult.elements);
            deps.initialize();
            const cleanupEvents = deps.bindEvents(mountedResult.elements, createdController);
            deps.activate();
            deps.render();
            return { root: mountedResult.root, elements: mountedResult.elements, controller: createdController, cleanup: cleanupEvents };
          },
        };
      },
    },
    runtimeFactory: factory('runtime', calls, 'create', { id: 'runtime' }),
    contextFactory: factory('context', calls, 'create', { id: 'context' }),
    createContextDeps: ({ root: mountedRoot, elements }) => ({ mountedRoot, elements }),
    createStateDeps: ({ context, runtime }) => ({ context, runtime }),
    createRenderDeps: ({ context, runtime }) => ({ context, runtime }),
    createControllerDeps: ({ context, runtime }) => ({ context, runtime }),
    createEventBindings: ({ elements, controller, runtime }) => {
      calls.push(['events.bind', elements, controller, runtime]);
      return cleanup;
    },
    createActivation: ({ context, runtime, controller }) => {
      calls.push(['activation.create', context, runtime, controller]);
      return () => calls.push('activation');
    },
  };
}

test('entry factory exposes only create and validates required composition dependencies', () => {
  const entryFactory = loadEntry();
  assert.deepEqual(Object.keys(entryFactory), ['create']);
  assert.ok(Object.isFrozen(entryFactory));
  assert.throws(() => entryFactory.create(), (error) => error.name === 'TypeError');
  const deps = validDeps([]);
  for (const key of Object.keys(deps)) {
    const missing = { ...deps };
    delete missing[key];
    assert.throws(() => entryFactory.create(missing), (error) => error.name === 'TypeError' && error.message.includes(key));
  }
});

test('entry composes existing boundaries in bootstrap order and propagates cleanup', () => {
  const calls = [];
  const entry = loadEntry().create(validDeps(calls));
  assert.deepEqual(Object.keys(entry), ['start', 'cleanup']);
  assert.ok(Object.isFrozen(entry));

  const result = entry.start({ mountElement: { id: 'mount' } });
  assert.deepEqual(Object.keys(result), ['root', 'elements', 'controller']);
  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] : call), [
    'mount.create',
    'bootstrap.create',
    'bootstrap.bootstrap',
    'mount.mount',
    'context.create',
    'runtime.create',
    'state.create',
    'render.create',
    'controller.create',
    'state.initialize',
    'events.bind',
    'activation.create',
    'activation',
    'render.render',
  ]);
  entry.cleanup();
  entry.cleanup();
  assert.equal(calls.filter((call) => call === 'events.cleanup').length, 1);
  assert.throws(() => entry.start({ mountElement: {} }), (error) => error.name === 'TypeError');
});

test('entry uses injected shared runtime and does not mention reader or video scope', () => {
  const source = fs.readFileSync(path.join(root, 'manga-list-entry.js'), 'utf8');
  assert.match(source, /runtimeFactory/);
  assert.doesNotMatch(source, /reader\.html|videoListSection|savedListOverlay|document\.getElementById/);
  assert.doesNotMatch(source, /renderSavedList\s*\(/);
});
