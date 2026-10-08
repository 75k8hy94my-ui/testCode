(() => {
  'use strict';

  function create(dependencies = {}) {
    const { repository, target, location } = dependencies;
    for (const [name, value] of Object.entries({ repository, target, location })) {
      if (!value) throw new TypeError(`reader runtime requires ${name}`);
    }
    if (typeof repository.loadItem !== 'function' || typeof repository.saveItem !== 'function' || typeof location.replace !== 'function') {
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

      location.replace('manga.html');
      return null;
    }

    let closing = false;
    function close() {
      if (closing || destroyed) return;
      persistPage();
      const navigate = () => { if (!destroyed) { destroy(); location.replace('manga.html'); } };
      let pending;
      try { pending = repository.flushSync?.(); }
      catch (error) { status('クラウド同期に失敗しました。再度「閉じる」で試してください。' + (error?.message || '')); return false; }
      if (!pending || typeof pending.then !== 'function') { navigate(); return true; }
      closing = true;
      const button = byId('closeBtn');
      if (button) button.disabled = true;
      status('クラウドに同期しています…');
      return Promise.resolve(pending).then(() => {
        navigate();
        return true;
      }, (error) => {
        if (!destroyed) status('クラウド同期に失敗しました。再度「閉じる」で試してください。' + (error?.message || ''));
        return false;
      }).finally(() => {
        closing = false;
        if (button) button.disabled = false;
      });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      navigationGeneration += 1;
      verticalWindowGeneration += 1;
      pageTransition?.destroy();
      try { encryptedRenderer?.destroy?.(); } catch (_) {}
      encryptedRenderer = null;
      lifecycle?.destroy();
      try { dependencies.onDestroy?.(); } catch (_) {}
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
    let pendingVerticalScrollPage = null;
    let lastFailedRequest = null;
    let generation = 0;
    let encryptedRenderer = null;
    let encryptedAssetCachePromise = null;
    let encryptedPreviewLoader = null;
    let vertical = false;
    let split = false;
    let imageEnhanceEnabled = true;
    let destroyed = false;
    let lifecycle = null;
    let pageTransition = null;
    let progressRepository = dependencies.progressRepository || null;
    let pageSource = dependencies.pageSource || null;
    const keyFor = (id) => target.itemResumeKey ? target.itemResumeKey(id) : `item:${id}`;
    const byId = (id) => doc?.getElementById?.(id) || null;
    lifecycle = win?.ReaderLifecycleFactory?.create ? win.ReaderLifecycleFactory.create() : { listen: (node, event, fn, opts) => node?.addEventListener?.(event, fn, opts), cleanup: () => {}, own: (resource) => resource, timer: (id) => id, destroy() {} };
    for (const resource of dependencies.lifecycleResources || []) lifecycle.own(resource);
    if (!pageSource && win?.ReaderPageSourceFactory?.create) {
      const legacyResolver = win.ReaderPageSourceFactory.createLegacyResolver({ probe: (url, { signal } = {}) => new Promise((resolve) => {
        const image = new win.Image(); let timer;
        const finish = (value) => { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); image.onload = null; image.onerror = null; image.src = ''; resolve(value); };
        const onAbort = () => finish(false);
        if (signal?.aborted) { finish(false); return; }
        signal?.addEventListener?.('abort', onAbort, { once: true });
        image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
        image.onerror = () => finish(false);
        timer = win.setTimeout(() => finish(false), 5000);
        image.src = url;
      }), baseHref: win.location?.href });
      pageSource = win.ReaderPageSourceFactory.create({ legacyResolver });
    }
    pageTransition = win?.ReaderPageTransitionFactory?.create
      ? win.ReaderPageTransitionFactory.create({ initialPage: page, commit: commitPreparedPage })
      : null;

    function getImageLoader() {
      if (imageLoader) lifecycle.own(imageLoader);
      if (!imageLoader && win?.ReaderImageLoaderFactory?.create && typeof win.Image === 'function') {
        imageLoader = win.ReaderImageLoaderFactory.create({ Image: win.Image, baseUrl: win.location?.href, maxEntries: 8, maxConcurrent: 3, timeoutMs: 15000 });
        lifecycle.own(imageLoader);
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
      if (!progressRepository && win.ReaderProgressRepositoryFactory?.create) progressRepository = win.ReaderProgressRepositoryFactory.create({ storage: win.localStorage, scheduleSync: () => repository.scheduleSync?.() });
      const saved = progressRepository?.load(item.id, item);
      return saved && !saved.wasLast ? saved.page : 1;
    }
    function persistPage(pageToPersist = page) {
      if (currentItem && displayCount()) progressRepository?.commit(currentItem.id, pageToPersist, displayCount());
    }
    function revokeEncryptedRenderer() {
      if (encryptedRenderer) { try { encryptedRenderer.destroy(); } catch (_) {} }
      encryptedRenderer = null;
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
      const button = byId('nextVolumeBtn');
      if (button) button.dataset.nextItemId = next ? String(next.id) : '';
      if (!next) return;
      const text = byId('nextVolumeText'); if (text) text.textContent = `次の巻: ${next.title || next.volume}`;
    }
    function preparePageImage(image, pageNumber = page) {
      image.className = 'readerPageImage';
      image.alt = `ページ ${pageNumber}`;
      image.draggable = false;
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
    function prepareOrdinaryPage(targetPage, retry = false) {
      const stage = byId('pageStage');
      const viewer = byId('viewer');
      if (!stage || !viewer) return Promise.reject(new Error('ページ表示領域がありません'));
      const sourceIndex = split ? Math.floor((targetPage - 1) / 2) : targetPage - 1;
      const url = pageUrls[sourceIndex];
      if (!url) return Promise.reject(new Error('ページ画像がありません'));
      const loader = getImageLoader();
      const displayedUrl = pageUrls[split ? Math.floor((page - 1) / 2) : page - 1];
      loader.retain([displayedUrl, url]);
      loader.scheduleWindow(preloadUrlsForPage(targetPage));
      status(targetPage === page ? '' : 'ページを読み込み中…');
      const retryButton = byId('retryPageBtn'); if (retryButton) retryButton.hidden = true;
      const pendingImage = retry ? loader.retry(url, 1000) : loader.load(url, 1000);
      return pendingImage.then(async (cachedImage) => {
        // A split spread can request the second half of the same still-visible
        // source image. Keep the old node in place until a decoded display node
        // is ready for the next frame.
        const image = cachedImage.isConnected ? cachedImage.cloneNode(false) : cachedImage;
        if (image !== cachedImage) {
          image.decoding = 'async';
          if (typeof image.decode === 'function') await image.decode();
          if (!(image.naturalWidth > 0) || !(image.naturalHeight > 0)) throw new Error('cached split image is not display-ready');
        }
        const frame = doc.createElement('div');
        frame.className = 'readerPageFrame';
        const readyImage = preparePageImage(image, targetPage);
        if (split) {
          const crop = doc.createElement('div');
          crop.className = `spreadCrop ${targetPage % 2 ? 'spreadRight' : 'spreadLeft'}`;
          crop.appendChild(readyImage);
          frame.appendChild(crop);
        } else frame.appendChild(readyImage);
        return { ready: true, frame, image: readyImage, kind: 'ordinary' };
      });
    }
    function commitPreparedPage(targetPage, candidate) {
      const stage = byId('pageStage');
      const viewer = byId('viewer');
      if (!stage || !viewer || !candidate?.frame) throw new Error('ページ表示領域がありません');
      const previousRenderer = encryptedRenderer;
      restorePageEnhancements();
      stage.replaceChildren(candidate.frame);
      stage.classList.remove('vertical-scroll');
      viewer.classList.remove('vertical-scroll');
      encryptedRenderer = candidate.renderer || null;
      page = targetPage;
      requestedPage = targetPage;
      lastFailedRequest = null;
      const retryButton = byId('retryPageBtn'); if (retryButton) retryButton.hidden = true;
      status('');
      updateControls();
      persistPage();
      updateTocButton();
      showNextVolume();
      if (candidate.image && imageEnhanceEnabled && !doc.body.classList.contains('safe-mode')) win.ReaderImageEnhancement?.enhanceElement(candidate.image, { documentRef: doc, windowRef: win });
      if (previousRenderer && previousRenderer !== encryptedRenderer) previousRenderer.destroy();
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
      pageWindow.forEach((pageNumber, index) => {
        const url = pageUrls[pageNumber - 1];
        const slot = verticalSlots[pageNumber - 1];
        if (!url || !slot || slot.firstChild) return;
        loader.load(url, pageWindow.length - index).then((image) => {
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
    function renderVerticalPages(targetPage, navId, scrollToPage = true) {
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
        if (navId !== navigationGeneration || !vertical || destroyed) return false;
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
        if (scrollToPage) targetSlot?.scrollIntoView?.({ block: 'start' });
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
    function getEncryptedPreviewLoader() {
      if (!encryptedPreviewLoader) {
        encryptedPreviewLoader = win.EncryptedAssetReader.createPreviewLoader({ maxEntries: 4 });
        lifecycle.own(encryptedPreviewLoader);
      }
      return encryptedPreviewLoader;
    }
    function encryptedPreviewOptions(entry) {
      const active = win.MangaVault?.loadActive?.();
      if (!active?.rawKey) throw new Error('保管庫を開いてください。');
      const config = win.MANGA_READER_SUPABASE || {};
      const storage = win.EncryptedAssetStorage.createStorageTransport({ baseUrl: config.url, publishableKey: config.publishableKey });
      return {
        manifest: entry.manifest, assetId: entry.assetId, revision: entry.revision,
        masterKey: active.rawKey, vault: win.MangaVault, storage, cache: (encryptedAssetCachePromise ||= win.EncryptedAssetCache.createCache()),
        mediaAccess: win.MangaReaderMediaAccess, sync: win.EncryptedAssetSync, settings: win.ImageTransferSettings,
        remoteAccess: win.ImageRemoteAccess, crypto: win.EncryptedAssetCrypto,
      };
    }
    async function prepareEncryptedPage(targetPage, retry = false) {
      const entry = encryptedPages[targetPage - 1];
      if (!entry) throw new Error('暗号化ページがありません');
      const previewLoader = getEncryptedPreviewLoader();
      const factory = win.ReaderImageLoaderFactory;
      const direction = targetPage < page ? 'prev' : 'next';
      const pagesToPreload = factory?.preloadWindow ? factory.preloadWindow(targetPage, encryptedPages.length, direction).slice(0, 3) : [targetPage, targetPage + (direction === 'prev' ? -1 : 1), targetPage - (direction === 'prev' ? -1 : 1)];
      const retainedEntries = [...new Set([page, ...pagesToPreload])].map((number) => encryptedPages[number - 1]).filter(Boolean);
      const optionsFor = (candidate) => encryptedPreviewOptions(candidate);
      previewLoader.retain(retainedEntries.map((candidate) => previewLoader.keyFor(optionsFor(candidate))));
      const previewOptions = optionsFor(entry);
      const previewRequest = retry ? previewLoader.retry(previewOptions) : previewLoader.load(previewOptions);
      for (const number of pagesToPreload) {
        if (number === targetPage) continue;
        const candidate = encryptedPages[number - 1];
        if (candidate) previewLoader.load(optionsFor(candidate)).catch(() => {});
      }
      const previewResource = await previewRequest;
      const host = doc.createElement('div'); host.className = 'encryptedAssetHost';
      const options = optionsFor(entry);
      const renderer = win.EncryptedAssetReader.createEncryptedAssetReader({
        container: host, ...options, previewResource, previewResourceLoader: { load: async () => previewResource },
        onPreviewError: () => {},
      });
      renderer.mount();
      try { await renderer.readyPromise; }
      catch (error) { renderer.destroy(); throw error; }
      return { ready: true, frame: host, renderer, kind: 'encrypted', destroy: () => renderer.destroy() };
    }
    function renderPage(number = requestedPage, retry = false) {
      const targetPage = Math.max(1, Math.min(displayCount() || 1, Math.floor(Number(number) || 1)));
      const stage = byId('pageStage');
      const wantsVertical = vertical && !split && !encryptedPages.length;
      const layoutMatches = !!stage?.firstChild && stage.classList.contains('vertical-scroll') === wantsVertical;
      if (!retry && targetPage === page && !lastFailedRequest && layoutMatches) {
        pageTransition?.invalidate();
        navigationGeneration += 1;
        requestedPage = targetPage;
        status('');
        return Promise.resolve(true);
      }
      requestedPage = targetPage;
      if (!retry) lastFailedRequest = null;
      if (wantsVertical) {
        pageTransition?.invalidate();
        const navId = ++navigationGeneration;
        return renderVerticalPages(targetPage, navId);
      }
      status(targetPage === page ? '' : 'ページを読み込み中…');
      return pageTransition.request(targetPage, () => encryptedPages.length
        ? prepareEncryptedPage(targetPage, retry)
        : prepareOrdinaryPage(targetPage, retry))
        .then((ready) => {
          if (ready) return true;
          if (pageTransition.getState().status === 'failed') {
            const url = encryptedPages.length ? null : pageUrls[split ? Math.floor((targetPage - 1) / 2) : targetPage - 1];
            lastFailedRequest = { page: targetPage, url };
            status('画像を読み込めませんでした。表示中のページは維持されています。');
            const retryButton = byId('retryPageBtn'); if (retryButton) retryButton.hidden = false;
          }
          return false;
        });
    }
    function goTo(number) {
      if (!Number.isFinite(Number(number))) return;
      return renderPage(number);
    }
    function next() { if (requestedPage < displayCount()) goTo(requestedPage + 1); }
    function previous() { if (requestedPage > 1) goTo(requestedPage - 1); }
    function bind(id, event, callback, options) { const node = byId(id); if (node) lifecycle.listen(node, event, callback, options); }
    function bindControls() {
      lifecycle.listen(win, 'pagehide', destroy);
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
      bind('verticalBtn', 'click', () => {
        if (split || encryptedPages.length) return;
        vertical = !vertical;
        verticalSlots = [];
        pendingVerticalScrollPage = null;
        navigationGeneration++;
        verticalWindowGeneration++;
        doc.body.classList.toggle('vertical-scroll', vertical);
        win.localStorage.setItem('mangaReaderVerticalScroll', vertical ? '1' : '0');
        renderPage(page);
      });
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
        if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage > pageUrls.length) return;
        if (!currentSlot.slot.firstChild) {
          if (pendingVerticalScrollPage === nextPage) return;
          pendingVerticalScrollPage = nextPage;
          const navId = ++navigationGeneration;
          renderVerticalPages(nextPage, navId, false).finally(() => {
            if (pendingVerticalScrollPage === nextPage) pendingVerticalScrollPage = null;
          });
          return;
        }
        if (pendingVerticalScrollPage !== null) {
          pendingVerticalScrollPage = null;
          navigationGeneration++;
        }
        if (nextPage !== page) {
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
      bind('nextVolumeBtn', 'click', (event) => {
        const itemId = event.currentTarget?.dataset?.nextItemId;
        if (itemId) location.assign(target.buildReaderUrl(itemId, 'reader.html'));
      });
      lifecycle.listen(win, 'keydown', (event) => { if (event.key === 'ArrowRight' || event.key === ' ') next(); else if (event.key === 'ArrowLeft') previous(); });
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
      pendingVerticalScrollPage = null;
      vertical = !split && !item.encryptedAssets && win.localStorage.getItem('mangaReaderVerticalScroll') === '1';
      const verticalButton = byId('verticalBtn');
      if (verticalButton) verticalButton.hidden = split || Boolean(item.encryptedAssets);
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
        await renderPage(page); if (!destroyed) showNextVolume(); return;
      }
      if (!pageSource) { status('ページ一覧を解決できません。'); return; }
      status(Array.isArray(item.pages) || item.pageManifest ? 'ページを準備しています…' : 'ページ一覧を初回確認しています…');
      const AbortControllerRef = win.AbortController || globalThis.AbortController;
      const discoveryController = typeof AbortControllerRef === 'function' ? new AbortControllerRef() : null;
      if (discoveryController) lifecycle.own({ destroy: () => discoveryController.abort() });
      const resolved = await pageSource.resolve(item, { signal: discoveryController?.signal });
      if (destroyed || generationAtStart !== generation) return;
      pageUrls = resolved.urls;
      if (!pageUrls.length) { status('画像を見つけられませんでした。'); return; }
      if (resolved.migrated || !item.pageManifest) {
        currentItem = repository.saveItem(resolved.item) || resolved.item;
      }
      page = Math.min(resume, displayCount());
      requestedPage = page;
      const ready = await renderPage(page);
      if (destroyed) return;
      showNextVolume();
      if (ready) status(`${pageUrls.length}ページ`);
    }

    return Object.freeze({
      resolve, start, close, destroy, goTo, next, previous,
      getPageState() { const state = pageTransition?.getState(); return Object.freeze({ displayedPage: page, requestedPage, status: lastFailedRequest ? 'failed' : state?.status || (requestedPage === page ? 'ready' : 'loading'), failedPage: lastFailedRequest?.page || null }); },
      getImageCacheSnapshot() { return imageLoader?.snapshot?.() || { activeCount: 0, queuedCount: 0, entries: [] }; },
    });
  }

  const api = Object.freeze({ create });
  if (typeof self !== 'undefined') self.ReaderRuntimeFactory = api;
  if (typeof window !== 'undefined') window.ReaderRuntimeFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
