import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-list-dom-resolver.js', 'utf8');
const ids = [
  'listBackBtn', 'listFolderTitle', 'listNewFolderBtn', 'listNewFolderRow',
  'editShelfBtn', 'bulkEditBtn', 'undoBulkEditBtn', 'savedListItems',
  'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
  'bookshelfNextBtn', 'bookshelfPageLabel', 'smartListRow', 'historyListBtn',
  'unreadListBtn', 'groupAuthorBtn', 'dashboard',
];

function loadResolver() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-list-dom-resolver.js' });
  return context.MangaListDomResolver;
}

function rootWith(overrides = {}) {
  const nodes = Object.fromEntries(ids.map((id) => [id, { id }]));
  Object.assign(nodes, overrides);
  return {
    querySelectorAll(selector) {
      const id = selector.slice(1);
      return nodes[id] ? [nodes[id]] : [];
    },
  };
}

test('manga list DOM resolver exposes one frozen createSource API', () => {
  const resolver = loadResolver();
  assert.deepEqual(Object.keys(resolver), ['createSource']);
  assert.equal(Object.isFrozen(resolver), true);
  assert.equal(typeof resolver.createSource, 'function');
});

test('resolver returns the eighteen root-scoped DOM references', () => {
  const root = rootWith();
  const sourceObject = loadResolver().createSource(root);
  assert.deepEqual(Object.keys(sourceObject), ids);
  for (const id of ids) assert.equal(sourceObject[id].id, id);
  assert.equal(Object.prototype.hasOwnProperty.call(sourceObject, 'root'), false);
  assert.equal(Object.isFrozen(sourceObject), false);
});

test('resolver rejects invalid roots and identifies missing or duplicate ids', () => {
  const resolver = loadResolver();
  assert.throws(() => resolver.createSource(), /root/);
  assert.throws(() => resolver.createSource(null), /root/);
  assert.throws(() => resolver.createSource('root'), /root/);
  assert.throws(() => resolver.createSource({}), /querySelectorAll/);
  assert.throws(() => resolver.createSource(rootWith({ dashboard: undefined })), /dashboard/);
  assert.throws(() => resolver.createSource({
    querySelectorAll(selector) {
      if (selector === '#dashboard') return [{ id: 'dashboard' }, { id: 'dashboard' }];
      return [{ id: selector.slice(1) }];
    },
  }), /dashboard/);
});

test('resolver has no document search, fallback, listener, or service dependency', () => {
  assert.doesNotMatch(source, /document|getElementById|querySelector\(|localStorage|sessionStorage|MangaVault|Supabase|VPN|addEventListener|setTimeout|setInterval/);
  assert.doesNotMatch(source, /new Map|new Set|createElement|insertAdjacentHTML/);
});
