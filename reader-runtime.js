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
      navigationGeneration++;
      try { imageLoader?.destroy?.(); } catch (_) {}
      if (isEmbeddedInShell()) {
        win.parent.postMessage({ type: 'manga-reader:close' }, win.location.origin);
        return;
      }
      location.replace('manga.html');
    }

    function isEmbeddedInShell() {
      try { return new URL(win.location.href).searchParams.get('spa') === '1' && win.parent !== win && typeof win.parent.postMessage === 'function'; }
      catch (_) { return false; }
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
    let imageLoader = dependencies.imageLoader || null;
    let currentItem = null;
    let pageUrls = [];
    let encryptedPages = [];
    let page = 1; // displayed page; never advances before its frame is ready
    let requestedPage = 1;
    let navigationGeneration = 0;
    let verticalWindowGeneration = 0;
    let verticalSlots = [];
    let lastFailedRequest = null;
    let generation = 0;
    let encryptedRenderer = null;
    let encryptedAssetCachePromise = null;
    let vertical = false;
    let split = false;
    let imageEnhanceEnabled = true;
    const extensionCandidates = ['jpg', 'jpeg', 'png', 'webp'];
    const keyFor = (id) => target.itemResumeKey ? target.itemResumeKey(id) : `item:${id}`;
    const byId = (id) => doc.getElementById(id);

    function getImageLoader() {
      if (!imageLoader && win?.ReaderImageLoaderFactory?.create && typeof win.Image === 'function') {
        imageLoader = win.ReaderImageLoaderFactory.create({ Image: win.Image, baseUrl: win.location?.href, maxEntries: 8, maxConcurrent: 3, timeoutMs: 15000 });
      }
      if (!imageLoader) throw new Error('Reader画像ローダーを利用できません');
      return imageLoader;
    }

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
    function persistPage(pageToPersist = page) {
      if (!currentItem || !displayCount()) return;
      const key = keyFor(currentItem.id);
      const map = readMap('mangaReaderLastPage');
      map[key] = { page: pageToPersist, wasLast: pageToPersist === displayCount(), savedAt: Date.now() };
      try { win.localStorage.setItem('mangaReaderLastPage', JSON.stringify(map)); } catch (_) {}
      const updated = repository.updateItem(currentItem.id, { readingProgress: { page: pageToPersist, updatedAt: Date.now() } });
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
      try { await getImageLoader().load(url, 20, timeout); return true; }
      catch (_) { return false; }
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
      const button = byId('nextVolumeBtn'); if (button) button.onclick = () => {
        if (isEmbeddedInShell()) {
          win.parent.postMessage({ type: 'manga-reader:open-item', itemId: String(next.id) }, win.location.origin);
          return;
        }
        let nextUrl = target.buildReaderUrl(next.id, 'reader.html');
        try { if (new URL(win.location.href).searchParams.get('spa') === '1') { const url = new URL(nextUrl, win.location.href); url.searchParams.set('spa', '1'); nextUrl = url.href; } } catch (_) {}
        location.replace(nextUrl);
      };
    }
    function preparePageImage(image, pageNumber = page) {
      image.className = 'readerPageImage';
      image.alt = `ページ ${pageNumber}`;
      image.draggable = false;
      image.onload = () => { if (imageEnhanceEnabled && !doc.body.classList.contains('safe-mode')) win.ReaderImageEnhancement?.enhanceElement(image, { documentRef: doc, windowRef: win }); };
      return image;
    }
    function restorePageEnhancements() {
      byId('pageStage')?.querySelectorAll('.readerPageImage').forEach((image) => win.ReaderImageEnhancement?.restore(image));
    }
    function preloadUrlsForPage(targetPage) {
      const direction = targetPage < page ? 'prev' : 'next';
      const factory = win.ReaderImageLoaderFactory;
      const pageWindow = factory?.preloadWindow
        ? factory.preloadWindow(targetPage, displayCount(), direction)
        : [targetPage, targetPage + (direction === 'prev' ? -1 : 1), targetPage - (direction === 'prev' ? -1 : 1)];
      const urls = pageWindow.map((number) => pageUrls[split ? Math.floor((number - 1) / 2) : number - 1]).filter(Boolean);
      const displayedUrl = pageUrls[split ? Math.floor((page - 1) / 2) : page - 1];
      if (displayedUrl && !urls.includes(displayedUrl)) urls.push(displayedUrl);
      return urls;
    }
    function renderOrdinaryPage(targetPage = requestedPage, navId = navigationGeneration, retry = false) {
      revokeEncryptedRenderer();
      const stage = byId('pageStage');
      const viewer = byId('viewer');
      if (!stage || !viewer) return Promise.resolve(false);
      if (vertical && !split) return renderVerticalPages(targetPage, navId);
      const sourceIndex = split ? Math.floor((targetPage - 1) / 2) : targetPage - 1;
      const url = pageUrls[sourceIndex];
      if (!url) return Promise.resolve(false);
      const loader = getImageLoader();
      const displayedUrl = pageUrls[split ? Math.floor((page - 1) / 2) : page - 1];
      loader.retain([displayedUrl, url]);
      loader.scheduleWindow(preloadUrlsForPage(targetPage));
      status(targetPage === page ? '' : 'ページを読み込み中…');
      const retryButton = byId('retryPageBtn'); if (retryButton) retryButton.hidden = true;
      const pendingImage = retry ? loader.retry(url, 1000) : loader.load(url, 1000);
      return pendingImage.then((image) => {
        if (navId !== navigationGeneration) return false;
        const newFrame = doc.createElement('div');
        newFrame.className = 'readerPageFrame';
        const readyImage = preparePageImage(image, targetPage);
        if (split) {
          const crop = doc.createElement('div');
          crop.className = `spreadCrop ${targetPage % 2 ? 'spreadRight' : 'spreadLeft'}`;
          crop.appendChild(readyImage);
          newFrame.appendChild(crop);
        } else newFrame.appendChild(readyImage);
        // One synchronous DOM replacement: the previous frame remains visible
        // until this exact loader-owned, decoded image is ready to display.
        restorePageEnhancements();
        stage.replaceChildren(newFrame);
        stage.classList.remove('vertical-scroll');
        viewer.classList.remove('vertical-scroll');
        page = targetPage;
        requestedPage = targetPage;
        lastFailedRequest = null;
        if (retryButton) retryButton.hidden = true;
        status('');
        updateControls();
        persistPage();
        updateTocButton();
        showNextVolume();
        if (imageEnhanceEnabled && !doc.body.classList.contains('safe-mode')) win.ReaderImageEnhancement?.enhanceElement(readyImage, { documentRef: doc, windowRef: win });
        return true;
      }).catch((error) => {
        if (navId !== navigationGeneration || error?.name === 'AbortError') return false;
        lastFailedRequest = { page: targetPage, url };
        status('画像を読み込めませんでした。表示中のページは維持されています。');
        if (retryButton) retryButton.hidden = false;
        return false;
      });
    }
    function ensureVerticalWindow(centerPage, navId) {
      if (!verticalSlots.length || !vertical) return;
      const loader = getImageLoader();
      const windowId = ++verticalWindowGeneration;
      const factory = win.ReaderImageLoaderFactory;
      const pageWindow = factory?.preloadWindow ? factory.preloadWindow(centerPage, displayCount(), 'next') : [centerPage, centerPage - 1, centerPage + 1];
      const urls = pageWindow.map((number) => pageUrls[number - 1]).filter(Boolean);
      const previousUrl = pageUrls[page - 1];
      loader.retain([previousUrl, pageUrls[centerPage - 1]]);
      loader.scheduleWindow(urls);
      for (const slot of verticalSlots) {
        const pageNumber = Number(slot.dataset.page);
        const pageUrl = pageUrls[pageNumber - 1];
        if (!urls.includes(pageUrl) && slot.firstChild) {
          win.ReaderImageEnhancement?.restore(slot.firstChild);
          slot.replaceChildren();
        }
      }
      urls.forEach((url) => {
        const pageNumber = pageUrls.indexOf(url) + 1;
        const slot = verticalSlots[pageNumber - 1];
        if (!slot || slot.firstChild) return;
        loader.load(url, pageWindow.length - pageWindow.indexOf(pageNumber)).then((image) => {
          if (windowId !== verticalWindowGeneration || navId !== navigationGeneration || !vertical) return;
          const targetSlot = verticalSlots[pageNumber - 1];
          if (!targetSlot || targetSlot.firstChild) return;
          const readyImage = preparePageImage(image, pageNumber);
          readyImage.dataset.page = String(pageNumber);
          targetSlot.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
          targetSlot.appendChild(readyImage);
          if (imageEnhanceEnabled && !doc.body.classList.contains('safe-mode')) win.ReaderImageEnhancement?.enhanceElement(readyImage, { documentRef: doc, windowRef: win });
        }).catch(() => {});
      });
    }
    function renderVerticalPages(targetPage, navId) {
      const stage = byId('pageStage');
      const viewer = byId('viewer');
      if (!stage || !viewer) return Promise.resolve(false);
      const targetUrl = pageUrls[targetPage - 1];
      if (!targetUrl) return Promise.resolve(false);
      const loader = getImageLoader();
      const urls = preloadUrlsForPage(targetPage);
      loader.retain([pageUrls[page - 1], targetUrl]);
      loader.scheduleWindow(urls);
      status(targetPage === page ? '' : 'ページを読み込み中…');
      const retryButton = byId('retryPageBtn'); if (retryButton) retryButton.hidden = true;
      const targetPromise = lastFailedRequest?.page === targetPage
        ? loader.retry(targetUrl, 1000)
        : loader.load(targetUrl, 1000);
      return targetPromise.then((image) => {
        if (navId !== navigationGeneration) return false;
        if (!verticalSlots.length || verticalSlots.length !== pageUrls.length || !stage.classList.contains('vertical-scroll')) {
          const fragment = doc.createDocumentFragment();
          verticalSlots = pageUrls.map((_, index) => {
            const slot = doc.createElement('div');
            slot.className = 'readerVerticalSlot';
            slot.dataset.page = String(index + 1);
            slot.style.aspectRatio = '0.7';
            fragment.appendChild(slot);
            return slot;
          });
          restorePageEnhancements();
          stage.replaceChildren(fragment);
        }
        stage.classList.add('vertical-scroll');
        viewer.classList.add('vertical-scroll');
        const targetSlot = verticalSlots[targetPage - 1];
        if (targetSlot && !targetSlot.firstChild) {
          const readyImage = preparePageImage(image, targetPage);
          readyImage.dataset.page = String(targetPage);
          targetSlot.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
          targetSlot.appendChild(readyImage);
        }
        page = targetPage;
        requestedPage = targetPage;
        lastFailedRequest = null;
        if (retryButton) retryButton.hidden = true;
        status('');
        updateControls();
        persistPage();
        updateTocButton();
        showNextVolume();
        targetSlot?.scrollIntoView?.({ block: 'start' });
        ensureVerticalWindow(targetPage, navId);
        return true;
      }).catch((error) => {
        if (navId !== navigationGeneration || error?.name === 'AbortError') return false;
        lastFailedRequest = { page: targetPage, url: targetUrl };
        status('画像を読み込めませんでした。表示中のページは維持されています。');
        if (retryButton) retryButton.hidden = false;
        return false;
      });
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
    function renderPage(number = requestedPage, retry = false) {
      if (encryptedPages.length) {
        page = Math.max(1, Math.min(displayCount() || 1, Math.floor(Number(number) || 1)));
        requestedPage = page;
        navigationGeneration++;
        renderEncryptedPage();
        persistPage(); updateControls(); showNextVolume();
        return Promise.resolve(true);
      }
      const targetPage = Math.max(1, Math.min(displayCount() || 1, Math.floor(Number(number) || 1)));
      requestedPage = targetPage;
      const navId = ++navigationGeneration;
      if (!retry) lastFailedRequest = null;
      return renderOrdinaryPage(targetPage, navId, retry);
    }
    function goTo(number) {
      if (!Number.isFinite(Number(number))) return;
      return renderPage(number);
    }
    function next() { if (requestedPage < displayCount()) goTo(requestedPage + 1); }
    function previous() { if (requestedPage > 1) goTo(requestedPage - 1); }
    function bind(id, event, callback) { const node = byId(id); if (node) node.addEventListener(event, callback); }
    function bindControls() {
      bind('closeBtn', 'click', close);
      bind('prevBtn', 'click', previous); bind('nextBtn', 'click', next);
      bind('firstBtn', 'click', () => goTo(1)); bind('lastBtn', 'click', () => goTo(displayCount()));
      bind('pageSlider', 'change', (event) => goTo(Number(event.target.value)));
      bind('retryPageBtn', 'click', () => { if (lastFailedRequest) renderPage(lastFailedRequest.page, true); });
      bind('favToggleBtn', 'click', () => {
        const updated = repository.updateItem(currentItem.id, { favorite: !currentItem.favorite });
        if (updated) { currentItem = updated; renderFavorite(); }
      });
      bind('tocAddBtn', 'click', saveTocEntry); bind('tocBtn', 'click', renderToc);
      bind('safeModeBtn', 'click', () => { const active = doc.body.classList.toggle('safe-mode'); win.localStorage.setItem('mangaReaderSafeMode', active ? '1' : '0'); if (active) restorePageEnhancements(); else applyPageEnhancements(); });
      bind('enhanceBtn', 'click', (event) => { imageEnhanceEnabled = !imageEnhanceEnabled; doc.body.classList.toggle('image-enhance', imageEnhanceEnabled); event.currentTarget.setAttribute('aria-pressed', imageEnhanceEnabled ? 'true' : 'false'); win.localStorage.setItem('mangaReaderImageEnhance', imageEnhanceEnabled ? '1' : '0'); if (imageEnhanceEnabled) applyPageEnhancements(); else restorePageEnhancements(); });
      bind('verticalBtn', 'click', () => { vertical = !vertical; verticalSlots = []; verticalWindowGeneration++; doc.body.classList.toggle('vertical-scroll', vertical); win.localStorage.setItem('mangaReaderVerticalScroll', vertical ? '1' : '0'); renderPage(page); });
      bind('viewer', 'contextmenu', (event) => {
        const targetElement = event.target;
        if (targetElement?.closest?.('img,canvas,.encryptedAssetHost')) event.preventDefault();
      });
      bind('viewer', 'dragstart', (event) => {
        if (event.target?.closest?.('img,canvas,.encryptedAssetHost')) event.preventDefault();
      });
      bind('viewer', 'click', (event) => {
        const x = Number(event.clientX);
        if (x >= win.innerWidth * 0.35 && x <= win.innerWidth * 0.65) {
          const hidden = doc.body.classList.toggle('reader-chrome-hidden');
          ['topbar', 'controls'].forEach((id) => {
            const chrome = byId(id); if (!chrome) return;
            chrome.setAttribute('aria-hidden', hidden ? 'true' : 'false'); chrome.inert = hidden;
          });
          if (isEmbeddedInShell()) win.parent.postMessage({ type: 'manga-reader:chrome', hidden }, win.location.origin);
          return;
        }
        if (vertical) return;
        if (x < win.innerWidth * 0.35) previous(); else if (x > win.innerWidth * 0.65) next();
      });
      bind('viewer', 'scroll', () => {
        if (!vertical) return;
        const viewer = byId('viewer');
        const stage = byId('pageStage');
        const viewerTop = viewer?.getBoundingClientRect?.().top || 0;
        const viewerHeight = viewer?.clientHeight || win.innerHeight || 800;
        const visibleSlots = Array.from(stage?.querySelectorAll('.readerVerticalSlot') || [])
          .map((slot) => ({ slot, rect: slot.getBoundingClientRect() }))
          .filter(({ rect }) => rect.bottom > viewerTop && rect.top < viewerTop + viewerHeight);
        const currentSlot = visibleSlots.filter(({ rect }) => rect.top <= viewerTop + Math.min(80, viewerHeight * 0.2))
          .sort((a, b) => b.rect.top - a.rect.top)[0] || visibleSlots[0];
        if (!currentSlot) return;
        const nextPage = Number(currentSlot.slot.dataset.page);
        if (Number.isInteger(nextPage) && nextPage !== page) {
          page = nextPage;
          requestedPage = nextPage;
          navigationGeneration++;
          updateControls();
          persistPage();
          showNextVolume();
          ensureVerticalWindow(nextPage, navigationGeneration);
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
      requestedPage = page;
      lastFailedRequest = null;
      verticalSlots = [];
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
        requestedPage = page;
        await renderPage(page); showNextVolume(); return;
      }
      if (Array.isArray(item.pages) && item.pages.length) {
        pageUrls = item.pages.slice();
      } else {
        const source = parseSequentialSource(item.url, item, win.location.href);
        if (!source) { status('作品のページURLがありません。'); return; }
        page = 1;
        requestedPage = 1;
        status('1ページ目を確認しています…');
        for (let index = 1; index <= 2000; index += 1) {
          if (generation !== generationAtStart) return;
          const url = await resolvePage(index, source);
          if (!url) break;
          pageUrls.push(url);
          updateControls();
          if (index === 1) renderPage(1);
          status(`${index}ページを確認しました`);
        }
      }
      if (!pageUrls.length) { status('画像を見つけられませんでした。'); return; }
      if (!Array.isArray(item.pages)) page = resume;
      page = Math.min(page, displayCount());
      requestedPage = page;
      const ready = await renderPage(page);
      showNextVolume();
      if (ready) status(`${pageUrls.length}ページ`);
    }

    return Object.freeze({
      resolve, start, close,
      getPageState() { return Object.freeze({ displayedPage: page, requestedPage, status: lastFailedRequest ? 'failed' : requestedPage === page ? 'ready' : 'loading', failedPage: lastFailedRequest?.page || null }); },
      getImageCacheSnapshot() { return imageLoader?.snapshot?.() || { activeCount: 0, queuedCount: 0, entries: [] }; },
    });
  }

  const api = Object.freeze({ create, parseSequentialSource, numberedPageUrl });
  if (typeof self !== 'undefined') self.ReaderRuntimeFactory = api;
  if (typeof window !== 'undefined') window.ReaderRuntimeFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
