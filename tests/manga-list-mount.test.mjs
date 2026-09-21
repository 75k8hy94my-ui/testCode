import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-list-mount.js', 'utf8');

function loadFactory() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-list-mount.js' });
  return context.MangaListMountFactory;
}

function mountStub({ roots = [], onInsert } = {}) {
  let currentRoots = roots;
  return {
    insertAdjacentHTML(position, markup) {
      assert.equal(position, 'beforeend');
      assert.equal(typeof markup, 'string');
      if (onInsert) onInsert(markup);
      currentRoots = [{ id: 'mangaListSection' }];
    },
    querySelectorAll(selector) {
      assert.equal(selector, '#mangaListSection');
      return currentRoots;
    },
  };
}

const validDeps = {
  template: { createMarkup: () => '<div id="mangaListSection"></div>' },
  resolver: { createSource: (root) => ({ root }) },
  elementsFactory: { create: (source) => Object.freeze({ source }) },
};

test('mount factory exposes only frozen create and frozen mount instances', () => {
  const factory = loadFactory();
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.equal(Object.isFrozen(factory), true);
  const instance = factory.create(validDeps);
  assert.deepEqual(Object.keys(instance), ['mount']);
  assert.equal(Object.isFrozen(instance), true);
  assert.equal(typeof instance.mount, 'function');
});

test('mount factory rejects missing, null, and non-function dependencies', () => {
  const factory = loadFactory();
  assert.throws(() => factory.create(), /deps/);
  for (const value of [null, 'bad', [], 1]) assert.throws(() => factory.create(value), /deps/);
  for (const name of ['template', 'resolver', 'elementsFactory']) {
    const missing = { ...validDeps };
    delete missing[name];
    assert.throws(() => factory.create(missing), new RegExp(name));
    const invalid = { ...validDeps, [name]: null };
    assert.throws(() => factory.create(invalid), new RegExp(name));
  }
  for (const [name, method] of [['template', 'createMarkup'], ['resolver', 'createSource'], ['elementsFactory', 'create']]) {
    const invalid = { ...validDeps, [name]: { [method]: true } };
    assert.throws(() => factory.create(invalid), new RegExp(`${name}|${method}`));
  }
});

test('mount inserts markup once, resolves root, then resolver and elements in order', () => {
  const calls = [];
  const deps = {
    template: { createMarkup: () => { calls.push('markup'); return '<manga />'; } },
    resolver: { createSource: (root) => { calls.push('resolver'); return { root }; } },
    elementsFactory: { create: (source) => { calls.push('elements'); return Object.freeze({ source }); } },
  };
  const mount = mountStub({ onInsert: () => calls.push('insert') });
  const result = loadFactory().create(deps).mount(mount);
  assert.deepEqual(calls, ['markup', 'insert', 'resolver', 'elements']);
  assert.deepEqual(Object.keys(result), ['root', 'elements']);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.root.id, 'mangaListSection');
  assert.equal(Object.hasOwn(result, 'source'), false);
});

test('mount rejects invalid and already-mounted elements without adding markup', () => {
  const factory = loadFactory().create(validDeps);
  for (const value of [undefined, null, 'bad', 1, [], {}]) assert.throws(() => factory.mount(value), /mountElement/);
  assert.throws(() => factory.mount(mountStub({ roots: [{ id: 'mangaListSection' }] })), /mangaListSection/);
  let inserts = 0;
  const mount = mountStub({ onInsert: () => { inserts += 1; } });
  factory.mount(mount);
  assert.throws(() => factory.mount(mount), /mangaListSection/);
  assert.equal(inserts, 1);
});

test('mount rejects missing and duplicate roots and does not use global services', () => {
  const factory = loadFactory().create(validDeps);
  const missing = mountStub({ roots: [] });
  missing.insertAdjacentHTML = () => {};
  assert.throws(() => factory.mount(missing), /mangaListSection/);
  const duplicate = mountStub({ roots: [{}, {}] });
  assert.throws(() => factory.mount(duplicate), /mangaListSection/);
  assert.doesNotMatch(source, /document|window|localStorage|MangaVault|Supabase|VPN|addEventListener|setTimeout|history\.|controller|render\s*\(/);
});

test('existing template, resolver, and elements factory compose through the mount boundary', () => {
  const context = {};
  for (const file of ['manga-list-template.js', 'manga-list-dom-resolver.js', 'manga-list-elements.js', 'manga-list-mount.js']) {
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  const markup = context.MangaListTemplate.createMarkup();
  const ids = [...markup.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  const nodes = Object.fromEntries(ids.map((id) => [id, { id }]));
  const requiredIds = [
    'listBackBtn', 'listFolderTitle', 'listNewFolderBtn', 'listNewFolderRow',
    'editShelfBtn', 'bulkEditBtn', 'undoBulkEditBtn', 'savedListItems',
    'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
    'bookshelfNextBtn', 'bookshelfPageLabel', 'smartListRow', 'historyListBtn',
    'unreadListBtn', 'groupAuthorBtn', 'dashboard',
  ];
  nodes.mangaListSection.querySelectorAll = (selector) => {
    const id = selector.slice(1);
    return requiredIds.includes(id) && nodes[id] ? [nodes[id]] : [];
  };
  const mount = mountStub();
  mount.insertAdjacentHTML = (position, value) => {
    assert.equal(position, 'beforeend');
    assert.equal(value, markup);
    mount.querySelectorAll = (selector) => selector === '#mangaListSection' ? [nodes.mangaListSection] : [];
  };
  const result = context.MangaListMountFactory.create({
    template: context.MangaListTemplate,
    resolver: context.MangaListDomResolver,
    elementsFactory: context.MangaListElementsFactory,
  }).mount(mount);
  assert.equal(result.root, nodes.mangaListSection);
  assert.deepEqual(Object.keys(result.elements), [
    'listBackBtn', 'listFolderTitle', 'listNewFolderBtn', 'listNewFolderRow',
    'editShelfBtn', 'bulkEditBtn', 'undoBulkEditBtn', 'savedListItems',
    'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
    'bookshelfNextBtn', 'bookshelfPageLabel', 'smartListRow', 'historyListBtn',
    'unreadListBtn', 'groupAuthorBtn', 'dashboard',
  ]);
  assert.equal(Object.isFrozen(result.elements), true);
  assert.equal(Object.hasOwn(result.elements, 'videoListSection'), false);
  assert.equal(Object.hasOwn(result.elements, 'viewer'), false);
  assert.equal(Object.hasOwn(result.elements, 'savedListOverlay'), false);
});
