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
      activeDiscoveryController?.abort?.();
      navigationGeneration += 1;
      verticalWindowGeneration += 1;
      pageTransition?.destroy();
      try { encryptedRenderer?.destroy?.(); } catch (_) {}
      encryptedRenderer = null;
      if (embeddedFrame) { embeddedFrame.remove?.(); embeddedFrame = null; }
      if (hashPageBase) byId('pageStage')?.replaceChildren?.();
      for (const iframe of Array.from(hashFrameChecks.keys())) disposeHashObservation(iframe);
      hashIframe = null;
      hashUserScrollUntil = 0;
      hashVerticalSlots.length = 0;
      lifecycle?.destroy();
      try { dependencies.onDestroy?.(); } catch (_) {}
    }

    async function start(itemId) {
      const resolved = await resolve(itemId);
      if (!resolved) return null;
      if (!dependencies.document || !dependencies.window) throw new TypeError('reader runtime requires document and window to render');
      const ready = await mountItem(resolved.item);
      if (destroyed) return null;
      if (!ready) {
        const retryButton = byId('retryPageBtn');
        const guidance = retryButton && retryButton.hidden === false
          ? '「再試行」を押してください。'
          : '本棚から作品のページ情報を確認してください。';
        throw new Error('最初のページを表示できませんでした。' + guidance);
      }
      return resolved.item;
    }

    const doc = dependencies.document;
    const win = dependencies.window;
    let imageLoader = dependencies.imageLoader || null;
    let currentItem = null;
    let embeddedFrame = null;
    let hashPageBase = '';
    let hashIframe = null;
    let hashMaxVisited = 1;
    let hashKnownTotal = 0;
    const hashConfirmedPages = new Set([1]);
    const hashRejectedPages = new Set();
    const hashFrameChecks = new Map();
    let hashPreviousPage = 1;
    // A scroll event also fires after programmatic scrollTop writes, iframe
    // layout changes and browser scroll anchoring. None of those can advance
    // the reader unless a real scroll gesture was observed first.
    let hashUserScrollUntil = 0;
    const hashVerticalSlots = [];
    let pageUrls = [];
    let sourceCandidates = [];
    const directoryDetectionCache = new Map();
    const virtualDetectedSources = new Map();
    let directoryPreflightDone = false;
    let sourceOriginalItem = null;
    let sourceIndex = 0;
    let sourceReady = false;
    let sourceSwitching = false;
    let activeAutoDetectedDirectory = false;
    let controlsBound = false;
    let activeDiscoveryController = null;
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
      }), baseHref: win.location?.href, getCachedInfo: (item, source) => {
        // Older books stored their numbering width and extension in the
        // metadata map rather than on each saved work. Without these hints a
        // book containing 001.webp is mistakenly probed as 1.jpg.
        try {
          const records = JSON.parse(win.localStorage?.getItem('mangaReaderInfoCache') || '{}');
          if (!records || typeof records !== 'object' || Array.isArray(records)) return null;
          const keys = [item?.id ? 'item:' + String(item.id) : '', source?.base, item?.url].filter(Boolean);
          return keys.map((key) => records[key]).find((value) => value && typeof value === 'object' && !Array.isArray(value)) || null;
        } catch (_) { return null; }
      } });
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
    function displayCount() { return hashPageBase ? (hashKnownTotal || hashMaxVisited) : encryptedPages.length || pageUrls.length * (split ? 2 : 1); }
    function updateControls() {
      const slider = byId('pageSlider');
      const label = byId('pageLabel');
      if (slider) {
        slider.max = String(hashPageBase
          ? (hashKnownTotal || Math.min(win.MangaSourceType.MAX_HASH_PAGE, Math.max(2, hashMaxVisited + 1)))
          : Math.max(1, displayCount()));
        slider.value = String(page);
      }
      if (label) label.textContent = hashPageBase ? `${page} / ${hashKnownTotal || '?'}` : `${page} / ${Math.max(1, displayCount())}`;
      if (hashPageBase) {
        const nextButton = byId('nextBtn');
        if (nextButton) nextButton.disabled = !!hashKnownTotal && page >= hashKnownTotal;
        const lastButton = byId('lastBtn');
        if (lastButton) {
          const description = hashKnownTotal
            ? '最後のページ'
            : '最後に閲覧したページ（総ページ数は未確定）';
          lastButton.title = description;
          lastButton.setAttribute('aria-label', description);
        }
      }
      const title = byId('currentTitle'); if (title) title.textContent = currentItem?.title || currentItem?.url || '漫画';
    }
    function readMap(key) {
      try { const value = JSON.parse(win.localStorage.getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
      catch (_) { return {}; }
    }
    function resumePage(item) {
      if (!progressRepository && win.ReaderProgressRepositoryFactory?.create) progressRepository = win.ReaderProgressRepositoryFactory.create({
        storage: win.localStorage,
        scheduleSync: () => repository.scheduleSync?.(),
        markPending: () => {
          if (win.TestCodeGuest?.isActive()) return true;
          const vault = win.MangaVault;
          const session = vault?.loadSession?.();
          if (!session?.user?.id) return true;
          return typeof vault.markLocalChangesPending === 'function' && vault.markLocalChangesPending() === true;
        },
      });
      const saved = progressRepository?.load(item.id, item);
      return saved && !saved.wasLast ? saved.page : 1;
    }
    function persistPage(pageToPersist = page) {
      if (currentItem && (hashPageBase || displayCount()) && progressRepository?.commit(currentItem.id, pageToPersist, hashPageBase ? 0 : displayCount()) === false) {
        status('読書位置を端末に保存できませんでした。ブラウザの保存容量を確認してください。');
      }
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
      const banner = byId('nextVolumeBanner');
      if (!banner) return;
      // A hash-only external frame cannot reveal the final page.
      if (hashPageBase) { banner.hidden = true; return; }
      const next = repository.findNextVolume?.(currentItem);
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
      const message = byId('readerMessage');
      if (message) message.textContent = '';
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
        onSourcePageFailure(targetPage);
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
    function onSourcePageFailure(failedPage) {
      if (!sourceReady || sourceSwitching) return;
      // An image discovered under /manga/ is a temporary interpretation of
      // that saved URL. Try the original web page if a later image breaks.
      const tryOriginal = activeAutoDetectedDirectory && !virtualDetectedSources.has(sourceCandidates[sourceIndex]);
      if (!tryOriginal && sourceIndex >= sourceCandidates.length - 1) return;
      sourceReady = false;
      void activateSources(tryOriginal ? sourceIndex : sourceIndex + 1, failedPage, tryOriginal).then((ready) => {
        if (!ready && !destroyed) status('すべての漫画URLでページを読み込めませんでした。');
      }).catch((error) => { if (!destroyed) status(error?.message || '代替URLを読み込めませんでした。'); });
    }
    function renderPage(number = requestedPage, retry = false) {
      if (hashPageBase) return Promise.resolve(showHashPage(number));
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
            onSourcePageFailure(targetPage);
          }
          return false;
        });
    }
    function goTo(number) {
      if (!Number.isFinite(Number(number))) return;
      return renderPage(number);
    }
    function next() {
      if (hashPageBase) {
        if (requestedPage < (hashKnownTotal || win.MangaSourceType.MAX_HASH_PAGE)) goTo(requestedPage + 1);
        return;
      }
      if (requestedPage < displayCount()) goTo(requestedPage + 1);
    }
    function previous() { if (requestedPage > 1) goTo(requestedPage - 1); }
    function bind(id, event, callback, options) { const node = byId(id); if (node) lifecycle.listen(node, event, callback, options); }
    function bindControls() {
      lifecycle.listen(win, 'pagehide', destroy);
      bind('closeBtn', 'click', close);
      bind('prevBtn', 'click', previous); bind('nextBtn', 'click', next);
      bind('firstBtn', 'click', () => goTo(1)); bind('lastBtn', 'click', () => goTo(displayCount()));
      bind('pageSlider', 'change', (event) => goTo(Number(event.target.value)));
      bind('retryPageBtn', 'click', () => { if (lastFailedRequest) renderPage(lastFailedRequest.page, true); });
      bind('switchSourceBtn', 'click', () => {
        if (!sourceOriginalItem || sourceCandidates.length < 2 || sourceSwitching) return;
        sourceReady = false;
        void activateSources((sourceIndex + 1) % sourceCandidates.length, page).then((ready) => {
          if (!ready && !destroyed) status('ほかのURLにも接続できませんでした。');
        });
      });
      bind('favToggleBtn', 'click', () => {
        const updated = repository.updateItem(currentItem.id, { favorite: !currentItem.favorite });
        if (updated) { currentItem = updated; renderFavorite(); }
      });
      bind('tocAddBtn', 'click', saveTocEntry); bind('tocBtn', 'click', renderToc);
      bind('safeModeBtn', 'click', (event) => {
        // The button must toggle in either direction on mobile; do not let a
        // touch-generated click propagate to any reader gesture handlers.
        event?.stopPropagation?.();
        const active = !doc.body.classList.contains('safe-mode');
        setSafeMode(active);
        try { win.localStorage.setItem('mangaReaderSafeMode', active ? '1' : '0'); } catch (_) {}
      });
      bind('enhanceBtn', 'click', (event) => { imageEnhanceEnabled = !imageEnhanceEnabled; doc.body.classList.toggle('image-enhance', imageEnhanceEnabled); event.currentTarget.setAttribute('aria-pressed', imageEnhanceEnabled ? 'true' : 'false'); win.localStorage.setItem('mangaReaderImageEnhance', imageEnhanceEnabled ? '1' : '0'); if (imageEnhanceEnabled) applyPageEnhancements(); else restorePageEnhancements(); });
      bind('verticalBtn', 'click', () => {
        if (split || encryptedPages.length) return;
        if (hashPageBase) {
          hashUserScrollUntil = 0;
          vertical = !vertical;
          doc.body.classList.toggle('vertical-scroll', vertical);
          win.localStorage.setItem('mangaReaderVerticalScroll', vertical ? '1' : '0');
          renderHashLayout();
          return;
        }
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
        // The #1 reader also accepts tap navigation when vertical layout is
        // enabled; scrolling gestures do not generate a click.
        if (vertical && !hashPageBase) return;
        if (x < win.innerWidth * 0.35) previous(); else if (x > win.innerWidth * 0.65) next();
      });
      const markHashScrollIntent = () => {
        if (hashPageBase && vertical) hashUserScrollUntil = Date.now() + 1500;
      };
      bind('viewer', 'wheel', markHashScrollIntent, { passive: true });
      bind('viewer', 'touchmove', markHashScrollIntent, { passive: true });
      // Includes scrollbar dragging and touch gestures that scroll after pointerdown.
      bind('viewer', 'pointerdown', markHashScrollIntent, { passive: true });
      bind('viewer', 'scroll', () => {
        if (hashPageBase) { onHashVerticalScroll(); return; }
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
      // Capture the host's arrow keys before the browser's default scroll
      // behavior or any bubble-phase handler can interpret them.
      lifecycle.listen(win, 'keydown', (event) => {
        if (hashPageBase && vertical && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) {
          hashUserScrollUntil = Date.now() + 1500;
        }
        if (hashPageBase && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          event.preventDefault?.();
          if (event.key === 'ArrowRight') next();
          else previous();
          return;
        }
        if (event.key === 'ArrowRight' || event.key === ' ') next();
        else if (event.key === 'ArrowLeft') previous();
      }, { capture: true });
      // Events inside a cross-origin iframe do not bubble into the parent.
      // Keep keyboard focus in the reader even if the embedded site calls
      // focus() after loading or a browser makes the frame active.
      lifecycle.listen(doc, 'focusin', (event) => restoreHashReaderFocus(event.target), { capture: true });
      lifecycle.listen(win, 'blur', () => {
        if (hashPageBase && hashFrameChecks.has(doc.activeElement)) {
          restoreHashReaderFocus(doc.activeElement);
        }
      });
      if (vertical) doc.body.classList.add('vertical-scroll');
      imageEnhanceEnabled = win.localStorage.getItem('mangaReaderImageEnhance') !== '0';
      doc.body.classList.toggle('image-enhance', imageEnhanceEnabled);
      byId('enhanceBtn')?.setAttribute('aria-pressed', imageEnhanceEnabled ? 'true' : 'false');
      // Right-click launch is temporary: it does not change the stored
      // default unless the reader's own safe-mode button is pressed.
      const launchSafeMode = /(?:^|[?&])safe=1(?:&|$)/.test(String(win.location?.search || ''));
      setSafeMode(launchSafeMode || win.localStorage.getItem('mangaReaderSafeMode') === '1');
    }
    function setSafeMode(active) {
      doc.body.classList.toggle('safe-mode', active);
      const button = byId('safeModeBtn');
      if (button) {
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        const actionLabel = active ? 'セーフモードを解除' : 'セーフモードを有効化';
        button.setAttribute('aria-label', actionLabel);
        button.title = actionLabel;
      }
      if (active) restorePageEnhancements();
      else applyPageEnhancements();
    }
    function applyPageEnhancements() {
      if (!imageEnhanceEnabled || doc.body.classList.contains('safe-mode')) return;
      byId('pageStage')?.querySelectorAll('.readerPageImage').forEach((image) => win.ReaderImageEnhancement?.enhanceElement(image, { documentRef: doc, windowRef: win }));
    }
    function restoreHashReaderFocus(iframe) {
      if (destroyed || !hashPageBase || !hashFrameChecks.has(iframe)) return false;
      const viewer = byId('viewer');
      // The frame is inert, but sites can still auto-focus their own browsing
      // context. Give focus back to a non-scrolling parent target.
      if (!viewer || typeof viewer.focus !== 'function') return false;
      try { viewer.focus({ preventScroll: true }); }
      catch (_) { viewer.focus(); }
      return true;
    }

    function interceptHashChildArrow(entry, event) {
      if (destroyed || !hashPageBase || !hashFrameChecks.has(entry.iframe)) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // Same-origin frames are available for capture-phase interception.
      // On cross-origin frames this listener cannot be installed; focus
      // containment above keeps keyboard input in the host instead.
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      event.stopPropagation?.();
      restoreHashReaderFocus(entry.iframe);
      if (event.key === 'ArrowRight') next();
      else previous();
    }

    // A trailing #1 declares a sequence of non-interactive external frames.
    // A site may normalize #1 to #1-; that alone is never an end marker.
    // For other requested pages, #1- means the target fell back to the start.
    // Cross-origin iframe URL reads are forbidden, so only readable frames
    // can participate in this on-demand end-of-book detection.
    function hashUrl(number) {
      return win.MangaSourceType?.hashPageUrl(hashPageBase, number) || '';
    }
    function disposeHashObservation(iframe) {
      const entry = hashFrameChecks.get(iframe);
      if (!entry) return;
      for (const timer of entry.timers) win.clearTimeout?.(timer);
      entry.timers.clear();
      try {
        entry.childWindow?.removeEventListener?.('hashchange', entry.inspect);
        entry.childWindow?.removeEventListener?.('popstate', entry.inspect);
        entry.childWindow?.removeEventListener?.('keydown', entry.onChildKeydown, true);
      } catch (_) {}
      iframe.removeEventListener?.('load', entry.onLoad);
      iframe.removeEventListener?.('focus', entry.onFocus);
      hashFrameChecks.delete(iframe);
    }
    function truncateHashVerticalSlots() {
      if (!hashKnownTotal) return;
      while (hashVerticalSlots.length > hashKnownTotal) {
        const entry = hashVerticalSlots.pop();
        const iframe = entry.frame?.firstChild;
        if (iframe) disposeHashObservation(iframe);
        entry.slot.remove?.();
      }
    }
    function onHashFallback(number) {
      if (destroyed || number <= 1 || hashRejectedPages.has(number)) return;
      hashRejectedPages.add(number);
      hashConfirmedPages.delete(number);
      if (hashConfirmedPages.has(number - 1)) {
        // Only a validated immediately preceding page establishes the end.
        hashKnownTotal = number - 1;
        hashMaxVisited = Math.min(hashMaxVisited, hashKnownTotal);
        truncateHashVerticalSlots();
        if (currentItem && (currentItem.hashPageCount !== hashKnownTotal || currentItem.hashPageCountSource !== hashPageBase || currentItem.hashPageCountVersion !== 2)) {
          const updated = repository.updateItem?.(currentItem.id, {
            hashPageCount: hashKnownTotal, hashPageCountSource: hashPageBase, hashPageCountVersion: 2
          });
          if (updated) currentItem = updated;
        }
      } else {
        // Jumping straight to #60 proves #60 is invalid, not that #59 exists.
        hashMaxVisited = Math.max(1, ...hashConfirmedPages);
      }
      if (page === number) {
        const fallback = hashKnownTotal || Math.min(hashPreviousPage, hashMaxVisited);
        if (fallback > 0 && fallback !== number) showHashPage(fallback);
      }
      updateControls();
      status(hashKnownTotal
        ? `最終ページは${hashKnownTotal}ページです。`
        : `${number}ページは先頭へ戻されました。前のページから順番に読むと最終ページを判定できます。`);
    }
    function inspectHashObservation(entry) {
      if (destroyed || !hashFrameChecks.has(entry.iframe)) return false;
      let observed;
      try { observed = entry.iframe.contentWindow?.location?.hash; }
      catch (_) { return false; } // A cross-origin iframe exposes no URL.
      if (typeof observed !== 'string') return false;
      const number = entry.number;
      if (number > 1 && observed === '#1-') {
        if (entry.resetPage !== number) {
          entry.resetPage = number;
          onHashFallback(number);
        }
      } else if (observed === '#' + number || observed === '#' + number + '-') {
        hashConfirmedPages.add(number);
      }
      return true;
    }
    function scheduleHashChecks(entry) {
      if (typeof win.setTimeout !== 'function') return;
      for (const timer of entry.timers) win.clearTimeout?.(timer);
      entry.timers.clear();
      // hashchange misses history.replaceState; a short bounded series of
      // reads also catches that normalization without scanning other pages.
      for (const delay of [150, 500, 1200]) {
        const timer = win.setTimeout(() => {
          entry.timers.delete(timer);
          inspectHashObservation(entry);
        }, delay);
        entry.timers.add(timer);
      }
    }
    function observeHashFrame(iframe, number) {
      let entry = hashFrameChecks.get(iframe);
      if (!entry) {
        entry = { iframe, number, childWindow: null, loaded: false, timers: new Set(), resetPage: 0, onLoad: null, onFocus: null, onChildKeydown: null, inspect: null };
        entry.inspect = () => inspectHashObservation(entry);
        entry.onFocus = () => restoreHashReaderFocus(iframe);
        entry.onChildKeydown = (event) => interceptHashChildArrow(entry, event);
        entry.onLoad = () => {
          entry.loaded = true;
          // A full document load replaces listeners inside the child window.
          try {
            entry.childWindow?.removeEventListener?.('hashchange', entry.inspect);
            entry.childWindow?.removeEventListener?.('popstate', entry.inspect);
            entry.childWindow?.removeEventListener?.('keydown', entry.onChildKeydown, true);
            const child = iframe.contentWindow;
            void child.location.hash;
            child.addEventListener('hashchange', entry.inspect);
            child.addEventListener('popstate', entry.inspect);
            child.addEventListener('keydown', entry.onChildKeydown, true);
            entry.childWindow = child;
          } catch (_) { entry.childWindow = null; }
          entry.inspect();
          if (entry.childWindow) scheduleHashChecks(entry);
          if (doc.activeElement === iframe) restoreHashReaderFocus(iframe);
        };
        hashFrameChecks.set(iframe, entry);
        iframe.addEventListener?.('load', entry.onLoad);
        iframe.addEventListener?.('focus', entry.onFocus);
      } else {
        entry.number = number;
        entry.resetPage = 0;
        // Changing only the hash may not fire iframe.onload. The existing
        // child's hashchange listener and delayed inspection cover that case.
        if (entry.childWindow) scheduleHashChecks(entry);
      }
    }
    function createHashFrame(number) {
      const url = hashUrl(number);
      if (!url) return null;
      const frame = doc.createElement('div');
      frame.className = 'readerHashFrame';
      frame.style.pointerEvents = 'none';
      const iframe = doc.createElement('iframe');
      iframe.src = url;
      iframe.title = (currentItem?.title || '漫画') + ' - ' + number + 'ページ';
      iframe.loading = 'eager';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox');
      iframe.setAttribute('tabindex', '-1');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.inert = true;
      iframe.style.pointerEvents = 'none';
      observeHashFrame(iframe, number);
      frame.appendChild(iframe);
      // Cross-origin iframe events never bubble up to the host. A real
      // transparent hit target above the iframe makes left/right taps and
      // clicks reliable on all browsers while allowing vertical gestures.
      const shield = doc.createElement('div');
      shield.className = 'readerHashInputShield';
      shield.setAttribute('aria-hidden', 'true');
      shield.addEventListener('pointerdown', () => {
        if (destroyed || !hashPageBase) return;
        try { byId('viewer')?.focus?.({ preventScroll: true }); } catch (_) {}
      }, { passive: true });
      frame.appendChild(shield);
      return { frame, iframe };
    }
    function ensureHashVerticalSlots(count) {
      const stage = byId('pageStage');
      if (!stage) return;
      const max = Math.min(hashKnownTotal || win.MangaSourceType.MAX_HASH_PAGE, count);
      while (hashVerticalSlots.length < max) {
        const slot = doc.createElement('div');
        slot.className = 'readerHashVerticalSlot';
        slot.dataset.page = String(hashVerticalSlots.length + 1);
        stage.appendChild(slot);
        hashVerticalSlots.push({ slot, frame: null });
      }
    }
    function updateHashVerticalWindow(center) {
      for (let i = 0; i < hashVerticalSlots.length; i += 1) {
        const entry = hashVerticalSlots[i];
        if ((!hashKnownTotal || i + 1 <= hashKnownTotal) && Math.abs(i + 1 - center) <= 1) {
          if (!entry.frame) {
            const candidate = createHashFrame(i + 1);
            if (candidate) { entry.slot.replaceChildren(candidate.frame); entry.frame = candidate.frame; }
          }
        } else if (entry.frame) {
          const iframe = entry.frame.firstChild;
          if (iframe) disposeHashObservation(iframe);
          entry.slot.replaceChildren();
          entry.frame = null;
        }
      }
    }
    function renderHashLayout() {
      const stage = byId('pageStage'), viewer = byId('viewer');
      if (!stage || !viewer) return;
      // Reset intent before a DOM rebuild: its scroll/anchor events are not
      // equivalent to a fresh wheel, touch or scrollbar-drag gesture.
      hashUserScrollUntil = 0;
      for (const iframe of Array.from(hashFrameChecks.keys())) disposeHashObservation(iframe);
      stage.replaceChildren();
      hashVerticalSlots.length = 0;
      hashIframe = null;
      if (vertical) {
        stage.classList.add('vertical-scroll');
        viewer.classList.add('vertical-scroll');
        ensureHashVerticalSlots(Math.max(page + 2, hashMaxVisited + 1));
        updateHashVerticalWindow(page);
        viewer.scrollTop = (page - 1) * (viewer.clientHeight || win.innerHeight || 800);
      } else {
        stage.classList.remove('vertical-scroll');
        viewer.classList.remove('vertical-scroll');
        const current = createHashFrame(page);
        if (current) {
          stage.appendChild(current.frame);
          hashIframe = current.iframe;
        }
      }
    }
    function showHashPage(value) {
      const number = Math.floor(Number(value));
      if (!Number.isSafeInteger(number) || !hashUrl(number) || destroyed
        || (hashKnownTotal && number > hashKnownTotal) || hashRejectedPages.has(number)) return false;
      // A button/slider jump sets scrollTop deliberately. Its resulting
      // scroll events must not trigger a new page-discovery cycle.
      hashUserScrollUntil = 0;
      if (number === page && byId('pageStage')?.firstChild) return true;
      hashPreviousPage = page;
      if (vertical) {
        hashMaxVisited = Math.max(hashMaxVisited, number);
        ensureHashVerticalSlots(Math.max(number + 2, hashMaxVisited + 1));
        updateHashVerticalWindow(number);
        const viewer = byId('viewer');
        if (viewer) viewer.scrollTop = (number - 1) * (viewer.clientHeight || win.innerHeight || 800);
      } else if (hashIframe) {
        // Keep the same embedded document alive. Recreating an iframe for
        // every click reloads the source site and can reset its hash router
        // back to #1, making both keyboard and click navigation appear broken.
        // Updating src with a fragment is a same-document navigation when
        // the provider supports it, including cross-origin frames.
        const nextUrl = hashUrl(number);
        observeHashFrame(hashIframe, number);
        hashIframe.src = nextUrl;
      } else return false;
      page = requestedPage = number;
      hashMaxVisited = Math.max(hashMaxVisited, number);
      const link = byId('openSourceBtn'); if (link) link.href = hashUrl(number);
      updateControls();
      updateTocButton();
      persistPage();
      showNextVolume();
      return true;
    }
    function onHashVerticalScroll() {
      if (!vertical || !hashPageBase || destroyed || Date.now() > hashUserScrollUntil) return;
      const viewer = byId('viewer');
      if (!viewer) return;
      const height = viewer.clientHeight || win.innerHeight || 800;
      const visible = Math.max(1, Math.min(hashVerticalSlots.length, Math.floor((viewer.scrollTop + height * 0.5) / height) + 1));
      if (visible !== page) {
        hashPreviousPage = page;
        page = requestedPage = visible;
        hashMaxVisited = Math.max(hashMaxVisited, visible);
        const link = byId('openSourceBtn'); if (link) link.href = hashUrl(visible);
        updateControls();
        updateTocButton();
        persistPage();
      }
      ensureHashVerticalSlots(visible + 2);
      updateHashVerticalWindow(visible);
    }
    function mountHashReader() {
      doc.body.classList.add('hash-page-reader');
      const controls = byId('controls'); if (controls) controls.hidden = false;
      const link = byId('openSourceBtn');
      if (link) { link.href = hashUrl(page); link.hidden = false; }
      const message = byId('readerMessage'); if (message) message.textContent = '';
      renderHashLayout();
      // Ensure keys are directed at the reader rather than an auto-focused
      // embedded frame, without disrupting a user-focused toolbar control.
      const active = doc.activeElement;
      if (!active || active === doc.body || hashFrameChecks.has(active)) {
        try { byId('viewer')?.focus?.({ preventScroll: true }); } catch (_) {}
      }
      updateControls();
      updateTocButton();
      showNextVolume();
      persistPage();
      status(hashKnownTotal
        ? `全${hashKnownTotal}ページ`
        : 'ページ送りの際に最終ページを判定します。外部サイトのURL変化は取得できない場合があります。');
      return true;
    }
    function mountEmbeddedPage(url) {
      const stage = byId('pageStage');
      const viewer = byId('viewer');
      if (!stage || !viewer) throw new Error('埋め込み表示領域がありません。');
      const frame = doc.createElement('div');
      frame.className = 'readerEmbedFrame';
      const iframe = doc.createElement('iframe');
      iframe.src = url;
      iframe.title = currentItem?.title || '外部漫画ページ';
      iframe.loading = 'eager';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox');
      iframe.allowFullscreen = true;
      frame.appendChild(iframe);
      embeddedFrame = frame;
      stage.classList.remove('vertical-scroll');
      viewer.classList.remove('vertical-scroll');
      stage.replaceChildren(frame);
      const link = byId('openSourceBtn');
      if (link) { link.href = url; link.hidden = false; }
      const controls = byId('controls'); if (controls) controls.hidden = true;
      for (const id of ['verticalBtn', 'enhanceBtn', 'tocAddBtn', 'tocBtn', 'retryPageBtn']) {
        const button = byId(id); if (button) button.hidden = true;
      }
      const message = byId('readerMessage'); if (message) message.textContent = '';
      status('Webページを埋め込んでいます。表示されない場合は「元ページを開く」を使用してください。');
      updateControls();
      return true;
    }
    async function mountSingleSource(item, desiredPage) {
      currentItem = item;
      hashPageBase = win.MangaSourceType?.getHashPageBase(item) || '';
      const embeddedUrl = hashPageBase ? '' : win.MangaSourceType?.getEmbedUrl(item) || '';
      split = Boolean(item.splitSpreads);
      updateControls();
      page = embeddedUrl ? 1 : (Number.isSafeInteger(desiredPage) && desiredPage > 0 ? desiredPage : resumePage(item));
      if (hashPageBase) page = Math.min(win.MangaSourceType.MAX_HASH_PAGE, Math.max(1, page));
      // Legacy metadata could be poisoned by the iframe-recreation bug.
      // Only trust counts discovered by the repaired navigation pipeline.
      hashKnownTotal = hashPageBase
        && item.hashPageCountVersion === 2
        && item.hashPageCountSource === hashPageBase
        && Number.isSafeInteger(item.hashPageCount)
        && item.hashPageCount >= 1 && item.hashPageCount <= win.MangaSourceType.MAX_HASH_PAGE
        ? item.hashPageCount : 0;
      if (hashKnownTotal) page = Math.min(page, hashKnownTotal);
      hashConfirmedPages.clear();
      hashConfirmedPages.add(1);
      if (hashKnownTotal) hashConfirmedPages.add(hashKnownTotal);
      hashRejectedPages.clear();
      hashMaxVisited = hashPageBase ? page : 1;
      hashPreviousPage = page;
      requestedPage = page;
      lastFailedRequest = null;
      verticalSlots = [];
      pendingVerticalScrollPage = null;
      vertical = !embeddedUrl && !split && !item.encryptedAssets && win.localStorage.getItem('mangaReaderVerticalScroll') === '1';
      const verticalButton = byId('verticalBtn');
      if (verticalButton) verticalButton.hidden = !!embeddedUrl || split || Boolean(item.encryptedAssets);
      doc.body.classList.toggle('vertical-scroll', vertical);
      const closeButton = byId('closeBtn'); if (closeButton) closeButton.hidden = false;
      const favoriteButton = byId('favToggleBtn'); if (favoriteButton) favoriteButton.hidden = false;
      if (!controlsBound) { bindControls(); controlsBound = true; }
      renderFavorite();
      if (hashPageBase) return mountHashReader();
      if (embeddedUrl) return mountEmbeddedPage(embeddedUrl);
      const generationAtStart = ++generation;
      const resume = page;
      if (item.encryptedAssets) {
        encryptedPages = win.EncryptedAssetItem.encryptedAssetPagesForItem(item) || [];
        if (!encryptedPages.length) { status('暗号化ページがありません。'); return false; }
        page = Math.min(page, encryptedPages.length);
        requestedPage = page;
        const ready = await renderPage(page); if (!destroyed) showNextVolume(); return ready;
      }
      if (!pageSource) { status('ページ一覧を解決できません。'); return false; }
      status(Array.isArray(item.pages) || item.pageManifest ? 'ページを準備しています…' : 'ページ一覧を初回確認しています…');
      const AbortControllerRef = win.AbortController || globalThis.AbortController;
      const discoveryController = typeof AbortControllerRef === 'function' ? new AbortControllerRef() : null;
      activeDiscoveryController = discoveryController;
      if (discoveryController) lifecycle.own({ destroy: () => discoveryController.abort() });
      const resolved = await pageSource.resolve(item, { signal: discoveryController?.signal });
      if (destroyed || generationAtStart !== generation) return;
      pageUrls = resolved.urls;
      if (!pageUrls.length) { status('画像を見つけられませんでした。'); return false; }
      if (sourceCandidates.length < 2 && !item.autoDetectedDirectory && (resolved.migrated || !item.pageManifest)) {
        currentItem = repository.saveItem(resolved.item) || resolved.item;
      }
      page = Math.min(resume, displayCount());
      requestedPage = page;
      const ready = await renderPage(page);
      if (destroyed) return;
      showNextVolume();
      if (ready) status(`${pageUrls.length}ページ`);
      return ready;
    }


    // A failed source must not leave a delayed image request or an iframe
    // observation capable of replacing the next candidate's page.
    function resetSourcePresentation() {
      activeAutoDetectedDirectory = false;
      generation += 1;
      navigationGeneration += 1;
      verticalWindowGeneration += 1;
      activeDiscoveryController?.abort?.();
      activeDiscoveryController = null;
      pageTransition?.invalidate?.();
      for (const iframe of Array.from(hashFrameChecks.keys())) disposeHashObservation(iframe);
      embeddedFrame?.remove?.();
      embeddedFrame = null;
      hashIframe = null;
      hashPageBase = '';
      hashVerticalSlots.length = 0;
      pageUrls = [];
      encryptedPages = [];
      verticalSlots = [];
      lastFailedRequest = null;
      doc.body.classList.remove('hash-page-reader', 'vertical-scroll');
      byId('pageStage')?.replaceChildren?.();
      const controls = byId('controls'); if (controls) controls.hidden = false;
      const link = byId('openSourceBtn'); if (link) link.hidden = true;
      for (const id of ['enhanceBtn', 'tocAddBtn', 'tocBtn', 'retryPageBtn']) {
        const button = byId(id); if (button) button.hidden = id === 'retryPageBtn';
      }
    }

    // Cross-origin frames do not expose HTTP status. Load/error and a bounded
    // timeout are best-effort checks; the manual switch remains available for
    // providers that fire load even when their X-Frame-Options blocks display.
    function awaitFrameLoad(timeoutMs) {
      const frame = hashIframe || hashVerticalSlots[page - 1]?.frame?.firstChild || embeddedFrame?.querySelector?.('iframe');
      if (!frame || typeof frame.addEventListener !== 'function') return Promise.resolve(true);
      // The load event can occur before mountHashReader() is awaited, so
      // a late listener must not falsely discard a working source.
      if (hashFrameChecks.get(frame)?.loaded) return Promise.resolve(true);
      return new Promise((resolve) => {
        let done = false;
        let timer;
        const finish = (value) => {
          if (done) return;
          done = true;
          win.clearTimeout?.(timer);
          frame.removeEventListener?.('load', onLoad);
          frame.removeEventListener?.('error', onError);
          resolve(value);
        };
        const onLoad = () => {
          try {
            const child = frame.contentDocument;
            if (child && child.URL === 'about:blank') { finish(false); return; }
          } catch (_) { /* normal cross-origin frame */ }
          finish(true);
        };
        const onError = () => finish(false);
        frame.addEventListener('load', onLoad);
        frame.addEventListener('error', onError);
        timer = win.setTimeout(() => finish(false), timeoutMs);
      });
    }

    // Image probes are isolated from the saved URL and the normal page
    // discovery. An image must actually decode before its URL is accepted.
    function probeDirectoryImage(url, signal) {
      return new Promise((resolve) => {
        if (destroyed || signal?.aborted || typeof win.Image !== 'function') { resolve(false); return; }
        const image = new win.Image();
        let finished = false;
        let timer;
        const done = (ok) => {
          if (finished) return;
          finished = true;
          win.clearTimeout?.(timer);
          signal?.removeEventListener?.('abort', onAbort);
          image.onload = null;
          image.onerror = null;
          if (!ok) image.src = '';
          resolve(ok);
        };
        const onAbort = () => done(false);
        image.onload = () => done(image.naturalWidth > 0 && image.naturalHeight > 0);
        image.onerror = () => done(false);
        signal?.addEventListener?.('abort', onAbort, { once: true });
        timer = win.setTimeout(() => done(false), 1800);
        image.src = url;
      });
    }

    async function detectDirectoryFirstPage(url) {
      const groups = win.MangaSourceType?.getDirectoryImageCandidates(url) || [];
      if (!groups.length || typeof win.Image !== 'function') return '';
      status('連番画像（1.webp・1.jpgなど）を確認しています…');
      const Controller = win.AbortController || globalThis.AbortController;
      const controller = typeof Controller === 'function' ? new Controller() : null;
      activeDiscoveryController = controller;
      try {
        for (const group of groups) {
          if (destroyed || controller?.signal?.aborted) return '';
          const groupController = typeof Controller === 'function' ? new Controller() : null;
          const signal = groupController?.signal || controller?.signal;
          const abortGroup = () => groupController?.abort();
          controller?.signal?.addEventListener?.('abort', abortGroup, { once: true });
          try {
            const winner = await Promise.any(group.map((candidate) =>
              probeDirectoryImage(candidate, signal).then((ok) => {
                if (!ok) throw new Error('not an image');
                return candidate;
              })
            )).catch(() => '');
            if (winner) return winner;
          } finally {
            groupController?.abort();
            controller?.signal?.removeEventListener?.('abort', abortGroup);
          }
        }
        return '';
      } finally {
        controller?.abort();
        if (activeDiscoveryController === controller) activeDiscoveryController = null;
      }
    }

    async function activateSources(startIndex, desiredPage, skipDirectoryForFirst = false) {
      if (sourceSwitching || destroyed) return false;
      sourceSwitching = true;
      sourceReady = false;
      try {
        for (let index = startIndex; index < sourceCandidates.length && !destroyed; index += 1) {
          if (!directoryPreflightDone && sourceCandidates.length > 1
              && (win.MangaSourceType?.sourcePriority(sourceCandidates[index]) ?? 2) >= 1) {
            directoryPreflightDone = true;
            // Delay speculative folder checks until a non-direct fallback
            // would be used. A working explicit direct image opens immediately.
            const seen = new Set(sourceCandidates);
            for (const url of sourceCandidates) {
              if (destroyed) return false;
              if (!(win.MangaSourceType?.getDirectoryImageCandidates(url)?.length)) continue;
              const found = await detectDirectoryFirstPage(url);
              // The original link remains in the "other" category; its found
              // direct image is a temporary earlier source, not saved data.
              directoryDetectionCache.set(url, '');
              if (found && !seen.has(found)) {
                virtualDetectedSources.set(found, url);
                seen.add(found);
              }
            }
            sourceCandidates.push(...virtualDetectedSources.keys());
            sourceCandidates.sort((a, b) =>
              (win.MangaSourceType?.sourcePriority(a) ?? 2)
              - (win.MangaSourceType?.sourcePriority(b) ?? 2)
            );
          }
          resetSourcePresentation();
          sourceIndex = index;
          const savedUrl = sourceCandidates[index];
          const virtualDetected = virtualDetectedSources.has(savedUrl);
          const mayDetect = !virtualDetected
            && !(skipDirectoryForFirst && index === startIndex)
            && (sourceCandidates.length > 1 || !win.MangaSourceType?.hasPageList(sourceOriginalItem));
          const discoveredUrl = virtualDetected ? savedUrl : mayDetect
            ? directoryDetectionCache.has(savedUrl)
              ? directoryDetectionCache.get(savedUrl)
              : await detectDirectoryFirstPage(savedUrl)
            : '';
          if (destroyed) return false;
          // A preflight-discovered image sits ahead of the hash readers;
          // the original web embed remains at its normal later position.
          const attempts = virtualDetected
            ? [{ url: savedUrl, detected: true }]
            : discoveredUrl
              ? [{ url: discoveredUrl, detected: true }, { url: savedUrl, detected: false }]
              : [{ url: savedUrl, detected: false }];
          for (let attemptIndex = 0; attemptIndex < attempts.length && !destroyed; attemptIndex += 1) {
            if (attemptIndex) resetSourcePresentation();
            const attempt = attempts[attemptIndex];
            const candidate = { ...sourceOriginalItem, url: attempt.url };
            if (sourceCandidates.length > 1 || attempt.detected) {
              delete candidate.pages;
              delete candidate.pageManifest;
            }
            if (attempt.detected) {
              candidate.autoDetectedDirectory = true;
              // A pattern saved for another registered URL must not corrupt
              // the detected filename and its inferred zero-padding width.
              delete candidate.pagePattern;
              delete candidate.numberWidth;
            }
            const isDirect = win.MangaSourceType?.isDirectImageUrl(attempt.url);
            const hasHashBackup = sourceCandidates.slice(index + 1).some((value) => value.endsWith('#1'));
            const deadline = attempt.detected ? (hasHashBackup ? 9000 : 30000) : isDirect && hasHashBackup ? 3500 : isDirect ? 16000 : 10000;
            let timer;
            const timeout = new Promise((resolve) => { timer = win.setTimeout(() => resolve(false), deadline); });
            let ready = false;
            try {
              ready = (await Promise.race([mountSingleSource(candidate, desiredPage), timeout])) === true;
              if (ready && (hashPageBase || embeddedFrame)) ready = await awaitFrameLoad(7000);
            } catch (error) {
              if (error?.name === 'AbortError' && destroyed) return false;
              ready = false;
            } finally { win.clearTimeout?.(timer); }
            if (destroyed) return false;
            if (ready) {
              sourceReady = true;
              activeAutoDetectedDirectory = attempt.detected;
              status(attempt.detected
                ? '連番画像を自動検出して表示しています。'
                : index ? '代替URLで表示しています。' : '');
              return true;
            }
          }
        }
        return false;
      } finally {
        sourceSwitching = false;
      }
    }

    async function mountItem(item) {
      sourceOriginalItem = item;
      sourceCandidates = item.localSync || item.encryptedAssets?.pages?.length
        ? [] : (win.MangaSourceType?.getSourceCandidates(item) || []);
      directoryDetectionCache.clear();
      virtualDetectedSources.clear();
      directoryPreflightDone = false;
      const button = byId('switchSourceBtn');
      if (button) button.hidden = sourceCandidates.length < 2;
      const needsDirectoryProbe = sourceCandidates.length === 1
        && !win.MangaSourceType?.hasPageList(item)
        && (win.MangaSourceType?.getDirectoryImageCandidates(sourceCandidates[0])?.length || 0) > 0;
      if (sourceCandidates.length < 2 && !needsDirectoryProbe) return mountSingleSource(item);
      return activateSources(0);
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
