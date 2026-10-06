import test from 'node:test';
import assert from 'node:assert/strict';
import '../manga-import-validator.js';
import '../manga-import-candidate.js';
import '../manga-import-dialog.js';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {}; this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this._text = ''; this.parentNode = null; this.className = ''; }
  set id(value) { this.attributes.id = value; }
  get id() { return this.attributes.id || ''; }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); }
  querySelector(selector) { const match = selector.match(/^#([\w-]+)$/); const cls = selector.match(/^\.([\w-]+)$/); for (const child of this.children) { if ((match && child.attributes.id === match[1]) || (cls && child.className.split(/\s+/).includes(cls[1]))) return child; const nested = child.querySelector(selector); if (nested) return nested; } return null; }
  querySelectorAll(selector) { const out = []; const match = selector.match(/^\.([\w-]+)$/); for (const child of this.children) { if (match && child.className.split(/\s+/).includes(match[1])) out.push(child); out.push(...child.querySelectorAll(selector)); } return out; }
  closest() { return this; }
}
function makeDocument() {
  const body = new Element('body'); const dialog = new Element('section'); dialog.id = 'mangaImportDialog';
  const rows = new Element('div'); rows.id = 'mangaImportRows'; const status = new Element('p'); status.id = 'mangaImportStatus';
  dialog.append(rows, status); body.append(dialog);
  return { body, createElement: tag => new Element(tag), querySelector: selector => body.querySelector(selector) };
}
const candidate = (n = '123') => ({ schemaVersion: 1, title: `Title ${n}`, author: 'Artist', circleName: 'Circle', sourceWork: '', tags: ['one', 'two'], sourceUrl: `https://momon-ga.com/fanzine/mo${n}/`, pages: [`https://z1.momon-ga.me/galleries/${n}/1.webp`], fallbackPagePattern: null });
const row = (id, c, warnings = []) => ({ queueId: id, candidate: c, addedAt: 1, warnings });

test('dialog shows external candidate text and extraction warnings via textContent, detects duplicates, and preserves queue identity', () => {
  const documentRef = makeDocument(); const dialog = MangaImportDialog.create({ documentRef, validator: MangaImportValidator, candidateFactory: MangaImportCandidate });
  dialog.open([row('q1', candidate(), ['multiple authors were found'])], [{ id: 'old', sourceUrl: candidate().sourceUrl }], []);
  const root = dialog.element;
  assert.match(root.textContent, /multiple authors were found/);
  assert.match(root.textContent, /既に本棚に登録されています/);
  const selection = dialog.getSelection();
  assert.deepEqual(selection.items, []);
  const check = root.querySelector('#mangaImportInclude-q1'); check.checked = true;
  const selected = dialog.getSelection();
  assert.deepEqual(selected.items.map(x => x.queueId), ['q1']);
  assert.deepEqual(selected.explicitDuplicateIds, ['q1']);
  dialog.close(); assert.equal(root.hidden, true);
});
test('metadata edits and exclusion are reflected while page URLs stay read-only', () => {
  const documentRef = makeDocument(); const dialog = MangaImportDialog.create({ documentRef, validator: MangaImportValidator, candidateFactory: MangaImportCandidate });
  dialog.open([row('q2', candidate('124'))], [], []);
  const root = dialog.element; root.querySelector('#mangaImportTitle-q2').value = 'Edited <title>';
  root.querySelector('#mangaImportTags-q2').value = 'new, tags';
  const pageField = root.querySelector('#mangaImportPages-q2'); assert.equal(pageField.tagName.toLowerCase(), 'ul');
  root.querySelector('#mangaImportInclude-q2').checked = true;
  const chosen = dialog.getSelection();
  assert.equal(chosen.items[0].candidate.title, 'Edited <title>');
  assert.deepEqual(chosen.items[0].candidate.tags, ['new', 'tags']);
  assert.equal(chosen.items[0].candidate.pages[0], candidate('124').pages[0]);
  dialog.close();
});
test('invalid page lists cannot be selected; correctable metadata errors can be reviewed and edited', () => {
  const documentRef = makeDocument(); const dialog = MangaImportDialog.create({ documentRef, validator: MangaImportValidator, candidateFactory: MangaImportCandidate });
  const badPage = { ...candidate('125'), pages: [] };
  dialog.open([row('q3', badPage), row('q4', { ...candidate('126'), author: '' })], [], []);
  const root = dialog.element;
  assert.equal(root.querySelector('#mangaImportInclude-q3').disabled, true);
  assert.match(root.textContent, /Invalid page list/);
  root.querySelector('#mangaImportInclude-q4').checked = true;
  assert.equal(dialog.getSelection().items[0].candidate.author, '');
  root.querySelector('#mangaImportAuthor-q4').value = 'Corrected';
  root.querySelector('#mangaImportInclude-q4').checked = true;
  assert.equal(dialog.getSelection().items[0].candidate.author, 'Corrected');
});
