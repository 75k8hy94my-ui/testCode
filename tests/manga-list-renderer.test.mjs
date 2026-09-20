import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const source = read('manga-list-renderer.js');
const context = { document: { createDocumentFragment() {
  return { children: [], appendChild(node) { this.children.push(node); } };
} } };
vm.runInNewContext(source, context);
const render = context.MangaListRenderer?.render;

function elements() {
  return {
    savedListItems: { children: [], appendChild(node) { this.children.push(...(node.children || [node])); } },
    savedListEmpty: { style: {}, textContent: '' },
    bookshelfPagination: { style: {} },
    bookshelfPrevBtn: {},
    bookshelfNextBtn: {},
    bookshelfPageLabel: { textContent: '' }
  };
}

test('renderer exposes one DOM-boundary API without global lookups or forbidden services', () => {
  assert.equal(typeof render, 'function');
  assert.doesNotMatch(source, /\b(document\.getElementById|document\.querySelector|localStorage|MangaVault|Supabase|VPN|fetch|addEventListener|location\.|history\.)/);
  assert.equal((source.match(/root\.MangaListRenderer\s*=/g) || []).length, 1);
});

test('renderer creates cards in order with the original list and mode', () => {
  const els = elements();
  const items = [{ id: 'a' }, { id: 'b' }];
  const list = [{ id: 'a' }, { id: 'b' }];
  const calls = [];
  render({ elements: els, items, list, reorderMode: true, createCard: (item, passedList, mode) => {
    calls.push([item.id, passedList, mode]);
    return { id: item.id };
  }, empty: false, emptyText: '', page: 1, totalPages: 2 });
  assert.deepEqual(calls, [['a', list, true], ['b', list, true]]);
  assert.deepEqual(els.savedListItems.children.map((item) => item.id), ['a', 'b']);
  assert.deepEqual(items, [{ id: 'a' }, { id: 'b' }]);
  assert.equal(els.bookshelfPagination.style.display, 'flex');
  assert.equal(els.bookshelfPrevBtn.disabled, true);
  assert.equal(els.bookshelfNextBtn.disabled, false);
  assert.equal(els.bookshelfPageLabel.textContent, '1 / 2');
});

test('renderer handles empty and final-page states without creating cards', () => {
  const els = elements();
  let count = 0;
  render({ elements: els, items: [], list: [], reorderMode: false, createCard: () => { count++; },
    empty: true, emptyText: '空です', page: 8, totalPages: 1 });
  assert.equal(count, 0);
  assert.equal(els.savedListEmpty.style.display, 'block');
  assert.equal(els.savedListEmpty.textContent, '空です');
  assert.equal(els.bookshelfPagination.style.display, 'none');
  assert.equal(els.bookshelfPrevBtn.disabled, true);
  assert.equal(els.bookshelfNextBtn.disabled, true);
  assert.equal(els.bookshelfPageLabel.textContent, '1 / 1');
});
