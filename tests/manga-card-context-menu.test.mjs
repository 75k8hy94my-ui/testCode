import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

class FakeNode {
  constructor() { this.children = []; this.handlers = {}; this.style = {}; this.attrs = {}; this.hidden = false; }
  addEventListener(type, callback) { (this.handlers[type] ||= []).push(callback); }
  removeEventListener(type, callback) { this.handlers[type] = (this.handlers[type] || []).filter(fn => fn !== callback); }
  dispatch(type, event = {}) { for (const fn of this.handlers[type] || []) fn(event); }
  appendChild(child) { this.children.push(child); child.parent = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  setAttribute(name, value) { this.attrs[name] = value; }
  getAttribute(name) { return this.attrs[name]; }
  closest(selector) { return selector === '.book-card[data-manga-item-id]' && this.attrs['data-manga-item-id'] ? this : null; }
  getBoundingClientRect() { return { width: 200, height: 96 }; }
  focus() { this.focused = true; }
}
function setup({ desktop = true, allowed = true } = {}) {
  const context = { self: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../manga-card-context-menu.js', import.meta.url), 'utf8'), context);
  const doc = new FakeNode();
  doc.body = new FakeNode();
  const win = new FakeNode();
  win.innerWidth = 400; win.innerHeight = 270;
  win.matchMedia = () => ({ matches: desktop });
  const shelf = new FakeNode();
  const card = new FakeNode();
  card.setAttribute('data-manga-item-id', 'book-1');
  shelf.appendChild(card);
  const actions = [];
  const controller = context.self.MangaCardContextMenu.create({
    documentRef: doc, windowRef: win, mountElement: shelf,
    getItem: id => id === 'book-1' ? { id } : null,
    canReadProtectedData: () => allowed,
    onEdit: item => actions.push(['edit', item.id]),
    onSafeOpen: item => actions.push(['safe', item.id])
  });
  const menu = doc.body.children[0];
  const rightClick = (target = card) => {
    let prevented = false;
    shelf.dispatch('contextmenu', { target, clientX: 390, clientY: 265, preventDefault() { prevented = true; } });
    return prevented;
  };
  return { doc, shelf, card, menu, actions, controller, rightClick };
}
test('right-clicking a card shows two actions instead of the browser menu', () => {
  const s = setup();
  assert.equal(s.rightClick(), true);
  assert.equal(s.menu.hidden, false);
  assert.deepEqual(s.menu.children.map(button => button.textContent), ['編集', 'セーフモードで開く']);
  assert.equal(s.menu.style.left, '192px');
  assert.equal(s.menu.style.top, '166px');
  s.menu.children[0].dispatch('click');
  assert.deepEqual(s.actions, [['edit', 'book-1']]);
  assert.equal(s.menu.hidden, true);
  s.controller.destroy();
  assert.equal(s.doc.body.children.length, 0);
});
test('safe action and close behaviors work', () => {
  const s = setup();
  s.rightClick();
  s.menu.children[1].dispatch('click');
  assert.deepEqual(s.actions, [['safe', 'book-1']]);
  s.rightClick();
  s.doc.dispatch('keydown', { key:'Escape', preventDefault() {} });
  assert.equal(s.menu.hidden, true);
  s.rightClick();
  s.doc.dispatch('pointerdown', { target:s.card });
  assert.equal(s.menu.hidden, true);
  s.controller.destroy();
});
test('no override on empty shelf, coarse pointer, or blocked data', () => {
  for (const options of [{}, { desktop:false }, { allowed:false }]) {
    const s = setup(options);
    const target = Object.keys(options).length ? s.card : new FakeNode();
    assert.equal(s.rightClick(target), false);
    assert.equal(s.menu.hidden, true);
    s.controller.destroy();
  }
});
