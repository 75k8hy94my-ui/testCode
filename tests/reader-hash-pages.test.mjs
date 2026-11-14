import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const Source = require('../manga-source-type.js');
const Runtime = require('../reader-runtime.js');

function element(name = 'div') {
  const listeners = new Map();
  const classes = new Set();
  const obj = {
    name, dataset: {}, style: {}, attributes: {}, hidden: false, inert: false,
    children: [], clientHeight: 800, scrollTop: 0,
    classList: {
      add: (...tokens) => tokens.forEach(t => classes.add(t)),
      remove: (...tokens) => tokens.forEach(t => classes.delete(t)),
      contains: t => classes.has(t),
      toggle(t, force) { const on = force === undefined ? !classes.has(t) : !!force; on ? classes.add(t) : classes.delete(t); return on; },
    },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type, data = {}) { listeners.get(type)?.({ currentTarget: obj, ...data }); },
    setAttribute(key, value) { obj.attributes[key] = String(value); },
    appendChild(child) { child.parentNode = obj; obj.children.push(child); return child; },
    replaceChildren(...children) { obj.children.forEach(child => child.parentNode = null); obj.children = []; children.forEach(child => obj.appendChild(child)); },
    querySelectorAll() { return []; },
    remove() { if (obj.parentNode) obj.parentNode.children = obj.parentNode.children.filter(n => n !== obj); obj.parentNode = null; },
    get firstChild() { return obj.children[0] || null; },
  };
  return obj;
}

function setup({ resume = 1, vertical = false, safeMode = false, url = 'https://example.test/xxx.html?edition=1#1' } = {}) {
  const ids = [
    'readerStatus', 'readerMessage', 'retryPageBtn', 'pageSlider', 'pageLabel',
    'currentTitle', 'pageStage', 'viewer', 'topbar', 'controls', 'tocBtn',
    'favToggleBtn', 'closeBtn', 'firstBtn', 'prevBtn', 'nextBtn', 'lastBtn',
    'tocAddBtn', 'safeModeBtn', 'enhanceBtn', 'verticalBtn', 'nextVolumeBanner',
    'nextVolumeText', 'nextVolumeBtn', 'nextVolumeDismissBtn', 'openSourceBtn',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  const body = element('body');
  const local = new Map([['mangaReaderVerticalScroll', vertical ? '1' : '0'], ['mangaReaderSafeMode', safeMode ? '1' : '0']]);
  const localStorage = {
    getItem(key) { return local.get(key) ?? null; },
    setItem(key, value) { local.set(key, String(value)); },
  };
  const doc = {
    body,
    getElementById(id) { return elements[id] || null; },
    createElement: element,
    createDocumentFragment() { return element('fragment'); },
  };
  const item = { id: 'hash-work', title: 'Hash manga', url };
  const commits = [], updates = [];
  const repository = {
    loadItem(id) { return id === item.id ? item : null; },
    saveItem(value) { return value; },
    updateItem(id, patch) { assert.equal(id, item.id); Object.assign(item, patch); updates.push(patch); return item; },
    findNextVolume() { return { id: 'next' }; },
    scheduleSync() {},
  };
  const progressRepository = {
    load() { return { page: resume, wasLast: false }; },
    commit(id, page, count) { commits.push({ id, page, count }); return true; },
  };
  const win = {
    MangaSourceType: Source, localStorage, location: { href: 'https://testcode.test/reader.html?item=hash-work' },
    innerWidth: 1000, innerHeight: 800, addEventListener() {}, removeEventListener() {},
  };
  const runtime = Runtime.create({ repository, target: { itemResumeKey: id => 'item:' + id }, location: { replace() {} }, document: doc, window: win, progressRepository });
  return { runtime, elements, body, item, commits, updates, localStorage };
}

test('only an exact terminal #1 opts into hash-page mode', () => {
  const ok = ['https://example.test/xxx.html#1', 'http://example.test/xxx.html?q=a#1', 'https://example.test/1.webp#1'];
  for (const url of ok) {
    const base = Source.getHashPageBase({ url });
    assert.equal(base, url.slice(0, -2));
    assert.equal(Source.hashPageUrl(base, 2), base + '#2');
    assert.equal(Source.getEmbedUrl({ url }), url);
  }
  for (const url of [
    'https://example.test/xxx.html#01', 'https://example.test/xxx.html#2',
    'https://example.test/xxx.html#1extra', 'https://example.test/xxx.html?x=#1&y',
    'javascript:alert(1)#1',
  ]) assert.equal(Source.getHashPageBase({ url }), '');
  assert.equal(Source.getHashPageBase({ url: ok[0], pages: ['https://images.test/1.webp'] }), '');
  assert.equal(Source.getHashPageBase({ url: ok[0], localSync: true }), '');
  assert.equal(Source.getHashPageBase({ url: ok[0], encryptedAssets: { pages: [{}] } }), '');
  assert.equal(Source.hashPageUrl('https://example.test/a', 0), '');
  assert.equal(Source.hashPageUrl('https://example.test/a', Source.MAX_HASH_PAGE + 1), '');
});

test('hash frames use normal reader controls, restore progress and cannot receive pointer or keyboard input', async () => {
  const { runtime, elements, body, item, commits, updates } = setup({ resume: 3 });
  await runtime.start(item.id);
  const frame = elements.pageStage.firstChild, iframe = frame.firstChild;
  const shownIframe = () => elements.pageStage.firstChild?.firstChild;
  assert.equal(frame.className, 'readerHashFrame');
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#3');
  assert.equal(frame.style.pointerEvents, 'none');
  assert.equal(iframe.style.pointerEvents, 'none');
  assert.equal(iframe.inert, true);
  assert.equal(iframe.attributes.tabindex, '-1');
  assert.equal(elements.controls.hidden, false);
  assert.equal(elements.pageLabel.textContent, '3 / ?');
  assert.equal(elements.pageSlider.value, '3');
  assert.equal(elements.pageSlider.max, '4');
  assert.equal(elements.openSourceBtn.href, iframe.src);
  assert.ok(commits.every(commit => commit.count === 0), 'unknown length must never mark a final page');

  runtime.next();
  assert.equal(shownIframe().src, 'https://example.test/xxx.html?edition=1#4');
  assert.equal(elements.pageLabel.textContent, '4 / ?');
  assert.equal(elements.pageSlider.max, '5');
  assert.equal(elements.openSourceBtn.href, iframe.src);
  runtime.previous();
  assert.equal(shownIframe().src, 'https://example.test/xxx.html?edition=1#3');
  elements.firstBtn.dispatch('click');
  assert.equal(shownIframe().src, 'https://example.test/xxx.html?edition=1#1');
  elements.lastBtn.dispatch('click');
  assert.equal(shownIframe().src, 'https://example.test/xxx.html?edition=1#4');

  elements.safeModeBtn.dispatch('click');
  assert.equal(body.classList.contains('safe-mode'), true);
  elements.favToggleBtn.dispatch('click');
  assert.deepEqual(updates, [{ favorite: true }]);
  assert.equal(item.favorite, true);
  assert.equal(runtime.getPageState().displayedPage, 4);
  assert.ok(commits.length >= 4);
  assert.ok(commits.every(commit => commit.count === 0));
  runtime.destroy();
  assert.equal(elements.pageStage.children.length, 0, 'destroy removes protected remote frames');
});

test('enabling vertical mode does not scan pages or react to programmatic browser scroll events', async () => {
  const { runtime, elements, body, commits } = setup({ resume: 2 });
  await runtime.start('hash-work');
  const before = commits.length;
  elements.verticalBtn.dispatch('click');
  assert.equal(body.classList.contains('vertical-scroll'), true);
  assert.equal(runtime.getPageState().displayedPage, 2);
  assert.equal(elements.pageStage.children.length, 4);

  // Browser-generated scrolls (initial positioning, anchoring, iframe focus)
  // must neither load more URLs nor change the reader progress.
  for (let i = 0; i < 6; i += 1) {
    elements.viewer.scrollTop = i * 800;
    elements.viewer.dispatch('scroll');
  }
  assert.equal(runtime.getPageState().displayedPage, 2);
  assert.equal(elements.pageStage.children.length, 4);
  assert.equal(commits.length, before, 'layout-only scroll must not persist new page progress');

  // A genuine touch gesture is allowed to advance the same scroll container.
  elements.viewer.dispatch('touchmove');
  elements.viewer.scrollTop = 3 * 800;
  elements.viewer.dispatch('scroll');
  assert.equal(runtime.getPageState().displayedPage, 4);

  // Switching the layout must reset any old scroll-gesture permission.
  elements.verticalBtn.dispatch('click');
  elements.verticalBtn.dispatch('click');
  const stablePage = runtime.getPageState().displayedPage;
  const stableSlots = elements.pageStage.children.length;
  elements.viewer.scrollTop = 5 * 800;
  elements.viewer.dispatch('scroll');
  assert.equal(runtime.getPageState().displayedPage, stablePage);
  assert.equal(elements.pageStage.children.length, stableSlots);
  runtime.destroy();
});

test('hash-page vertical reading creates bounded iframe windows and preserves page index', async () => {
  const { runtime, elements, body, commits } = setup({ resume: 2 });
  await runtime.start('hash-work');
  elements.verticalBtn.dispatch('click');
  assert.equal(body.classList.contains('vertical-scroll'), true);
  assert.ok(elements.pageStage.children.length >= 4);
  const active = () => elements.pageStage.children.filter(slot => !!slot.firstChild);
  assert.ok(active().length <= 3);
  assert.ok(active().every(slot => slot.firstChild.firstChild.style.pointerEvents === 'none'));
  elements.viewer.dispatch('wheel'); // Only a real gesture may advance the page.
  elements.viewer.scrollTop = 3 * 800;
  elements.viewer.dispatch('scroll');
  assert.equal(runtime.getPageState().displayedPage, 4);
  assert.equal(elements.pageLabel.textContent, '4 / ?');
  assert.equal(elements.openSourceBtn.href, 'https://example.test/xxx.html?edition=1#4');
  assert.ok(active().length <= 3, 'distant embedded documents must be released');
  assert.equal(commits.at(-1).page, 4);
  elements.verticalBtn.dispatch('click');
  assert.equal(body.classList.contains('vertical-scroll'), false);
  assert.equal(elements.pageStage.firstChild.firstChild.src, 'https://example.test/xxx.html?edition=1#4');
  runtime.destroy();
});


test('hash-page vertical CSS avoids scroll anchoring and refreshes the runtime asset', () => {
  const html = readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
  assert.match(html, /body\.hash-page-reader\.vertical-scroll #viewer[\s\S]*overflow-anchor:none/);
  assert.match(html, /reader-runtime\.js\?v=20261114-hash-end-on-demand/);
});


test('safe mode can be disabled on a touch-style reader after being restored from storage', async () => {
  const { runtime, elements, body, localStorage } = setup({ safeMode: true });
  await runtime.start('hash-work');
  const button = elements.safeModeBtn;
  assert.equal(body.classList.contains('safe-mode'), true);
  assert.equal(button.attributes['aria-pressed'], 'true');
  assert.equal(button.attributes['aria-label'], 'セーフモードを解除');

  let stopped = 0;
  button.dispatch('click', { stopPropagation() { stopped += 1; } });
  assert.equal(body.classList.contains('safe-mode'), false);
  assert.equal(button.attributes['aria-pressed'], 'false');
  assert.equal(button.attributes['aria-label'], 'セーフモードを有効化');
  assert.equal(localStorage.getItem('mangaReaderSafeMode'), '0');

  button.dispatch('click', { stopPropagation() { stopped += 1; } });
  assert.equal(body.classList.contains('safe-mode'), true);
  assert.equal(localStorage.getItem('mangaReaderSafeMode'), '1');
  button.dispatch('click', { stopPropagation() { stopped += 1; } });
  assert.equal(body.classList.contains('safe-mode'), false);
  assert.equal(localStorage.getItem('mangaReaderSafeMode'), '0');
  assert.equal(stopped, 3);
  runtime.destroy();
});

test('reader mobile CSS keeps the header at top and the privacy veil removable', () => {
  const html = readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
  const mobileCss = readFileSync(new URL('../reader-liquid-glass.css', import.meta.url), 'utf8');
  assert.match(html, /class="readerHeaderPrimary"/);
  assert.match(html, /class="readerHeaderSecondary"/);
  assert.match(html, /body\.safe-mode #viewer::after/);
  assert.doesNotMatch(html, /body\.safe-mode #pageStage > \* \{ filter:/);
  assert.match(mobileCss, /\(hover: none\) and \(pointer: coarse\)/);
  assert.match(mobileCss, /#readerApp #topbar\s*\{\s*position: fixed;/);
  assert.match(mobileCss, /#readerApp #topbar #safeModeBtn/);
});

function readableHashWindow(hash) {
  const child = element('iframe-window');
  child.location = { hash };
  return child;
}

test('the first #1- is normal; a redirected sequential next page fixes the final count', async () => {
  const { runtime, elements, item, updates, commits } = setup();
  await runtime.start('hash-work');

  let iframe = elements.pageStage.firstChild.firstChild;
  iframe.contentWindow = readableHashWindow('#1-');
  iframe.dispatch('load');
  assert.equal(elements.pageLabel.textContent, '1 / ?');
  assert.equal(updates.length, 0, 'opening #1- cannot imply end of book');

  for (const number of [2, 3]) {
    runtime.next();
    iframe = elements.pageStage.firstChild.firstChild;
    iframe.contentWindow = readableHashWindow('#' + number);
    iframe.dispatch('load');
    assert.equal(elements.pageLabel.textContent, number + ' / ?');
  }

  runtime.next();
  iframe = elements.pageStage.firstChild.firstChild;
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#4');
  iframe.contentWindow = readableHashWindow('#1-');
  iframe.dispatch('load');

  assert.equal(runtime.getPageState().displayedPage, 3);
  assert.equal(elements.pageLabel.textContent, '3 / 3');
  assert.equal(elements.pageSlider.max, '3');
  assert.equal(elements.nextBtn.disabled, true);
  assert.equal(elements.lastBtn.attributes['aria-label'], '最後のページ');
  assert.equal(elements.pageStage.firstChild.firstChild.src, 'https://example.test/xxx.html?edition=1#3');
  assert.equal(updates.at(-1).hashPageCount, 3);
  assert.equal(updates.at(-1).hashPageCountSource, 'https://example.test/xxx.html?edition=1');
  assert.equal(item.hashPageCount, 3);
  assert.equal(runtime.goTo(4), false, 'a proven final page is not navigable past the end');
  runtime.next();
  assert.equal(runtime.getPageState().displayedPage, 3);
  assert.ok(commits.every(entry => entry.count === 0), 'progress must still resume on the last displayed page');
  runtime.destroy();
});

test('an invalid far page does not falsely claim the previous page exists', async () => {
  const { runtime, elements, updates } = setup();
  await runtime.start('hash-work');
  runtime.goTo(60);
  let iframe = elements.pageStage.firstChild.firstChild;
  iframe.contentWindow = readableHashWindow('#1-');
  iframe.dispatch('load');
  assert.equal(runtime.getPageState().displayedPage, 1);
  assert.equal(elements.pageLabel.textContent, '1 / ?');
  assert.equal(updates.length, 0);
  assert.match(elements.readerStatus.textContent, /60ページは先頭へ戻されました/);
  assert.equal(runtime.goTo(60), false, 'already rejected page should not reopen');
  runtime.next();
  iframe = elements.pageStage.firstChild.firstChild;
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#2');
  runtime.destroy();
});

test('unreadable cross-origin iframe URLs do not invent a final page', async () => {
  const { runtime, elements, updates } = setup();
  await runtime.start('hash-work');
  runtime.goTo(2);
  const iframe = elements.pageStage.firstChild.firstChild;
  iframe.contentWindow = { get location() { throw new Error('SecurityError'); } };
  assert.doesNotThrow(() => iframe.dispatch('load'));
  assert.equal(runtime.getPageState().displayedPage, 2);
  assert.equal(elements.pageLabel.textContent, '2 / ?');
  assert.equal(updates.length, 0);
  runtime.destroy();
});

test('a discovered final page survives a new reader session for the same source URL', async () => {
  const { runtime, elements, item } = setup({ resume: 3 });
  item.hashPageCountSource = Source.getHashPageBase(item);
  item.hashPageCount = 3;
  await runtime.start('hash-work');
  assert.equal(elements.pageLabel.textContent, '3 / 3');
  assert.equal(elements.pageSlider.max, '3');
  assert.equal(elements.nextBtn.disabled, true);
  runtime.next();
  assert.equal(runtime.getPageState().displayedPage, 3);
  runtime.destroy();
});

test('vertical reading removes end-of-book placeholders when its next page redirects', async () => {
  const { runtime, elements, item } = setup({ vertical: true, resume: 2 });
  await runtime.start('hash-work');
  assert.equal(elements.pageStage.children.length, 4);
  let iframe = elements.pageStage.children[2].firstChild.firstChild;
  iframe.contentWindow = readableHashWindow('#3');
  iframe.dispatch('load'); // Prefetched page 3 is confirmed valid.

  elements.viewer.dispatch('touchmove');
  elements.viewer.scrollTop = 2 * 800;
  elements.viewer.dispatch('scroll');
  assert.equal(runtime.getPageState().displayedPage, 3);
  iframe = elements.pageStage.children[3].firstChild.firstChild;
  iframe.contentWindow = readableHashWindow('#1-');
  iframe.dispatch('load'); // Page 4 was prefetched for a legitimate scroll.

  assert.equal(runtime.getPageState().displayedPage, 3);
  assert.equal(elements.pageLabel.textContent, '3 / 3');
  assert.equal(elements.pageStage.children.length, 3);
  assert.equal(item.hashPageCount, 3);
  elements.viewer.dispatch('touchmove');
  elements.viewer.scrollTop = 4 * 800;
  elements.viewer.dispatch('scroll');
  assert.equal(runtime.getPageState().displayedPage, 3);
  runtime.destroy();
});
