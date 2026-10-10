import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../vault-history-ui.js', import.meta.url), 'utf8');
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = new Map(); this.attributes = {}; this.dataset = {}; this.parentNode = null; this.textContent = ''; this.disabled = false; }
  append(...items) { for (const item of items) { item.parentNode = this; this.children.push(item); } }
  replaceChildren(...items) { this.children.forEach((item) => { item.parentNode = null; }); this.children = []; this.append(...items); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, handler) { this.listeners.set(name, [...(this.listeners.get(name) || []), handler]); }
  removeEventListener(name, handler) { this.listeners.set(name, (this.listeners.get(name) || []).filter((item) => item !== handler)); }
  click() { for (const handler of this.listeners.get('click') || []) handler({ target: this }); }
  insertAdjacentElement(position, node) { assert.equal(position, 'afterend'); const parent = this.parentNode; const index = parent.children.indexOf(this); node.parentNode = parent; parent.children.splice(index + 1, 0, node); }
  remove() { if (!this.parentNode) return; const siblings = this.parentNode.children; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null; }
  closest(selector) { return selector === '.profileCard' ? this.card : null; }
}
function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, handler) { listeners.set(name, [...(listeners.get(name) || []), handler]); },
    removeEventListener(name, handler) { listeners.set(name, (listeners.get(name) || []).filter((item) => item !== handler)); },
    dispatch(name, detail) { for (const handler of listeners.get(name) || []) handler({ detail }); },
  };
}
function makeUi({ unlocked = false, allowed = false, rows = [] } = {}) {
  const parent = new Element('div');
  const card = new Element('section');
  card.className = 'profileCard';
  card.parentNode = parent;
  parent.children.push(card);
  const anchor = new Element('a');
  anchor.card = card;
  card.append(anchor);
  const doc = eventTarget();
  doc.createElement = (tag) => new Element(tag);
  doc.querySelector = (selector) => selector === '.profileCard a[href="sync.html"]' ? anchor : null;
  const win = eventTarget();
  let listCalls = 0, previewCalls = 0, confirmCalls = 0;
  const data = { items: [{ id: 'private-id', title: 'private title' }] };
  const vault = {
    loadActive: () => unlocked ? { rawKey: 'ephemeral' } : null,
    async listVaultHistory() { listCalls++; return rows; },
    async previewVaultHistoryRestore() { previewCalls++; return { baseRevision: 6, changes: [{ type: 'change', path: '/items/private-id/title' }] }; },
    async confirmVaultHistoryRestore() { confirmCalls++; return { revision: 7 }; },
    async setVaultHistoryProtected() { return true; },
  };
  const context = { window: win, document: doc };
  vm.runInNewContext(source, context, { filename: 'vault-history-ui.js' });
  const cleanup = win.MangaVaultHistoryUI.mount({
    vault, payload: { normalize: (value) => value },
    history: { diffVaultSnapshots: () => [{ type: 'change', path: '/items/private-id/title' }] },
    access: { canReadProtectedData: () => allowed }, documentRef: doc, windowRef: win,
  });
  return { parent, win, doc, cleanup, get listCalls() { return listCalls; }, get previewCalls() { return previewCalls; }, get confirmCalls() { return confirmCalls; } };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function find(root, predicate) { if (predicate(root)) return root; for (const child of root.children) { const hit = find(child, predicate); if (hit) return hit; } return null; }

test('locked or blocked history UI displays a neutral prompt without fetching', async () => {
  const ui = makeUi();
  await tick();
  const status = find(ui.parent, (node) => node.attributes?.['aria-live'] === 'polite');
  assert.match(status.textContent, /保管庫を解除/);
  assert.equal(ui.listCalls, 0);
  ui.cleanup();
});

test('unlocked history shows local summaries and explicit restore confirmation; lock clears decrypted UI', async () => {
  const ui = makeUi({ unlocked: true, allowed: true, rows: [
    { historyId: 'older', revision: 5, updatedAt: '2026-10-10T00:00:00Z', protected: false, payload: { items: [{ id: 'private-id', title: 'private title' }] } },
    { historyId: 'latest', revision: 6, updatedAt: '2026-10-11T00:00:00Z', protected: true, payload: { items: [{ id: 'private-id', title: 'latest' }] } },
  ] });
  await tick();
  assert.equal(ui.listCalls, 1);
  const summary = find(ui.parent, (node) => node.textContent.startsWith('現在との差分'));
  assert.match(summary.textContent, /変更 1/);
  assert.doesNotMatch(summary.textContent, /private title|private-id/);
  const restore = find(ui.parent, (node) => node.textContent === 'この状態を復元');
  restore.click();
  await tick();
  assert.equal(ui.previewCalls, 1);
  const confirm = find(ui.parent, (node) => node.textContent === '確認して復元');
  assert.ok(confirm);
  confirm.click();
  await tick();
  assert.equal(ui.confirmCalls, 1);
  ui.win.dispatch('manga-vault-cleared');
  const status = find(ui.parent, (node) => node.attributes?.['aria-live'] === 'polite');
  assert.match(status.textContent, /保管庫を解除/);
  assert.equal(find(ui.parent, (node) => node.textContent === 'この状態を復元'), null);
  ui.cleanup();
});
