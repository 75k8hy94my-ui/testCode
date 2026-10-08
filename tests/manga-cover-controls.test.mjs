import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function node(tag = 'div') {
  const classes = new Set();
  return {
    tag, children: [], className: '', attributes: {}, listeners: {}, dataset: {}, style: {},
    classList: {
      add(name) { classes.add(name); },
      toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    replaceChildren(...children) { this.children = []; for (const child of children) this.appendChild(child); },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    click() {
      let stopped = false;
      this.listeners.click?.({ stopPropagation() { stopped = true; } });
      return stopped;
    }
  };
}

test('favorite icon is a real standalone SVG image with both visual states', () => {
  const route = read('manga-list-route.js');
  const start = route.indexOf('const makeHeartIcon = (active) => {');
  const end = route.indexOf('\n      const moveItemInList', start);
  assert.ok(start >= 0 && end > start, 'heart-icon builder remains in shelf route');
  const builder = new Function('documentRef',
    route.slice(start, end) + '\nreturn makeHeartIcon;')({ createElement: node });
  const normal = builder(false);
  const saved = builder(true);
  for (const image of [normal, saved]) {
    assert.equal(image.tag, 'img');
    assert.ok(image.src.startsWith('data:image/svg+xml,'), 'favorite image must have a source');
    assert.equal(image.alt, '');
    assert.equal(image.attributes['aria-hidden'], 'true');
    assert.match(decodeURIComponent(image.src.split(',')[1]), /<svg[^>]*viewBox="0 0 24 24"/);
  }
  assert.match(decodeURIComponent(normal.src), /fill="none"/);
  assert.match(decodeURIComponent(saved.src), /fill="#ff6b4a"/);
  assert.notEqual(normal.src, saved.src, 'saved state must visibly differ');
});

test('bulk selection checkbox is placed over the cover, never above it', () => {
  const context = {};
  vm.runInNewContext(read('manga-list-card.js'), context);
  const result = context.MangaListCardBoundary.createStaticCard({
    documentRef: { createElement: node },
    item: { id: 'volume-1', title: 'Volume 1' }, reorderMode: false,
    bulkEditMode: true, bulkSelected: new Set(), recentlyClosed: null,
    itemSubtext: () => '', itemDisplayTitle: (item) => item.title,
    readingRecordText: () => '未読', itemPageCountText: () => ''
  });
  assert.equal(result.card.children[0], result.cover);
  assert.equal(result.cover.children[0], result.img);
  assert.equal(result.cover.children[1], result.select);
  assert.equal(result.select.className, 'bulk-select');
  assert.match(result.select.attributes['aria-label'], /Volume 1/);
});

test('favorite click changes icon state and re-renders favorites page, not Reader', () => {
  const scope = { self: {} };
  vm.runInNewContext(read('manga-list-runtime.js'), scope);
  const item = { id: 'volume-1', url: 'https://example.test/page.jpg', favorite: true, title: 'Volume 1' };
  const state = { bulkEditMode: false, bulkSelectedIds: new Set(), currentFolderView: '__favorites__' };
  let saves = 0, renders = 0, readerOpens = 0;
  const context = new Proxy({
    getDocument: () => ({ createElement: node }),
    getElements: () => ({ savedListItems: node() }),
    getState: () => state,
    getConfig: () => ({ FAVORITES_FOLDER_ID: '__favorites__' }),
    createStaticCard: () => {
      const card = node();
      const cover = node();
      const img = node('img');
      cover.appendChild(img);
      card.appendChild(cover);
      return { card, cover, img, select: null, appendDetails() {} };
    },
    makeHeartIcon: (active) => { const img = node('img'); img.src = active ? 'filled' : 'outline'; return img; },
    setupFeedImage() {},
    persistAll() { saves++; },
    renderList() { renders++; },
    openReader() { readerOpens++; },
    itemSubtext: (x) => x.url,
    itemDisplayTitle: (x) => x.title
  }, { get(target, key) { return target[key] ?? (() => {}); } });
  const runtime = scope.self.MangaListRuntimeFactory.create(context);
  const card = runtime.buildBookCard(item, [item], false);
  const heart = card.children[0].children.find((element) => element.className === 'book-favBtn');
  assert.ok(heart);
  assert.equal(heart.attributes['aria-pressed'], 'true');
  assert.equal(heart.children[0].src, 'filled');
  assert.equal(heart.click(), true, 'favorite must not activate the book');
  assert.equal(item.favorite, false);
  assert.equal(heart.children[0].src, 'outline');
  assert.equal(heart.attributes['aria-pressed'], 'false');
  assert.equal(saves, 1);
  assert.equal(renders, 1, 'favorites list must recompute when the last item is removed');
  assert.equal(readerOpens, 0);
});

test('all cover controls stay above status overlays and remain visible during normal paging', () => {
  const css = read('manga-list.css');
  const runtime = read('manga-list-runtime.js');
  assert.match(css, /\.book-delBtn, \.book-favBtn\s*\{[^}]*z-index:\s*4/);
  assert.match(css, /\.book-favBtn\.is-favorite\s*\{/);
  assert.match(css, /\.book-favBtn img\s*\{[^}]*width:\s*18px/);
  assert.match(css, /\.book-cover > \.bulk-select\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.book-moveBtn\s*\{[^}]*z-index:\s*4/);
  assert.match(css, /\.book-cover-loading,\s*\.book-cover-retry\s*\{[^}]*z-index:\s*2/);
  assert.match(runtime, /context\.renderList\(\);\s*\}\s*\}\);\s*cover\.appendChild\(favBtn\)/);
  assert.doesNotMatch(read('reader.html'), /manga-cover-controls/);
});
