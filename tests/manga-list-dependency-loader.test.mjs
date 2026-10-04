import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../manga-list-dependency-loader.js', import.meta.url), 'utf8');

function createDocument({ autoLoad = false, failIdsOnce = [] } = {}) {
  const nodes = [];
  const byId = new Map();
  const failedIds = new Set(failIdsOnce);
  const onAppend = (node) => {
    nodes.push(node);
    if (node.id) byId.set(node.id, node);
    if (autoLoad && node.tagName === 'script') queueMicrotask(() => {
      const event = failedIds.has(node.id) ? 'error' : 'load';
      failedIds.delete(node.id);
      if (event === 'load') node.dataset.loaded = '1'; else node.remove();
      node.listeners[event]?.();
    });
  };
  const document = {
    head: { appendChild: onAppend },
    body: { appendChild: onAppend },
    createElement(tagName) {
      const node = {
        tagName,
        dataset: {},
        listeners: {},
        addEventListener(name, callback) { this.listeners[name] = callback; },
        remove() { this.removed = true; if (byId.get(this.id) === this) byId.delete(this.id); },
      };
      return node;
    },
    getElementById(id) { return byId.get(id) || null; },
    querySelectorAll() { return []; },
    nodes,
  };
  return document;
}

function loadFactory() {
  const context = { self: {} };
  vm.runInNewContext(source, context, { filename: 'manga-list-dependency-loader.js' });
  return context.self.MangaListDependencyLoaderFactory;
}

function resolveScript(script, type = 'load') {
  if (type === 'load') script.dataset.loaded = '1';
  script.listeners[type]?.();
}

test('core scripts start together, preserve ordered execution, and omit encrypted import modules', async () => {
  const factory = loadFactory();
  const documentRef = createDocument();
  const loader = factory.create({ documentRef });
  const pending = loader.loadCore();
  assert.strictEqual(loader.loadCore(), pending);
  await Promise.resolve();
  const scripts = documentRef.nodes.filter((node) => node.tagName === 'script');
  assert.ok(scripts.length >= 20, 'the shelf core is present');
  assert.equal(new Set(scripts.map((node) => node.id)).size, scripts.length);
  assert.ok(scripts.every((script) => script.async === false), 'dynamic classics execute in insertion order while fetching concurrently');
  for (const path of ['encrypted-asset-crypto.js', 'encrypted-asset-import.js', 'image-photo-processor.js']) {
    assert.ok(!scripts.some((script) => script.src.includes(path)), `${path} is not a core dependency`);
  }
  scripts.forEach((script) => resolveScript(script));
  await pending;
});

test('core preloads fetch script bytes without executing or reading shelf state', () => {
  const factory = loadFactory();
  const documentRef = createDocument({ autoLoad: true });
  const loader = factory.create({ documentRef });
  loader.preloadCore();
  assert.ok(documentRef.nodes.length >= 20);
  assert.ok(documentRef.nodes.every((node) => node.tagName === 'link' && node.rel === 'preload' && node.as === 'script'));
  assert.ok(!documentRef.nodes.some((node) => node.tagName === 'script'));
});

test('encrypted image dependencies are deferred, deduplicated, ordered, and retryable', async () => {
  const factory = loadFactory();
  const documentRef = createDocument({ autoLoad: true });
  const loader = factory.create({ documentRef });
  assert.equal(documentRef.nodes.length, 0, 'constructing a loader does not load scripts');
  const first = loader.ensureEncryptedImageImportDependencies();
  assert.strictEqual(loader.ensureEncryptedImageImportDependencies(), first);

  const expectedGroups = factory.ENCRYPTED_IMAGE_IMPORT_GROUPS;
  const expectedIds = Array.from(expectedGroups.flat(), (entry) => entry[1]);
  await first;
  assert.deepEqual(documentRef.nodes.filter((node) => node.tagName === 'script').map((node) => node.id), expectedIds);

  const retryDoc = createDocument({ autoLoad: true, failIdsOnce: [expectedIds[0]] });
  const retryLoader = factory.create({ documentRef: retryDoc });
  const failed = retryLoader.ensureEncryptedImageImportDependencies();
  await assert.rejects(failed);
  const retry = retryLoader.ensureEncryptedImageImportDependencies();
  assert.notStrictEqual(retry, failed);
  await retry;
  const loadedIds = retryDoc.nodes.filter((script) => script.tagName === 'script').map((script) => script.id);
  for (const id of expectedIds) assert.equal(loadedIds.filter((value) => value === id).length, id === expectedIds[0] ? 2 : 1, id);
});
