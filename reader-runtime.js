(() => {
  'use strict';

  function parseSequentialSource(url, item = {}, baseHref = 'https://reader.invalid/') {
    const source = String(url || '').trim();
    if (!source) return null;
    try {
      const parsed = new URL(source, baseHref);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      const match = parsed.pathname.match(/^(.*\/)([^/]*?)(\d+)([^/]*)\.([a-z0-9]+)$/i);
      let width = Math.max(1, Number(item.numberWidth) || Number(item.pagePattern?.width) || 1);
      let pattern = item.pagePattern || null;
      if (match) {
        width = Math.max(width, match[3].length);
        let prefix = match[2];
        if (!match[4] && match[3].length >= 7 && /[^0-9]/.test(prefix)) {
          prefix += match[3].slice(0, -3);
          width = 3;
        }
        if (!pattern && (prefix || match[4])) pattern = { prefix, suffix: match[4], width };
        parsed.pathname = match[1];
      } else {
        parsed.pathname = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
      }
      parsed.search = '';
      parsed.hash = '';
      return { base: parsed.href, pattern, width };
    } catch (_) { return null; }
  }

  function numberedPageUrl(source, number, extension) {
    const formatted = String(number).padStart(source.width, '0');
    return source.pattern
      ? `${source.base}${source.pattern.prefix || ''}${formatted}${source.pattern.suffix || ''}.${extension}`
      : `${source.base}${formatted}.${extension}`;
  }

  function create(dependencies = {}) {
    const { repository, target, sessionStorage, location } = dependencies;
    for (const [name, value] of Object.entries({ repository, target, location })) {
      if (!value) throw new TypeError(`reader runtime requires ${name}`);
    }
    if (typeof repository.loadItem !== 'function' || typeof repository.saveItem !== 'function' || typeof target.consumeLaunch !== 'function' || typeof location.replace !== 'function') {
      throw new TypeError('reader runtime dependencies are incomplete');
    }

    async function resolve(itemId) {
      const id = String(itemId == null ? '' : itemId).trim();
      if (!id) {
        location.replace('manga.html');
        return null;
      }
      const savedItem = repository.loadItem(id);
      if (savedItem && String(savedItem.id) === id) return { item: savedItem, source: 'saved-items' };

      const launchItem = target.consumeLaunch(id, sessionStorage);
      if (launchItem && String(launchItem.id) === id) {
        repository.saveItem(launchItem);
        return { item: launchItem, source: 'launch-handoff' };
      }

      location.replace('manga.html');
      return null;
    }

    function close() {
      location.replace('manga.html');
    }

    async function start(itemId) {
      const resolved = await resolve(itemId);
      if (!resolved) return null;
      if (!dependencies.document || !dependencies.window) throw new TypeError('reader runtime requires document and window to render');
      await mountItem(resolved.item);
      return resolved.item;
    }

    const doc = dependencies.document;
    const win = dependencies.window;
    let currentItem = null;
    let pageUrls = [];
    let encryptedPages = [];
    let page = 1;
    let generation = 0;
    let encryptedRenderer = null;
    let encryptedAssetCachePromise = null;
    let vertical = false;
    let split = false;
    let imageEnhanceEnabled = true;
    const extensionCandidates = ['jpg', 'jpeg', 'png', 'webp'];
    const keyFor = (id) => target.itemResumeKey ? target.itemResumeKey(id) : `item:${id}`;
    const byId = (id) => doc.getElementById(id);

    function status(message) { const node = byId('readerStatus'); if (node) node.textContent = message || ''; }
    function displayCount() { return encryptedPages.length || pageUrls.length * (split ? 2 : 1); }
    function updateControls() {
      const slider = byId('pageSlider');
      const label = byId('pageLabel');
      if (slider) { slider.max = String(Math.max(1, displayCount())); slider.value = String(page); }
      if (label) label.textContent = `${page} / ${Math.max(1, displayCount())}`;
      const title = byId('currentTitle'); if (title) title.textContent = currentItem?.title || currentItem?.url || '漫画';
    }
    function readMap(key) {
      try { const value = JSON.parse(win.localStorage.getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
      catch (_) { return {}; }
    }
    function resumePage(item) {
      const key = keyFor(item.id);
      const itemProgress = Number(item.readingProgress?.page);
      const record = readMap('mangaReaderLastPage')[key];
      const saved = Number(record?.page || itemProgress);
      return Number.isInteger(saved) && saved > 0 && !record?.wasLast ? saved : 1;
    }
    function persistPage() {
      if (!currentItem || !displayCount()) return;
      const key = keyFor(currentItem.id);
      const map = readMap('mangaReaderLastPage');
      map[key] = { page, wasLast: page === displayCount(), savedAt: Date.now() };
      try { win.localStorage.setItem('mangaReaderLastPage', JSON.stringify(map)); } catch (_) {}
      const updated = repository.updateItem(currentItem.id, { readingProgress: { page, updatedAt: Date.now() } });
      if (updated) currentItem = updated;
    }
    function revokeEncryptedRenderer() {
      if (encryptedRenderer) { try { encryptedRenderer.destroy(); } catch (_) {} }
      encryptedRenderer = null;
    }
    function numberedUrl(source, number, extension) {
      return numberedPageUrl(source, number, extension);
    }
    async function imageLoads(url, timeout = 12000) {
      const gate = win.MangaReaderMediaAccess;
      if (gate?.getStatus && ['pending', 'checking'].includes(gate.getStatus()) && gate.checkVpn) {
        try { await gate.checkVpn({ external: false }); } catch (_) {}
      }
      return new Promise((resolve) => {
        const image = new win.Image();
        let settled = false;
        const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); image.onload = null; image.onerror = null; resolve(value); };
        const timer = setTimeout(() => finish(false), timeout);
        image.onload = () => finish(true);
        image.onerror = () => finish(false);
        image.src = url;
      });
    }
    async function resolvePage(number, source) {
      const ordered = extensionCandidates;
      for (const extension of ordered) {
        const url = numberedUrl(source, number, extension);
        if (await imageLoads(url, 5000)) return url;
      }
      return null;
    }
    function updateTocButton() {
      const list = readMap('mangaReaderToc')[keyFor(currentItem.id)] || [];
      const button = byId('tocBtn');
      if (button) button.hidden = !list.length;
    }
    function saveTocEntry() {
      const map = readMap('mangaReaderToc');
      const key = keyFor(currentItem.id);
      const entries = Array.isArray(map[key]) ? map[key] : [];
      const name = win.prompt('目次名', `第${entries.length + 1}章`);
      if (name === null) return;
      map[key] = entries.filter((entry) => Number(entry.page) !== page).concat({ page, name: name.trim() || `第${entries.length + 1}章` }).sort((a, b) => a.page - b.page);
      try { win.localStorage.setItem('mangaReaderToc', JSON.stringify(map)); } catch (_) {}
      repository.scheduleSync?.();
      updateTocButton();
    }
    function renderToc() {
      const list = readMap('mangaReaderToc')[keyFor(currentItem.id)] || [];
      const text = list.map((entry) => `${entry.name} (${entry.page})`).join('\n');
      const choice = win.prompt(text || '目次はありません。ページ番号を入力してください。', String(page));
      if (choice == null) return;
      const parsed = Number(choice);
      const entry = list.find((item) => item.name === choice);
      goTo(entry ? Number(entry.page) : parsed);
    }
    function renderFavorite() {
      const button = byId('favToggleBtn');
      if (!button) return;
      button.textContent = currentItem.favorite ? '♥' : '♡';
      button.title = currentItem.favorite ? 'お気に入りから外す' : 'お気に入りに追加';
    }
    function showNextVolume() {
      const next = repository.findNextVolume?.(currentItem);
      const banner = byId('nextVolumeBanner');
      if (!banner) return;
      banner.hidden = !next || page !== displayCount();
      if (!next) return;
      const text = byId('nextVolumeText'); if (text) text.textContent = `次の巻: ${next.title || next.volume}`;
      const button = byId('nextVolumeBtn'); if (button) button.onclick = () => { location.replace(target.buildReaderUrl(next.id, 'reader.html')); };
    }
    function createPageImage(url, pageNumber = page) {
      const image = doc.createElement('img');
      image.className = 'readerPageImage';
      image.alt = `ページ ${pageNumber}`;
      image.draggable = false;
      image.onload = () => { if (imageEnhanceEnabled && !doc.body.classList.contains('safe-mode')) win.ReaderImageEnhancement?.enhanceElement(image, { documentRef: doc, windowRef: win }); };
      image.src = url;
      if (image.complete && image.naturalWidth) image.onload();
      return image;
    }
    function restorePageEnhancements() {
      byId('pageStage')?.querySelectorAll('.readerPageImage').forEach((image) => win.ReaderImageEnhancement?.restore(image));
    }
    function renderOrdinaryPage() {
      revokeEncryptedRenderer();
      const stage = byId('pageStage');
      const viewer = byId('viewer');
      if (!stage || !viewer) return;
      restorePageEnhancements();
      stage.replaceChildren();
      if (vertical && !split) {
        const fragment = doc.createDocumentFragment();
        pageUrls.forEach((url, index) => {
          const image = createPageImage(url, index + 1);
          image.dataset.page = String(index + 1);
          image.loading = index < page + 2 ? 'eager' : 'lazy';
          fragment.appendChild(image);
        });
        stage.appendChild(fragment);
        requestAnimationFrame(() => {
          const selected = stage.querySelector(`[data-page="${page}"]`);
          if (selected) selected.scrollIntoView({ block: 'start' });
        });
        updateControls();
        return;
      }
      const sourceIndex = split ? Math.floor((page - 1) / 2) : page - 1;
      const url = pageUrls[sourceIndex];
      if (!url) { status('ページを読み込めませんでした。'); return; }
      const image = createPageImage(url);
      if (split) {
        const crop = doc.createElement('div'); crop.className = `spreadCrop ${page % 2 ? 'spreadRight' : 'spreadLeft'}`; crop.appendChild(image); stage.appendChild(crop);
      } else stage.appendChild(image);
      stage.classList.toggle('vertical-scroll', vertical);
      viewer.classList.toggle('vertical-scroll', vertical);
      updateControls();
      updateTocButton();
    }
    function renderEncryptedPage() {
      revokeEncryptedRenderer();
      const stage = byId('pageStage');
      if (!stage) return;
      stage.replaceChildren();
      const entry = encryptedPages[page - 1];
      const host = doc.createElement('div'); host.className = 'encryptedAssetHost'; stage.appendChild(host);
      const active = win.MangaVault?.loadActive?.();
      if (!active?.rawKey) { status('保管庫を開いてください。'); return; }
      const config = win.MANGA_READER_SUPABASE || {};
      const storage = win.EncryptedAssetStorage.createStorageTransport({ baseUrl: config.url, publishableKey: config.publishableKey });
      const renderer = win.EncryptedAssetReader.createEncryptedAssetReader({
        container: host, manifest: entry.manifest, assetId: entry.assetId, revision: entry.revision,
        masterKey: active.rawKey, vault: win.MangaVault, storage, cache: (encryptedAssetCachePromise ||= win.EncryptedAssetCache.createCache()),
        mediaAccess: win.MangaReaderMediaAccess, sync: win.EncryptedAssetSync, settings: win.ImageTransferSettings,
        remoteAccess: win.ImageRemoteAccess, crypto: win.EncryptedAssetCrypto,
        onPreviewError: (error) => status(error?.message || '暗号化ページを読み込めません。'),
      });
      encryptedRenderer = renderer;
      renderer.mount();
      updateControls();
    }
    function renderPage() {
      if (encryptedPages.length) renderEncryptedPage();
      else renderOrdinaryPage();
      persistPage();
      updateControls();
      showNextVolume();
    }
    function goTo(number) {
      if (!Number.isFinite(Number(number))) return;
      page = Math.max(1, Math.min(displayCount() || 1, Math.floor(Number(number))));
      renderPage();
    }
    function next() { if (page < displayCount()) goTo(page + 1); }
    function previous() { if (page > 1) goTo(page - 1); }
    function bind(id, event, callback) { const node = byId(id); if (node) node.addEventListener(event, callback); }
    function bindControls() {
      bind('closeBtn', 'click', close);
      bind('prevBtn', 'click', previous); bind('nextBtn', 'click', next);
      bind('firstBtn', 'click', () => goTo(1)); bind('lastBtn', 'click', () => goTo(displayCount()));
      bind('pageSlider', 'input', (event) => goTo(Number(event.target.value)));
      bind('favToggleBtn', 'click', () => {
        const updated = repository.updateItem(currentItem.id, { favorite: !currentItem.favorite });
        if (updated) { currentItem = updated; renderFavorite(); }
      });
      bind('tocAddBtn', 'click', saveTocEntry); bind('tocBtn', 'click', renderToc);
      bind('safeModeBtn', 'click', () => { const active = doc.body.classList.toggle('safe-mode'); win.localStorage.setItem('mangaReaderSafeMode', active ? '1' : '0'); if (active) restorePageEnhancements(); else applyPageEnhancements(); });
      bind('enhanceBtn', 'click', (event) => { imageEnhanceEnabled = !imageEnhanceEnabled; doc.body.classList.toggle('image-enhance', imageEnhanceEnabled); event.currentTarget.setAttribute('aria-pressed', imageEnhanceEnabled ? 'true' : 'false'); win.localStorage.setItem('mangaReaderImageEnhance', imageEnhanceEnabled ? '1' : '0'); if (imageEnhanceEnabled) applyPageEnhancements(); else restorePageEnhancements(); });
      bind('verticalBtn', 'click', () => { vertical = !vertical; doc.body.classList.toggle('vertical-scroll', vertical); win.localStorage.setItem('mangaReaderVerticalScroll', vertical ? '1' : '0'); renderPage(); });
      bind('viewer', 'click', (event) => { if (vertical) return; if (event.clientX < win.innerWidth * 0.35) previous(); else if (event.clientX > win.innerWidth * 0.65) next(); });
      bind('viewer', 'scroll', () => {
        if (!vertical) return;
        const images = Array.from(byId('pageStage')?.querySelectorAll('[data-page]') || []);
        const visible = images.find((image) => image.getBoundingClientRect().bottom > 1);
        if (!visible) return;
        const nextPage = Number(visible.dataset.page);
        if (Number.isInteger(nextPage) && nextPage !== page) {
          page = nextPage;
          updateControls();
          persistPage();
          showNextVolume();
        }
      }, { passive: true });
      bind('nextVolumeDismissBtn', 'click', () => { const banner = byId('nextVolumeBanner'); if (banner) banner.hidden = true; });
      win.addEventListener('keydown', (event) => { if (event.key === 'ArrowRight' || event.key === ' ') next(); else if (event.key === 'ArrowLeft') previous(); });
      if (vertical) doc.body.classList.add('vertical-scroll');
      if (win.localStorage.getItem('mangaReaderSafeMode') === '1') doc.body.classList.add('safe-mode');
      imageEnhanceEnabled = win.localStorage.getItem('mangaReaderImageEnhance') !== '0';
      doc.body.classList.toggle('image-enhance', imageEnhanceEnabled);
      byId('enhanceBtn')?.setAttribute('aria-pressed', imageEnhanceEnabled ? 'true' : 'false');
    }
    function applyPageEnhancements() {
      if (!imageEnhanceEnabled || doc.body.classList.contains('safe-mode')) return;
      byId('pageStage')?.querySelectorAll('.readerPageImage').forEach((image) => win.ReaderImageEnhancement?.enhanceElement(image, { documentRef: doc, windowRef: win }));
    }
    async function mountItem(item) {
      currentItem = item;
      split = Boolean(item.splitSpreads);
      page = resumePage(item);
      vertical = win.localStorage.getItem('mangaReaderVerticalScroll') === '1';
      doc.body.classList.toggle('vertical-scroll', vertical);
      const closeButton = byId('closeBtn'); if (closeButton) closeButton.hidden = false;
      const favoriteButton = byId('favToggleBtn'); if (favoriteButton) favoriteButton.hidden = false;
      bindControls(); renderFavorite();
      const generationAtStart = ++generation;
      const resume = page;
      if (item.encryptedAssets) {
        encryptedPages = win.EncryptedAssetItem.encryptedAssetPagesForItem(item) || [];
        if (!encryptedPages.length) { status('暗号化ページがありません。'); return; }
        page = Math.min(page, encryptedPages.length);
        renderPage(); showNextVolume(); return;
      }
      if (Array.isArray(item.pages) && item.pages.length) {
        pageUrls = item.pages.slice();
      } else {
        const source = parseSequentialSource(item.url, item, win.location.href);
        if (!source) { status('作品のページURLがありません。'); return; }
        page = 1;
        status('1ページ目を確認しています…');
        for (let index = 1; index <= 2000; index += 1) {
          if (generation !== generationAtStart) return;
          const url = await resolvePage(index, source);
          if (!url) break;
          pageUrls.push(url);
          updateControls();
          if (index === 1) renderOrdinaryPage();
          status(`${index}ページを確認しました`);
        }
      }
      if (!pageUrls.length) { status('画像を見つけられませんでした。'); return; }
      if (!Array.isArray(item.pages)) page = resume;
      page = Math.min(page, displayCount());
      renderPage();
      showNextVolume();
      status(`${pageUrls.length}ページ`);
    }

    return Object.freeze({ resolve, start, close });
  }

  const api = Object.freeze({ create, parseSequentialSource, numberedPageUrl });
  if (typeof self !== 'undefined') self.ReaderRuntimeFactory = api;
  if (typeof window !== 'undefined') window.ReaderRuntimeFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
