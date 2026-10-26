(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TestCodeVideoLinkMetadata = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const CONSENT_KEY = 'testcode.video.bookmarkTitleLookupConsent.v1';
  const SENSITIVE_KEY = /(?:^|[_-])(access[_-]?token|token|auth|authorization|api[_-]?key|apikey|secret|password|passwd|session|signature|signed|jwt|bearer)(?:$|[_-])/i;

  function publicUrl(raw) {
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096) return null;
    let url;
    try { url = new URL(raw.trim()); } catch (_) { return null; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host || !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') ||
        host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test') ||
        host.endsWith('.invalid') || host.endsWith('.onion') ||
        /^\d+(?:\.\d+){3}$/.test(host) || host.includes(':')) return null;
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_KEY.test(key)) return null;
    }
    url.hash = '';
    return url.href;
  }

  async function fetchMetadata(rawUrl, options) {
    const safeUrl = publicUrl(rawUrl);
    if (!safeUrl) throw new Error('認証情報を含むURLや非公開アドレスは自動取得できません。');
    const settings = options || {};
    const fetcher = settings.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetcher) throw new Error('この環境ではページ情報を取得できません。');
    const request = new URL('https://api.microlink.io/');
    request.searchParams.set('url', safeUrl);
    request.searchParams.set('filter', 'title,description,publisher');
    const response = await fetcher(request.href, {
      method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer',
      signal: settings.signal,
    });
    if (!response || !response.ok) throw new Error('サイト情報を取得できませんでした（外部サービスの制限または通信エラー）。');
    const payload = await response.json();
    if (!payload || payload.status !== 'success' || !payload.data) {
      throw new Error('このページの情報は取得できませんでした。');
    }
    const title = String(payload.data.title || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const description = String(payload.data.description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!title) throw new Error('このページには取得可能なタイトルがありません。');
    return { title, description };
  }

  function attach(options) {
    const settings = options || {};
    const urlInput = settings.urlInput;
    const titleInput = settings.titleInput;
    const panel = settings.panel;
    const button = settings.button;
    const message = settings.message;
    const isBookmark = settings.isBookmark;
    if (!urlInput || !titleInput || !panel || !button || !message || typeof isBookmark !== 'function') return () => {};
    const storage = settings.storage || (typeof localStorage === 'undefined' ? null : localStorage);
    const ask = settings.confirm || (typeof confirm === 'function' ? confirm : () => false);
    const fetcher = settings.fetchImpl;
    let generation = 0;
    let controller = null;
    let active = false;

    function permitted() {
      try { return storage && storage.getItem(CONSENT_KEY) || ''; } catch (_) { return ''; }
    }
    function remember(value) {
      try { if (storage) storage.setItem(CONSENT_KEY, value); } catch (_) {}
    }
    function available() {
      return isBookmark(urlInput.value.trim()) && !!publicUrl(urlInput.value.trim());
    }
    function updateVisibility() {
      panel.hidden = !available();
      if (panel.hidden) message.textContent = '';
    }
    async function retrieve(manual) {
      const url = urlInput.value.trim();
      if (!available() || (!manual && titleInput.value.trim())) return;
      const consent = permitted();
      if (consent !== 'allow') {
        if (!manual && consent === 'decline') return;
        const accepted = ask('ブックマーク先のタイトルを取得するため、URLを外部サービス（Microlink）に送信します。公開ページのURLだけに使用してください。許可すると今後のブックマーク追加時にも自動取得します。');
        remember(accepted ? 'allow' : 'decline');
        if (!accepted) { message.textContent = '取得せずに登録できます。必要ならタイトルを手入力してください。'; return; }
      }
      const requestId = ++generation;
      if (controller) controller.abort();
      controller = typeof AbortController === 'function' ? new AbortController() : null;
      const initialTitle = titleInput.value;
      active = true;
      button.disabled = true;
      message.textContent = 'ページのタイトルを取得中…';
      try {
        const metadata = await fetchMetadata(url, { fetchImpl: fetcher, signal: controller && controller.signal });
        if (requestId !== generation || urlInput.value.trim() !== url || !available() || titleInput.value !== initialTitle) return;
        // Never overwrite a title the user has already entered.
        if (titleInput.value.trim()) {
          message.textContent = '取得タイトル：' + metadata.title + '（入力済みのタイトルは保持しました）';
        } else {
          titleInput.value = metadata.title;
          active = false; // Programmatic input notifies edit-page autosave; it is not a user override.
          titleInput.dispatchEvent(new Event('input', { bubbles: true }));
          message.textContent = 'タイトルを取得しました。必要に応じて修正できます。';
        }
      } catch (error) {
        if (requestId !== generation) return;
        message.textContent = error && error.name === 'AbortError'
          ? '' : ((error && error.message) || '取得できませんでした。') + ' タイトルは手入力できます。';
      } finally {
        if (requestId === generation) { active = false; button.disabled = false; controller = null; }
      }
    }
    function onUrlInput() {
      generation += 1;
      if (controller) controller.abort();
      controller = null;
      active = false;
      button.disabled = false;
      updateVisibility();
    }
    function onUrlChange() {
      updateVisibility();
      if (available() && !titleInput.value.trim()) void retrieve(false);
    }
    function onTitleInput() {
      if (!active) return;
      generation += 1;
      if (controller) controller.abort();
      controller = null;
      active = false;
      button.disabled = false;
    }
    function onClick() { void retrieve(true); }
    urlInput.addEventListener('input', onUrlInput);
    urlInput.addEventListener('change', onUrlChange);
    titleInput.addEventListener('input', onTitleInput);
    button.addEventListener('click', onClick);
    updateVisibility();
    return () => {
      urlInput.removeEventListener('input', onUrlInput);
      urlInput.removeEventListener('change', onUrlChange);
      titleInput.removeEventListener('input', onTitleInput);
      button.removeEventListener('click', onClick);
      if (controller) controller.abort();
    };
  }

  return Object.freeze({ CONSENT_KEY, publicUrl, fetchMetadata, attach });
}));
