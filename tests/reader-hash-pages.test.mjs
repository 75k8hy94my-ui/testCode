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

function setup({ resume = 1, vertical = false, safeMode = false, guard = false, url = 'https://example.test/xxx.html?edition=1#1' } = {}) {
  const ids = [
    'readerStatus', 'readerMessage', 'retryPageBtn', 'pageSlider', 'pageLabel',
    'currentTitle', 'pageStage', 'viewer', 'readerKeyboardSink', 'topbar', 'controls', 'tocBtn',
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
  const documentListeners = new Map();
  const doc = {
    body, activeElement: null,
    getElementById(id) { return elements[id] || null; },
    createElement: element,
    createDocumentFragment() { return element('fragment'); },
    addEventListener(type, fn) { documentListeners.set(type, fn); },
    removeEventListener(type) { documentListeners.delete(type); },
    dispatch(type, data = {}) { documentListeners.get(type)?.(data); },
  };
  elements.viewer.focus = (options) => {
    doc.activeElement = elements.viewer;
    elements.viewer.focusOptions = options;
  };
  elements.readerKeyboardSink.focus = (options) => {
    doc.activeElement = elements.readerKeyboardSink;
    elements.readerKeyboardSink.focusOptions = options;
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
  const windowListeners = new Map();
  const intervals = new Map();
  let nextIntervalId = 0;
  const win = {
    MangaSourceType: Source, localStorage, location: { href: 'https://testcode.test/reader.html?item=hash-work' },
    innerWidth: 1000, innerHeight: 800,
    addEventListener(type, fn) { windowListeners.set(type, fn); },
    removeEventListener(type) { windowListeners.delete(type); },
    dispatch(type, data = {}) { windowListeners.get(type)?.(data); },
  };
  if (guard) {
    win.setInterval = (callback, delay) => {
      assert.ok(delay <= 150, 'focus guard must re-check promptly');
      const id = ++nextIntervalId;
      intervals.set(id, callback);
      return id;
    };
    win.clearInterval = (id) => intervals.delete(id);
  }
  const runtime = Runtime.create({ repository, target: { itemResumeKey: id => 'item:' + id }, location: { replace() {} }, document: doc, window: win, progressRepository });
  return { runtime, elements, body, item, commits, updates, localStorage, doc, win, intervals };
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
  assert.equal(frame.children[1].className, 'readerHashInputShield');
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
  assert.equal(elements.openSourceBtn.href, shownIframe().src);
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

test('hash iframe focus and left/right keyboard input remain owned by the reader', async () => {
  const { runtime, elements, doc, win } = setup();
  await runtime.start('hash-work');
  let iframe = elements.pageStage.firstChild.firstChild;

  // The embedded handler may run first. The reader applies the opposite
  // interpretation afterward, without consuming the child's key event.
  const child = readableHashWindow('#1');
  iframe.contentWindow = child;
  iframe.dispatch('load');
  const events = [];
  child.dispatch('keydown', {
    key: 'ArrowRight',
    preventDefault() { events.push('preventDefault'); },
    stopImmediatePropagation() { events.push('stopImmediatePropagation'); },
    stopPropagation() { events.push('stopPropagation'); },
  });
  assert.deepEqual(events, [], 'reader must reconcile after the embedded key handler');
  await Promise.resolve();
  assert.equal(runtime.getPageState().displayedPage, 2);

  // A cross-origin frame does not allow injection. Its own focus event
  // should still return keyboard focus to the parent reader.
  iframe = elements.pageStage.firstChild.firstChild;
  iframe.contentWindow = { get location() { throw new Error('SecurityError'); } };
  assert.doesNotThrow(() => iframe.dispatch('load'));
  doc.activeElement = iframe;
  iframe.dispatch('focus');
  assert.equal(doc.activeElement, elements.readerKeyboardSink);
  assert.deepEqual(elements.readerKeyboardSink.focusOptions, { preventScroll: true });

  const parentEvents = [];
  win.dispatch('keydown', {
    key: 'ArrowRight',
    preventDefault() { parentEvents.push('preventDefault'); },
  });
  assert.deepEqual(parentEvents, ['preventDefault']);
  assert.equal(runtime.getPageState().displayedPage, 3);
  win.dispatch('keydown', { key: 'ArrowLeft', preventDefault() {} });
  assert.equal(runtime.getPageState().displayedPage, 2);

  iframe = elements.pageStage.firstChild.firstChild;
  doc.activeElement = iframe;
  win.dispatch('blur');
  assert.equal(doc.activeElement, elements.readerKeyboardSink);

  // Other controls may retain focus; the trap is only for hash frames.
  doc.activeElement = elements.pageSlider;
  win.dispatch('blur');
  assert.equal(doc.activeElement, elements.pageSlider);
  runtime.destroy();
});

test('page two, right key: embedded page goes to one, reader then corrects to three', async () => {
  const { runtime, elements, updates } = setup({ resume:2 });
  await runtime.start('hash-work');
  const iframe = elements.pageStage.firstChild.firstChild;
  const child = readableHashWindow('#2');
  iframe.contentWindow = child;
  iframe.dispatch('load');

  // Child receives ArrowRight and moves in the reverse direction.
  child.dispatch('keydown', { key:'ArrowRight' });
  child.location.hash = '#1';
  child.dispatch('hashchange');
  assert.equal(runtime.getPageState().displayedPage, 2, 'before deferred correction, reader state is still two');
  await Promise.resolve();
  assert.equal(runtime.getPageState().displayedPage, 3);
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#3');
  assert.equal(elements.pageLabel.textContent, '3 / ?');
  assert.equal(updates.length, 0, 'reverse key must not be mistaken for a last-page fallback');
  runtime.destroy();
});

test('page two, left key: embedded page goes to three, reader then corrects to one', async () => {
  const { runtime, elements } = setup({ resume:2 });
  await runtime.start('hash-work');
  const iframe = elements.pageStage.firstChild.firstChild;
  const child = readableHashWindow('#2');
  iframe.contentWindow = child;
  iframe.dispatch('load');
  child.dispatch('keydown', { key:'ArrowLeft' });
  child.location.hash = '#3';
  child.dispatch('hashchange');
  await Promise.resolve();
  assert.equal(runtime.getPageState().displayedPage, 1);
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#1');
  runtime.destroy();
});

test('right key on page one advances even when embedded handler does nothing', async () => {
  const { runtime, elements } = setup();
  await runtime.start('hash-work');
  const iframe = elements.pageStage.firstChild.firstChild;
  const child = readableHashWindow('#1');
  iframe.contentWindow = child;
  iframe.dispatch('load');
  child.dispatch('keydown', { key:'ArrowRight' });
  // The external page cannot navigate to zero and therefore does nothing.
  await Promise.resolve();
  assert.equal(runtime.getPageState().displayedPage, 2);
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#2');
  runtime.destroy();
});

test('rapid repeated child keys use the original reader position cumulatively', async () => {
  const { runtime, elements } = setup();
  await runtime.start('hash-work');
  const iframe = elements.pageStage.firstChild.firstChild;
  const child = readableHashWindow('#1');
  iframe.contentWindow = child;
  iframe.dispatch('load');
  child.dispatch('keydown', { key:'ArrowRight' });
  child.dispatch('keydown', { key:'ArrowRight' });
  await Promise.resolve();
  assert.equal(runtime.getPageState().displayedPage, 3, 'two right keys must go from page one to three');
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#3');
  runtime.destroy();
});

test('the first-page left boundary never navigates to page zero', async () => {
  const { runtime, elements } = setup();
  await runtime.start('hash-work');
  const iframe = elements.pageStage.firstChild.firstChild;
  const child = readableHashWindow('#1');
  iframe.contentWindow = child;
  iframe.dispatch('load');
  child.dispatch('keydown', { key:'ArrowLeft' });
  child.location.hash = '#2'; // remote site reacts in the opposite direction
  child.dispatch('hashchange');
  await Promise.resolve();
  assert.equal(runtime.getPageState().displayedPage, 1);
  assert.equal(elements.pageLabel.textContent, '1 / ?');
  runtime.destroy();
});

test('external reverse hash navigation is detected after a confirmed page, even without key event', async () => {
  const { runtime, elements, item } = setup({ resume:2 });
  await runtime.start('hash-work');
  const iframe = elements.pageStage.firstChild.firstChild;
  const child = readableHashWindow('#2');
  iframe.contentWindow = child;
  iframe.dispatch('load'); // Confirms that page two actually exists.
  child.location.hash = '#1-';
  child.dispatch('hashchange');
  assert.equal(runtime.getPageState().displayedPage, 3);
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#3');
  assert.equal(item.hashPageCount, undefined, 'the key-induced reversal is not an end-of-book redirect');
  runtime.destroy();
});

test('cross-origin correction reasserts the reader target after a delayed reverse navigation', async () => {
  const { runtime, elements, win } = setup({ resume:2 });
  await runtime.start('hash-work');
  const iframe = elements.pageStage.firstChild.firstChild;
  iframe.contentWindow = { get location() { throw new Error('SecurityError'); } };
  const pending = new Map();
  let timerId = 0;
  win.setTimeout = (fn, delay) => { const id = ++timerId; pending.set(id, { fn, delay }); return id; };
  win.clearTimeout = (id) => pending.delete(id);
  let actual = iframe.src, writes = 0;
  Object.defineProperty(iframe, 'src', {
    get() { return actual; },
    set(url) { actual = url; writes++; },
    configurable: true,
  });
  win.dispatch('keydown', { key:'ArrowRight', preventDefault() {} });
  assert.equal(runtime.getPageState().displayedPage, 3);
  actual = 'https://example.test/xxx.html?edition=1#1'; // remote site processed the opposite direction
  assert.ok([...pending.values()].some(entry => entry.delay === 0));
  for (const [id, entry] of [...pending.entries()]) {
    pending.delete(id);
    entry.fn();
  }
  assert.equal(actual, 'https://example.test/xxx.html?edition=1#3');
  assert.ok(writes >= 2, 'the target is explicitly re-applied after the embedded handler');

  // A subsequent left key cancels obsolete right-key corrections.
  win.dispatch('keydown', { key:'ArrowLeft', preventDefault() {} });
  assert.equal(runtime.getPageState().displayedPage, 2);
  for (const [id, entry] of [...pending.entries()]) { pending.delete(id); entry.fn(); }
  assert.equal(actual, 'https://example.test/xxx.html?edition=1#2');
  runtime.destroy();
});

test('recurring focus guard reclaims delayed cross-origin iframe autofocus throughout reading', async () => {
  const { runtime, elements, doc, win, intervals } = setup({ guard: true });
  await runtime.start('hash-work');
  assert.equal(intervals.size, 1, 'the reader must supervise focus for as long as #1 is open');
  const tick = () => [...intervals.values()].forEach(callback => callback());

  // Simulate a remote page calling focus() long after its load handler.
  const iframe = elements.pageStage.firstChild.firstChild;
  doc.activeElement = iframe;
  tick();
  assert.equal(doc.activeElement, elements.readerKeyboardSink);

  // Repeat after page navigation; keeping the iframe alive must not weaken
  // the keyboard ownership policy.
  runtime.next();
  doc.activeElement = iframe;
  tick();
  assert.equal(doc.activeElement, elements.readerKeyboardSink);
  assert.equal(runtime.getPageState().displayedPage, 2);

  // Keyboard events on the parent belong only to the manga reader.
  const stopped = [];
  win.dispatch('keydown', {
    key: 'ArrowRight',
    preventDefault() { stopped.push('preventDefault'); },
    stopImmediatePropagation() { stopped.push('stopImmediatePropagation'); },
    stopPropagation() { stopped.push('stopPropagation'); },
  });
  assert.deepEqual(stopped, ['preventDefault', 'stopImmediatePropagation', 'stopPropagation']);
  assert.equal(runtime.getPageState().displayedPage, 3);

  // Buttons and form controls must not be stolen from.
  doc.activeElement = elements.pageSlider;
  tick();
  assert.equal(doc.activeElement, elements.pageSlider);
  doc.visibilityState = 'hidden';
  doc.activeElement = iframe;
  tick();
  assert.equal(doc.activeElement, iframe, 'background tabs must not try to regain keyboard focus');
  doc.visibilityState = 'visible';
  doc.dispatch('visibilitychange');
  assert.equal(doc.activeElement, elements.readerKeyboardSink);

  runtime.destroy();
  assert.equal(intervals.size, 0, 'cleanup must stop the guard and avoid background polling');
});

test('viewer clicks and arrow keys navigate #1 pages in the original iframe', async () => {
  const { runtime, elements, win } = setup();
  await runtime.start('hash-work');
  const iframe = elements.pageStage.firstChild.firstChild;
  assert.equal(elements.pageStage.firstChild.children[1].className, 'readerHashInputShield');
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#1');

  elements.viewer.dispatch('click', { clientX: 900 });
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#2');
  assert.equal(elements.pageStage.firstChild.firstChild, iframe, 'click navigation must not reload the embedded document');

  let prevented = 0;
  win.dispatch('keydown', { key: 'ArrowRight', preventDefault() { prevented++; } });
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#3');
  assert.equal(elements.pageStage.firstChild.firstChild, iframe, 'arrow navigation must preserve the same iframe');
  assert.equal(prevented, 1);

  elements.viewer.dispatch('click', { clientX: 100 });
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#2');
  win.dispatch('keydown', { key: 'ArrowLeft', preventDefault() { prevented++; } });
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#1');
  assert.equal(prevented, 2);

  // The middle of the image toggles chrome without advancing the page.
  elements.viewer.dispatch('click', { clientX: 500 });
  assert.equal(iframe.src, 'https://example.test/xxx.html?edition=1#1');
  runtime.destroy();
});

test('#1 clicks can advance while vertical scrolling is enabled', async () => {
  const { runtime, elements } = setup({ vertical:true });
  await runtime.start('hash-work');
  assert.equal(runtime.getPageState().displayedPage, 1);
  elements.viewer.dispatch('click', { clientX: 900 });
  assert.equal(runtime.getPageState().displayedPage, 2);
  assert.equal(elements.pageLabel.textContent, '2 / ?');
  runtime.destroy();
});

test('legacy cached last-page hints cannot lock the #1 reader at page one', async () => {
  const { runtime, item, elements } = setup();
  item.hashPageCount = 1;
  item.hashPageCountSource = Source.getHashPageBase(item);
  await runtime.start('hash-work');
  assert.equal(elements.pageLabel.textContent, '1 / ?');
  runtime.next();
  assert.equal(runtime.getPageState().displayedPage, 2);
  runtime.destroy();
});

test('old image manifests cannot override a newly selected #1 URL', async () => {
  const { runtime, item, elements } = setup();
  item.pageManifest = { version:1, pages:['https://images.test/1.webp'] };
  item.pages = ['https://images.test/1.webp'];
  await runtime.start(item.id);
  assert.equal(elements.pageStage.firstChild.className, 'readerHashFrame');
  assert.equal(elements.pageStage.firstChild.firstChild.src, 'https://example.test/xxx.html?edition=1#1');
  runtime.next();
  assert.equal(elements.pageStage.firstChild.firstChild.src, 'https://example.test/xxx.html?edition=1#2');
  assert.equal(item.pages.length, 1, 'saved page metadata is not deleted by selecting the hash reader');
  runtime.destroy();
});

test('delayed cross-origin focus transfer is reclaimed after the parent blur event', async () => {
  const { runtime, elements, doc, win } = setup();
  await runtime.start('hash-work');
  const pending = [];
  win.setTimeout = (callback) => { pending.push(callback); return pending.length; };
  doc.activeElement = elements.readerKeyboardSink;
  win.dispatch('blur');
  doc.activeElement = elements.pageStage.firstChild.firstChild;
  pending.forEach((callback) => callback());
  assert.equal(doc.activeElement, elements.readerKeyboardSink);
  runtime.destroy();
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
  assert.ok(active().length <= 10);
  assert.ok(active().every(slot => slot.firstChild.firstChild.style.pointerEvents === 'none'));
  elements.viewer.dispatch('wheel'); // Only a real gesture may advance the page.
  elements.viewer.scrollTop = 3 * 800;
  elements.viewer.dispatch('scroll');
  assert.equal(runtime.getPageState().displayedPage, 4);
  assert.equal(elements.pageLabel.textContent, '4 / ?');
  assert.equal(elements.openSourceBtn.href, 'https://example.test/xxx.html?edition=1#4');
  assert.ok(active().length <= 10, 'vertical iframe cache must stay bounded');
  assert.equal(commits.at(-1).page, 4);
  elements.verticalBtn.dispatch('click');
  assert.equal(body.classList.contains('vertical-scroll'), false);
  assert.equal(elements.pageStage.firstChild.firstChild.src, 'https://example.test/xxx.html?edition=1#4');
  runtime.destroy();
});


test('vertical #1 reader preserves iframe identity across repeated forward and backward scrolling', async () => {
  const { runtime, elements } = setup({ vertical:true, resume:2 });
  await runtime.start('hash-work');
  const slotFrame = (n) => elements.pageStage.children[n - 1]?.firstChild?.firstChild || null;
  const first = slotFrame(1), second = slotFrame(2), third = slotFrame(3);
  assert.ok(first && second && third);
  let secondLoads = 0, thirdLoads = 0;
  second.addEventListener('load', () => { secondLoads++; });
  third.addEventListener('load', () => { thirdLoads++; });
  const move = (n) => {
    elements.viewer.dispatch('wheel');
    elements.viewer.scrollTop = (n - 1) * 800;
    elements.viewer.dispatch('scroll');
    assert.equal(runtime.getPageState().displayedPage, n);
  };
  for (const n of [3, 2, 3, 2, 1, 2, 3, 4, 3, 2]) move(n);
  assert.equal(slotFrame(1), first, 'nearby older iframe must not be recreated');
  assert.equal(slotFrame(2), second, 'repeated scroll must reuse page 2 browsing context');
  assert.equal(slotFrame(3), third, 'repeated scroll must reuse page 3 browsing context');
  assert.equal(secondLoads, 0, 'the same page must not re-emit load on revisits');
  assert.equal(thirdLoads, 0, 'the same page must not re-emit load on revisits');
  assert.equal(second.src, 'https://example.test/xxx.html?edition=1#2');
  assert.equal(third.src, 'https://example.test/xxx.html?edition=1#3');
  runtime.destroy();
});

test('vertical #1 reader retains a bounded iframe cache without evicting visible neighbors', async () => {
  const { runtime, elements } = setup({ vertical:true, resume:1 });
  await runtime.start('hash-work');
  const frames = () => elements.pageStage.children
    .map((slot, index) => ({ n:index + 1, iframe:slot.firstChild?.firstChild }))
    .filter(entry => Boolean(entry.iframe));
  const move = (n) => {
    elements.viewer.dispatch('touchmove');
    elements.viewer.scrollTop = (n - 1) * 800;
    elements.viewer.dispatch('scroll');
    assert.equal(runtime.getPageState().displayedPage, n);
    assert.ok(frames().length <= 10, 'external iframe budget must not be exceeded');
    assert.ok(frames().some(entry => entry.n === n), 'current iframe must stay loaded');
    assert.ok(frames().some(entry => entry.n === n - 1) || n === 1, 'previous neighbor must stay loaded');
  };
  for (let n = 2; n <= 19; n++) move(n);
  assert.equal(frames().length, 10);
  assert.equal(elements.pageStage.children[0].firstChild, null, 'far away frame may be reclaimed');
  const recent = elements.pageStage.children[17].firstChild.firstChild;
  for (const n of [18, 17, 18, 19, 18]) move(n);
  assert.equal(elements.pageStage.children[17].firstChild.firstChild, recent,
    'nearby frame should survive reverse scrolling even at capacity');
  runtime.destroy();
});

test('vertical #1 reader ignores remote reverse hash activity rather than jumping reader scroll', async () => {
  const { runtime, elements } = setup({ vertical:true, resume:2 });
  await runtime.start('hash-work');
  const frame = elements.pageStage.children[1].firstChild.firstChild;
  const child = readableHashWindow('#2');
  frame.contentWindow = child;
  frame.dispatch('load'); // Valid page 2
  child.location.hash = '#1';
  child.dispatch('hashchange'); // Site keyboard logic may reverse itself
  assert.equal(runtime.getPageState().displayedPage, 2, 'passive remote navigation is not a reader scroll gesture');
  assert.equal(elements.viewer.scrollTop, 800, 'remote hash changes must not jump to another slot');
  runtime.destroy();
});

test('hash-page vertical CSS avoids scroll anchoring and refreshes the runtime asset', () => {
  const html = readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
  assert.match(html, /body\.hash-page-reader\.vertical-scroll #viewer[\s\S]*overflow-anchor:none/);
  assert.match(html, /reader-runtime\.js\?v=20\d{6}-[a-z0-9-]+/);
  assert.match(html, /id="viewer"[^>]*tabindex="-1"/);
  assert.match(html, /readerHashInputShield/);
  assert.match(html, /id="readerKeyboardSink" tabindex="-1"/);
  assert.match(html, /#readerKeyboardSink \{ position:fixed/);
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
  assert.equal(await runtime.goTo(4), false, 'a proven final page is not navigable past the end');
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
  assert.equal(await runtime.goTo(60), false, 'already rejected page should not reopen');
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
  item.hashPageCountVersion = 2;
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


test('URL #18–#29 is displayed as reader pages 1–12, including first/last/slider', async () => {
  const {runtime,item,elements,commits} = setup({resume:1});
  item.pageRangeStart = 18;
  item.pageRangeEnd = 29;
  await runtime.start(item.id);
  const iframe = () => elements.pageStage.firstChild.firstChild;
  assert.equal(iframe().src, 'https://example.test/xxx.html?edition=1#18');
  assert.equal(elements.pageSlider.min, '1');
  assert.equal(elements.pageSlider.max, '12');
  assert.equal(elements.pageSlider.value, '1');
  assert.equal(elements.pageLabel.textContent, '1 / 12');
  assert.equal(elements.readerStatus.textContent, '全12ページ');
  runtime.previous();
  assert.equal(iframe().src, 'https://example.test/xxx.html?edition=1#18');
  runtime.next();
  assert.equal(iframe().src, 'https://example.test/xxx.html?edition=1#19');
  assert.equal(elements.pageLabel.textContent, '2 / 12');
  elements.pageSlider.dispatch('change',{target:{value:'6'}});
  assert.equal(iframe().src, 'https://example.test/xxx.html?edition=1#23');
  assert.equal(elements.pageLabel.textContent, '6 / 12');
  elements.lastBtn.dispatch('click');
  assert.equal(iframe().src, 'https://example.test/xxx.html?edition=1#29');
  assert.equal(elements.pageLabel.textContent, '12 / 12');
  assert.equal(elements.nextBtn.disabled,true);
  runtime.next();
  assert.equal(iframe().src, 'https://example.test/xxx.html?edition=1#29');
  elements.firstBtn.dispatch('click');
  assert.equal(iframe().src, 'https://example.test/xxx.html?edition=1#18');
  assert.equal(elements.pageLabel.textContent, '1 / 12');
  assert.ok(commits.every(({page}) => page >= 1 && page <= 12), 'progress must use reader-relative pages');
  runtime.destroy();
});

test('vertical hash interval uses relative slot numbers and offsets', async () => {
  const {runtime,item,elements} = setup({vertical:true,resume:1});
  item.pageRangeStart=18;
  item.pageRangeEnd=20;
  await runtime.start(item.id);
  assert.equal(elements.pageStage.children.length,3);
  assert.deepEqual(elements.pageStage.children.map(slot=>slot.dataset.page),['1','2','3']);
  assert.equal(elements.pageStage.children[0].firstChild.firstChild.src, 'https://example.test/xxx.html?edition=1#18');
  assert.equal(elements.viewer.scrollTop,0);
  runtime.goTo(2);
  assert.equal(elements.viewer.scrollTop,800);
  assert.equal(elements.pageStage.children[1].firstChild.firstChild.src, 'https://example.test/xxx.html?edition=1#19');
  runtime.goTo(3);
  assert.equal(elements.viewer.scrollTop,1600);
  assert.equal(elements.pageLabel.textContent,'3 / 3');
  runtime.next();
  assert.equal(elements.pageLabel.textContent,'3 / 3');
  runtime.destroy();
});

test('manual range end overrides a previous shorter auto-detected count', async () => {
  const {runtime,item,elements}=setup({resume:1});
  item.pageRangeStart=18;
  item.pageRangeEnd=29;
  item.hashPageCount=20;
  item.hashPageCountSource='https://example.test/xxx.html?edition=1';
  item.hashPageCountVersion=2;
  await runtime.start(item.id);
  assert.equal(elements.pageSlider.max,'12');
  runtime.goTo(12);
  assert.equal(elements.pageStage.firstChild.firstChild.src,'https://example.test/xxx.html?edition=1#29');
  runtime.destroy();
});

test('legacy absolute bookmark #19 migrates once to relative page 2', async () => {
  const {runtime,item,elements,updates,commits}=setup({resume:19});
  item.pageRangeStart=18;
  item.pageRangeEnd=29;
  await runtime.start(item.id);
  assert.equal(elements.pageStage.firstChild.firstChild.src,'https://example.test/xxx.html?edition=1#19');
  assert.equal(elements.pageLabel.textContent,'2 / 12');
  assert.equal(item.hashPageIndexMode,'relative-v1');
  assert.ok(updates.some(patch=>patch.hashPageIndexMode==='relative-v1'));
  assert.equal(commits.at(-1).page,2);
  runtime.destroy();
});

test('already migrated relative bookmark uses reader number without a second conversion', async () => {
  const {runtime,item,elements,updates}=setup({resume:5});
  item.pageRangeStart=18;
  item.pageRangeEnd=29;
  item.hashPageIndexMode='relative-v1';
  await runtime.start(item.id);
  assert.equal(elements.pageStage.firstChild.firstChild.src,'https://example.test/xxx.html?edition=1#22');
  assert.equal(elements.pageLabel.textContent,'5 / 12');
  assert.equal(updates.length,0);
  runtime.destroy();
});

test('start-only hash ranges show 1 / ? while source starts at #18', async () => {
  const {runtime,item,elements}=setup({resume:1});
  item.pageRangeStart=18;
  await runtime.start(item.id);
  assert.equal(elements.pageStage.firstChild.firstChild.src,'https://example.test/xxx.html?edition=1#18');
  assert.equal(elements.pageLabel.textContent,'1 / ?');
  assert.equal(elements.pageSlider.min,'1');
  runtime.next();
  assert.equal(elements.pageStage.firstChild.firstChild.src,'https://example.test/xxx.html?edition=1#19');
  assert.equal(elements.pageLabel.textContent,'2 / ?');
  runtime.destroy();
});


test('reverse hash navigation uses the source #18 offset while displaying page 1', async () => {
  const {runtime,item,elements}=setup({resume:1});
  item.pageRangeStart=18;
  item.pageRangeEnd=29;
  await runtime.start(item.id);
  const iframe=elements.pageStage.firstChild.firstChild;
  const child=readableHashWindow('#18');
  iframe.contentWindow=child;
  iframe.dispatch('load');
  child.location.hash='#17'; // external site's reversed Right arrow
  child.dispatch('hashchange');
  assert.equal(runtime.getPageState().displayedPage,2);
  assert.equal(elements.pageLabel.textContent,'2 / 12');
  assert.equal(iframe.src,'https://example.test/xxx.html?edition=1#19');
  runtime.destroy();
});

test('custom hash range end detection saves source count but displays relative total', async () => {
  const {runtime,item,elements}=setup({resume:1});
  item.pageRangeStart=18;
  await runtime.start(item.id);
  let iframe=elements.pageStage.firstChild.firstChild;
  iframe.contentWindow=readableHashWindow('#18');
  iframe.dispatch('load'); // source page 18 = reader page 1
  runtime.next();
  iframe=elements.pageStage.firstChild.firstChild;
  iframe.contentWindow=readableHashWindow('#1-');
  iframe.dispatch('load'); // external reader fell back instead of showing #19
  assert.equal(item.hashPageCount,18,'source count remains the absolute # number');
  assert.equal(elements.pageLabel.textContent,'1 / 1','reader count is relative');
  assert.equal(runtime.getPageState().displayedPage,1);
  runtime.destroy();
});
