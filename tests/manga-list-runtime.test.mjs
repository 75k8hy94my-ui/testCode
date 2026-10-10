import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('manga list runtime module exposes the four context-aware operations', () => {
  const source = read('manga-list-runtime.js');
  const context = { self: {} };
  vm.runInNewContext(source, context, { filename: 'manga-list-runtime.js' });
  assert.deepEqual(Object.keys(context.self.MangaListRuntimeFactory), ['create']);
  const runtime = context.self.MangaListRuntimeFactory.create(new Proxy({}, { get: () => () => {} }));
  assert.deepEqual(Object.keys(runtime), [
    'renderSavedList',
    'buildBookCard',
    'buildFolderCard',
    'handleMangaCardOpen'
  ]);
  assert.equal(Object.isFrozen(context.self.MangaListRuntimeFactory), true);
  assert.equal(Object.isFrozen(runtime), true);
});

test('manga route loads the list runtime while Reader has no shelf runtime dependency', () => {
  const route = read('manga-list-route.js');
  const reader = read('reader.html');
  assert.match(route, /manga-list-runtime\.js\?v=/);
  assert.match(route, /MangaListRuntimeFactory\.create\(/);
  assert.doesNotMatch(reader, /manga-list-runtime|MangaListRuntimeFactory/);
});

test('shared runtime has no direct reader or global DOM dependency', () => {
  const source = read('manga-list-runtime.js');
  assert.doesNotMatch(source, /\b(?:window|document|mangaListEls|MangaListViewModel|MangaListRenderer|renderSavedListWithContext|buildBookCardWithContext|buildFolderCardWithContext|handleMangaCardOpenWithContext)\b/);
});

test('card opening delegates the entire reader strategy to openReader', () => {
  const source = read('manga-list-runtime.js');
  const start = source.indexOf('function handleMangaCardOpen(');
  const end = source.indexOf('\n    function buildFolderCard(', start);
  const body = source.slice(start, end);
  assert.match(body, /return context\.openReader\(item, list\);/);
  assert.doesNotMatch(body, /getReaderScreen|rememberReaderReturnView|navigateReaderScreen|switchListTab|closeSavedList|setReadingListContext|flashStatus|openItem/);
});

test('single-item folder opening uses the same injected reader strategy', () => {
  const source = read('manga-list-runtime.js');
  const start = source.indexOf('if (folderItems.length === 1)');
  const end = source.indexOf('\n        }', start);
  const body = source.slice(start, end);
  assert.match(body, /context\.openReader\(folderItems\[0\], folderItems\);/);
  assert.doesNotMatch(body, /rememberReaderReturnView|closeSavedList|setReadingListContext|flashStatus|openItem/);
});

test('runtime no longer names reader-viewer-only opening dependencies', () => {
  const source = read('manga-list-runtime.js');
  assert.doesNotMatch(source, /rememberReaderReturnView|closeSavedList|setReadingListContext|flashStatus|openItem/);
});

test('encrypted works use their encrypted-cover route rather than URL guessing', () => {
  const source = read('manga-list-runtime.js');
  assert.match(source, /item\.encryptedAssets\?\.pages\?\.length/);
  assert.match(source, /context\.loadLocalCover\(item, img\)/);
  const route = read('manga-list-route.js');
  assert.match(route, /loadEncryptedCover/);
  assert.match(route, /EncryptedAssetReader\.createPreviewLoader/);
  assert.match(route, /!item\.encryptedAssets\?\.pages\?\.length/);
  assert.doesNotMatch(route, /activeEncryptedImport\.abort\(\)/);
});

test('folder deletion records every affected stable ID before persisting local deletions', async () => {
  const nodes = [];
  const node = () => {
    const value = { children: [], className: '', textContent: '', addEventListener(type, callback) { (this.events ||= {})[type] = callback; }, appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); } };
    nodes.push(value); return value;
  };
  const folder = { id: 'folder-1', name: 'Folder' };
  const item = { id: 'manga/1', folderId: folder.id };
  const state = { savedItems: [item], savedFolders: [folder], recentlyClosedFolderId: null };
  const events = [];
  const context = new Proxy({
    getDocument: () => ({ createElement: node }), getConfig: () => ({ HISTORY_FOLDER_ID: 'history', ICON_FOLDER: 'folder' }),
    getState: () => state, getVisibleItems: () => state.savedItems, appendFolderPreview() {}, confirmAction: () => true,
    setState: (patch) => Object.assign(state, patch), pointerPath: (collection, id) => `/${collection}/${String(id).replace(/~/g, '~0').replace(/\//g, '~1')}`,
    async recordSyncDeletion(paths, mutate) { events.push(['journal', paths]); await mutate(); },
    persistItems() { events.push(['persist-items']); return true; }, persistFolders() { events.push(['persist-folders']); return true; },
    renderList() { events.push(['render']); }, moveFolderInList() {}, createStaticCard() {},
  }, { get(target, property) { return target[property] || (() => {}); } });
  const runtimeContext = { self: {} };
  vm.runInNewContext(read('manga-list-runtime.js'), runtimeContext);
  runtimeContext.self.MangaListRuntimeFactory.create(context).buildFolderCard(folder, [folder], true);
  const deleteButton = nodes.find((candidate) => candidate.className === 'book-delBtn');

  await deleteButton.events.click({ stopPropagation() {} });

  assert.deepEqual(events[0], ['journal', ['/items/manga~11', '/folders/folder-1']]);
  assert.deepEqual(events.slice(1), [['persist-items'], ['persist-folders'], ['render']]);
  assert.deepEqual(state.savedItems, []);
  assert.deepEqual(state.savedFolders, []);
});


function createSlidingShelfHarness({ mobile = true, reducedMotion = false } = {}) {
  const animations = [];
  const makeNode = (tag = 'div') => {
    const node = {
      tag, children: [], parentElement: null, className: '', textContent: '', style: {},
      classList: { add() {}, toggle() {} },
      appendChild(child) {
        if (child.parentElement) child.parentElement.removeChild(child);
        this.children.push(child); child.parentElement = this;
        return child;
      },
      append(...children) { for (const child of children) this.appendChild(child); },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parentElement = null;
        return child;
      },
      replaceChildren(...children) {
        for (const child of this.children) child.parentElement = null;
        this.children = [];
        for (const child of children) this.appendChild(child);
      },
      contains(child) { return child === this || this.children.some((c) => c.contains(child)); },
      animate(frames, options) {
        let resolve;
        const finished = new Promise((r) => { resolve = r; });
        const animation = { frames, options, finished, cancel() { this.cancelled = true; }, complete: resolve };
        animations.push(animation);
        return animation;
      }
    };
    Object.defineProperty(node, 'innerHTML', { set(value) { if (value === '') this.replaceChildren(); } });
    return node;
  };
  const root = makeNode();
  const pagination = makeNode();
  const button = () => ({ style: {}, classList: { toggle() {} }, textContent: '', disabled: false });
  const elements = {
    savedListItems: root, bookshelfPagination: pagination, savedListEmpty: button(),
    bookshelfPrevBtn: button(), bookshelfNextBtn: button(), bookshelfPageLabel: button(),
    listBackBtn: button(), listNewFolderBtn: button(), editShelfBtn: button(),
    listNewFolderRow: button(), listFolderTitle: button(), bulkEditBtn: button(),
    smartListRow: button(), historyListBtn: button(), unreadListBtn: button(), groupAuthorBtn: button()
  };
  const state = {
    currentFolderView: null, currentAuthorView: null, currentSeriesView: null,
    savedItems: [], savedFolders: [], shelfSearchQuery: '', shelfFilters: {},
    shelfSort: 'added-desc', bookshelfPage: 1
  };
  const doc = {
    createElement: makeNode,
    defaultView: { matchMedia(q) { return { matches: q.includes('max-width') ? mobile : reducedMotion }; } }
  };
  const ctx = new Proxy({
    getDocument: () => doc, getState: () => state,
    setState: (patch) => Object.assign(state, patch), getElements: () => elements,
    getConfig: () => ({
      SERIES_FOLDER_ID: 'series', FAVORITES_FOLDER_ID: 'favorites',
      UNREAD_FOLDER_ID: 'unread', SYNCED_FOLDER_ID: 'synced', HISTORY_FOLDER_ID: 'history'
    }),
    getSavedVideos: () => [], shelfVisibleItems: () => [], unreadOrderItems: () => [],
    renderDashboard() {}, renderAuthorDashboard() {}, updateBulkEditButton() {},
    deriveViewModel: () => ({
      itemsList: [], folderCards: [], totalPages: 2, normalizedPage: state.bookshelfPage,
      totalEntries: 1, visibleEntries: [{ type: 'item', item: { id: 'page-' + state.bookshelfPage } }]
    }),
    renderCards({ elements: e, items }) {
      for (const entry of items) {
        const card = makeNode();
        card.textContent = entry.item.id;
        e.savedListItems.appendChild(card);
      }
      e.bookshelfPrevBtn.disabled = state.bookshelfPage === 1;
      e.bookshelfNextBtn.disabled = state.bookshelfPage === 2;
    }
  }, { get(target, property) { return target[property] || (() => {}); } });
  const vmContext = { self: {} };
  vm.runInNewContext(read('manga-list-runtime.js'), vmContext);
  return { runtime: vmContext.self.MangaListRuntimeFactory.create(ctx), state, elements, animations };
}

test('mobile shelf moves both real page grids together and releases the old page', async () => {
  const { runtime, state, elements, animations } = createSlidingShelfHarness();
  runtime.renderSavedList();
  const firstFrame = elements.savedListItems.children[0];
  const firstPage = firstFrame.children[0];
  assert.equal(firstPage.children[0].textContent, 'page-1');
  assert.equal(animations.length, 0, 'initial render does not animate');

  state.bookshelfPage = 2;
  runtime.renderSavedList(1);
  const secondFrame = elements.savedListItems.children[0];
  const track = secondFrame.children[0];
  assert.equal(track.className, 'bookshelf-slide-track');
  assert.strictEqual(track.children[0], firstPage);
  assert.equal(track.children[1].children[0].textContent, 'page-2');
  assert.deepEqual(Array.from(animations[0].frames, x => x.transform), ['translateX(0%)', 'translateX(-50%)']);
  assert.equal(animations[0].options.duration, 300);
  assert.strictEqual(elements.savedListItems.children[1], elements.bookshelfPagination);
  animations[0].complete();
  await animations[0].finished;
  await Promise.resolve();
  assert.equal(secondFrame.children.length, 1);
  assert.equal(secondFrame.children[0].className, 'bookshelf-page');
  assert.equal(secondFrame.children[0].children[0].textContent, 'page-2');

  state.bookshelfPage = 1;
  runtime.renderSavedList(-1);
  const backwardTrack = elements.savedListItems.children[0].children[0];
  assert.equal(backwardTrack.children[0].children[0].textContent, 'page-1');
  assert.equal(backwardTrack.children[1].children[0].textContent, 'page-2');
  assert.deepEqual(Array.from(animations[1].frames, x => x.transform), ['translateX(-50%)', 'translateX(0%)']);
});

test('non-page rerender and reduced motion stay instant, desktop buttons slide pages', () => {
  const harness = createSlidingShelfHarness();
  harness.runtime.renderSavedList();
  harness.runtime.renderSavedList();
  assert.equal(harness.animations.length, 0);
  for (const settings of [{ reducedMotion: true }, { mobile: false, reducedMotion: true }]) {
    const h = createSlidingShelfHarness(settings);
    h.runtime.renderSavedList();
    h.state.bookshelfPage = 2;
    h.runtime.renderSavedList(1);
    assert.equal(h.animations.length, 0);
    assert.equal(h.elements.savedListItems.children[0].children[0].className, 'bookshelf-page');
  }
  const desktop = createSlidingShelfHarness({ mobile: false });
  desktop.runtime.renderSavedList();
  desktop.state.bookshelfPage = 2;
  desktop.runtime.renderSavedList(1);
  assert.equal(desktop.animations.length, 1, 'PC navigation should slide the list just like on mobile');
  assert.deepEqual(Array.from(desktop.animations[0].frames, x => x.transform), ['translateX(0%)', 'translateX(-50%)']);
});

test('sliding pages are clipped, preserve mobile grid density, and do not change Reader', () => {
  const css = read('manga-list.css');
  const route = read('manga-list-route.js');
  assert.match(css, /\.bookshelf-page-frame\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /\.bookshelf-slide-track\s*\{[^}]*width:\s*200%/);
  assert.match(css, /\.bookshelf-slide-track > \.bookshelf-page\s*\{[^}]*flex:\s*0 0 50%/);
  assert.match(css, /\.bookshelf-page\s*\{[^}]*grid-template-columns:\s*repeat\(3,/);
  assert.match(route, /runtime\.renderSavedList\(delta\)/);
  assert.match(route, /manga-list-runtime\.js\?v=20261010-vault-sync-v4-delete/);
  assert.doesNotMatch(read('reader.html'), /bookshelf-slide-track|bookshelf-page-frame/);
});
