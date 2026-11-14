/* Live, inert first-page cover preview for manga URLs ending in #1.
   Cross-origin iframe pixels cannot be captured into canvas: the preview
   stays an iframe and is mounted only while its card is on screen. */
(function (root) {
  'use strict';

  function create({ documentRef = root.document, windowRef = root, canReadProtectedData = () => true } = {}) {
    if (!documentRef?.createElement || typeof canReadProtectedData !== 'function') {
      throw new TypeError('hash cover preview requires a document and an access check');
    }

    const entries = new Map();
    let destroyed = false;
    const visibleObserver = typeof windowRef.IntersectionObserver === 'function'
      ? new windowRef.IntersectionObserver((changes) => {
        for (const change of changes) {
          const entry = entries.get(change.target);
          if (!entry) continue;
          if (change.isIntersecting && canReadProtectedData()) mount(entry);
          else unload(entry);
        }
      }, { rootMargin: '120px 0px', threshold: 0 })
      : null;

    function unload(entry) {
      if (entry.iframe) {
        entry.host.replaceChildren();
        entry.iframe = null;
      }
      entry.host.hidden = true;
    }

    function release(entry) {
      visibleObserver?.unobserve(entry.img);
      unload(entry);
      entry.host.remove();
      entries.delete(entry.img);
    }

    function prune() {
      if (destroyed) return;
      for (const entry of entries.values()) {
        if (entry.img.isConnected) entry.wasConnected = true;
        else if (entry.wasConnected) {
          release(entry);
          continue;
        }
        if (!canReadProtectedData()) unload(entry);
      }
    }

    const mutationObserver = typeof windowRef.MutationObserver === 'function'
      ? new windowRef.MutationObserver(prune)
      : null;
    if (mutationObserver && (documentRef.body || documentRef.documentElement)) {
      mutationObserver.observe(documentRef.body || documentRef.documentElement, { childList: true, subtree: true });
    }

    function mount(entry) {
      if (destroyed || entry.iframe || !canReadProtectedData() || (visibleObserver && !entry.img.isConnected)) return;
      const iframe = documentRef.createElement('iframe');
      iframe.src = entry.url;
      iframe.title = entry.title + ' の表紙プレビュー';
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.setAttribute('tabindex', '-1');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.inert = true;
      iframe.style.pointerEvents = 'none';
      entry.iframe = iframe;
      iframe.addEventListener('load', () => {
        if (!destroyed && entry.iframe === iframe && canReadProtectedData() && entry.img.isConnected) {
          entry.host.hidden = false;
        }
      });
      iframe.addEventListener('error', () => {
        if (entry.iframe === iframe) unload(entry);
      });
      entry.host.appendChild(iframe);
    }

    function attach(img, url) {
      if (destroyed || !img?.parentNode || !canReadProtectedData()) return false;
      const safeUrl = root.MangaSourceType?.safeHttpUrl(url) || '';
      if (!safeUrl.endsWith('#1')) return false;
      const old = entries.get(img);
      if (old) release(old);
      const host = documentRef.createElement('div');
      host.className = 'book-cover-hash-preview';
      host.hidden = true;
      host.setAttribute('aria-hidden', 'true');
      host.style.pointerEvents = 'none';
      img.parentNode.appendChild(host);
      const entry = { img, host, iframe: null, url: safeUrl, title: img.alt || '漫画', wasConnected: !!img.isConnected };
      entries.set(img, entry);
      if (visibleObserver) visibleObserver.observe(img);
      else mount(entry); // Native iframe loading=lazy still defers off-screen fetch.
      return true;
    }

    function onAccessChange() {
      if (!canReadProtectedData()) {
        for (const entry of entries.values()) unload(entry);
        return;
      }
      // When access returns, refresh visibility rather than loading every
      // stored cover regardless of whether it is on screen.
      for (const entry of entries.values()) {
        if (visibleObserver) {
          visibleObserver.unobserve(entry.img);
          visibleObserver.observe(entry.img);
        } else mount(entry);
      }
    }
    documentRef.addEventListener?.('manga-reader-vpn-status', onAccessChange);

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      documentRef.removeEventListener?.('manga-reader-vpn-status', onAccessChange);
      visibleObserver?.disconnect();
      mutationObserver?.disconnect();
      for (const entry of entries.values()) {
        unload(entry);
        entry.host.remove();
      }
      entries.clear();
    }

    return Object.freeze({ attach, destroy });
  }

  root.MangaHashCoverPreview = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
