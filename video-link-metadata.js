(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TestCodeVideoLinkMetadata = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const CONSENT_KEY = 'testcode.video.bookmarkTitleLookupConsent.v1';
  const DAILY_KEY = 'testcode.video.bookmarkTitleLookupDaily.v1';
  // Leave margin within the service's stated free-tier daily allowance.
  const DAILY_LIMIT = 20;
  const CONSENT_MESSAGE = 'ブックマーク先のタイトルを取得するため、URLを外部サービス（Microlink）に送信します。公開ページのURLだけに使用してください。許可すると、動画追加時と未取得のリンクを開いた時にタイトルを自動取得します。';
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

  function dailyAllowance(storage, now = new Date()) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return false;
    const day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    try {
      let value;
      try { value = JSON.parse(storage.getItem(DAILY_KEY) || 'null'); } catch (_) { value = null; }
      const used = value && value.day === day && Number.isSafeInteger(value.used)
        ? Math.max(0, value.used) : 0;
      if (used >= DAILY_LIMIT) return false;
      storage.setItem(DAILY_KEY, JSON.stringify({ day, used: used + 1 }));
      return true;
    } catch (_) { return false; }
  }

  // Only call this for explicit bookmark creation or a click on an untitled
  // bookmark. Never invoke it while loading or rendering a video list.
  async function lookupWithConsent(rawUrl, options) {
    const settings = options || {};
    if (!publicUrl(rawUrl)) return { status: 'unsafe' };
    const storage = settings.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const ask = settings.confirm || (typeof confirm === 'function' ? confirm : () => false);
    let consent = '';
    try { consent = storage?.getItem(CONSENT_KEY) || ''; } catch (_) {}
    if (consent !== 'allow') {
      if (consent === 'decline' && settings.manual !== true) return { status: 'declined' };
      const allowed = ask(CONSENT_MESSAGE);
      try { storage?.setItem(CONSENT_KEY, allowed ? 'allow' : 'decline'); } catch (_) {}
      if (!allowed) return { status: 'declined' };
    }
    if (!dailyAllowance(storage, settings.now || new Date())) return { status: 'quota' };
    const info = await fetchMetadata(rawUrl, settings);
    return { status: 'success', ...info };
  }

  function skippedMessage(status) {
    if (status === 'quota') return '本日の自動取得回数の上限に達しました。タイトルは手入力できます。';
    if (status === 'unsafe') return 'このURLは外部サービスに送信しません。タイトルは手入力できます。';
    return '取得せずに登録できます。必要ならタイトルを手入力してください。';
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
    let activeTask = null;

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
      const requestId = ++generation;
      if (controller) controller.abort();
      controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), 9000) : null;
      const initialTitle = titleInput.value;
      active = true;
      button.disabled = true;
      message.textContent = 'ページのタイトルを取得中…';
      try {
        const metadata = await lookupWithConsent(url, {
          storage, confirm: ask, fetchImpl: fetcher, signal: controller && controller.signal, manual,
        });
        if (requestId !== generation || urlInput.value.trim() !== url || !available() || titleInput.value !== initialTitle) return;
        if (metadata.status !== 'success') {
          message.textContent = skippedMessage(metadata.status);
          return;
        }
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
        if (timeout != null) clearTimeout(timeout);
        if (requestId === generation) { active = false; button.disabled = false; controller = null; }
      }
    }
    function onUrlInput() {
      generation += 1;
      if (controller) controller.abort();
      controller = null;
      active = false;
      activeTask = null;
      button.disabled = false;
      updateVisibility();
    }
    function onUrlChange() {
      updateVisibility();
      if (available() && !titleInput.value.trim()) activeTask = retrieve(false);
    }
    function onTitleInput() {
      if (!active) return;
      generation += 1;
      if (controller) controller.abort();
      controller = null;
      active = false;
      button.disabled = false;
    }
    function onClick() { activeTask = retrieve(true); }
    urlInput.addEventListener('input', onUrlInput);
    urlInput.addEventListener('change', onUrlChange);
    titleInput.addEventListener('input', onTitleInput);
    button.addEventListener('click', onClick);
    updateVisibility();
    const detach = () => {
      urlInput.removeEventListener('input', onUrlInput);
      urlInput.removeEventListener('change', onUrlChange);
      titleInput.removeEventListener('input', onTitleInput);
      button.removeEventListener('click', onClick);
      if (controller) controller.abort();
    };
    // Submitting a newly pasted bookmark waits for its in-flight title lookup.
    detach.ensureTitle = () => {
      if (!available() || titleInput.value.trim()) return Promise.resolve();
      if (activeTask) return activeTask;
      activeTask = retrieve(false);
      return activeTask;
    };
    return detach;
  }

  return Object.freeze({ CONSENT_KEY, DAILY_KEY, DAILY_LIMIT, publicUrl, fetchMetadata, lookupWithConsent, dailyAllowance, attach });
}));
