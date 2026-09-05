(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MangaExtensionBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const REQUEST_TYPE = 'testcode:manga-extension:import';
  const RESULT_TYPE = 'testcode:manga-extension:result';
  const READY_TYPE = 'testcode:manga-extension:bridge-ready';
  const SAVED_ITEMS_KEY = 'mangaReaderSavedItems';
  const VAULT_CHANNEL_NAME = 'mangaReaderVaultSession';

  function normalizeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    let url;
    try { url = new URL(raw); } catch (_) { return null; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href;
  }

  function validateDraft(input) {
    if (!input || typeof input !== 'object' || input.version !== 1) throw new Error('拡張機能データの形式が正しくありません。');
    const out = { version: 1 };
    if (input.sourcePageUrl) {
      const page = normalizeUrl(input.sourcePageUrl);
      if (!page) throw new Error('元ページURLが正しくありません。');
      out.sourcePageUrl = page;
    }
    for (const key of ['title','author','series','source']) {
      const value = String(input[key] || '').trim().slice(0, 1000);
      if (value) out[key] = value;
    }
    if (input.volume !== undefined && input.volume !== null && String(input.volume).trim()) {
      const match = String(input.volume).match(/\d+(?:\.\d+)?/);
      const n = Number(match && match[0]);
      if (Number.isFinite(n) && n > 0) out.volume = n;
    }
    if (Array.isArray(input.tags)) out.tags = Array.from(new Set(input.tags.map((tag)=>String(tag||'').trim()).filter(Boolean))).slice(0, 100);
    if (Array.isArray(input.pages) && input.pages.length) {
      if (input.pages.length > 5000) throw new Error('ページ数が多すぎます。');
      const pages = input.pages.map((value) => normalizeUrl(value));
      if (pages.some((value) => !value)) throw new Error('ページURLが正しくありません。');
      out.pages = Array.from(new Set(pages));
    }
    if (input.url) {
      const url = normalizeUrl(input.url);
      if (!url) throw new Error('画像URLが正しくありません。');
      out.url = url;
    }
    if (!out.url && (!out.pages || !out.pages.length)) throw new Error('画像URLがありません。');
    return out;
  }

  function draftPrimarySource(draft) {
    if (Array.isArray(draft.pages) && draft.pages.length) return normalizeUrl(draft.pages[0]);
    return normalizeUrl(draft.url);
  }

  function itemPrimarySource(item) {
    if (Array.isArray(item && item.pages) && item.pages.length) return normalizeUrl(item.pages[0]);
    return normalizeUrl(item && item.url);
  }

  function findDuplicate(items, draft) {
    const primary = draftPrimarySource(draft);
    if (primary) {
      const byImage = (Array.isArray(items) ? items : []).find((item) => itemPrimarySource(item) === primary);
      if (byImage) return byImage;
    }
    const sourcePage = normalizeUrl(draft && draft.sourcePageUrl);
    if (!sourcePage) return null;
    return (Array.isArray(items) ? items : []).find((item) => normalizeUrl(item && item.sourcePageUrl) === sourcePage) || null;
  }

  function buildSavedItem(input, deps = {}) {
    const draft = validateDraft(Object.assign({ version: 1 }, input || {}));
    const genIdFn = typeof deps.genId === 'function' ? deps.genId : (() => 'i_' + Math.random().toString(36).slice(2));
    const now = typeof deps.now === 'function' ? deps.now : Date.now;
    const item = {
      id: genIdFn('i'),
      title: draft.title || '無題',
      author: draft.author || '',
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      folderId: null,
      favorite: false,
      splitSpreads: false,
      addedAt: now(),
      sourcePageUrl: draft.sourcePageUrl || null
    };
    if (draft.series) item.series = draft.series;
    if (draft.volume) item.volume = draft.volume;
    if (draft.source) item.source = draft.source;
    if (Array.isArray(draft.pages) && draft.pages.length >= 2) item.pages = draft.pages.slice();
    else item.url = Array.isArray(draft.pages) && draft.pages.length === 1 ? draft.pages[0] : draft.url;
    return item;
  }

  async function importDraft(input, deps) {
    const draft = validateDraft(input);
    if (!deps || typeof deps.getSavedItems !== 'function' || typeof deps.persistItems !== 'function') return { status:'invalid', message:'testCode側の受信準備ができていません。' };
    if (typeof deps.isVaultReady === 'function' && !deps.isVaultReady()) {
      if (typeof deps.awaitVaultReady === 'function') {
        try { await deps.awaitVaultReady(); } catch (_) {}
      }
      if (!deps.isVaultReady()) return { status:'locked', message:'保管庫がロックされています。' };
    }
    const items = deps.getSavedItems();
    if (!Array.isArray(items)) return { status:'invalid', message:'本棚データを取得できません。' };
    if (findDuplicate(items, draft)) return { status:'duplicate', message:'すでに追加されています' };
    const item = buildSavedItem(draft, deps);
    items.unshift(item);
    await deps.persistItems();
    if (typeof deps.renderSavedList === 'function') deps.renderSavedList();
    if (typeof deps.afterAdded === 'function') deps.afterAdded(item);
    return { status:'added', message:'追加しました', itemId:item.id };
  }

  function install(deps, target) {
    target = target || (typeof window !== 'undefined' ? window : null);
    if (!target || typeof target.addEventListener !== 'function' || typeof target.postMessage !== 'function') return () => {};
    const handler = async (event) => {
      if (event.source !== target || !event.data || event.data.type !== REQUEST_TYPE) return;
      const requestId = String(event.data.requestId || '');
      let result;
      try { result = await importDraft(event.data.draft, deps); }
      catch (error) { result = { status:'invalid', message:String(error && error.message || error) }; }
      target.postMessage({ type: RESULT_TYPE, requestId, result }, target.location ? target.location.origin : '*');
    };
    target.addEventListener('message', handler);
    return () => target.removeEventListener('message', handler);
  }

  function watchVaultReady(isVaultReady, target, intervalMs = 1000) {
    if (!target || typeof target.postMessage !== 'function' || typeof setInterval !== 'function') return () => {};
    let wasReady = false;
    const check = () => {
      let ready = false;
      try { ready = !!isVaultReady(); } catch (_) {}
      if (ready && !wasReady) target.postMessage({ type: READY_TYPE }, target.location ? target.location.origin : '*');
      wasReady = ready;
    };
    const onActive = () => check();
    if (typeof target.addEventListener === 'function') target.addEventListener('manga-vault-active', onActive);
    check();
    const timer = setInterval(check, intervalMs);
    return () => {
      clearInterval(timer);
      if (typeof target.removeEventListener === 'function') target.removeEventListener('manga-vault-active', onActive);
    };
  }

  function waitForVaultReady(target, isVaultReady, timeoutMs = 3000, requestEveryMs = 200) {
    if (!target || typeof isVaultReady !== 'function') return Promise.resolve(false);
    try { if (isVaultReady()) return Promise.resolve(true); } catch (_) {}

    const setTimer = typeof target.setTimeout === 'function' ? target.setTimeout.bind(target) : setTimeout;
    const clearTimer = typeof target.clearTimeout === 'function' ? target.clearTimeout.bind(target) : clearTimeout;
    const setRepeater = typeof target.setInterval === 'function' ? target.setInterval.bind(target) : setInterval;
    const clearRepeater = typeof target.clearInterval === 'function' ? target.clearInterval.bind(target) : clearInterval;
    let channel = null;
    try {
      const Channel = target.BroadcastChannel || (typeof BroadcastChannel === 'function' ? BroadcastChannel : null);
      if (Channel) channel = new Channel(VAULT_CHANNEL_NAME);
    } catch (_) { channel = null; }

    return new Promise((resolve) => {
      let done = false;
      let interval = null;
      let timeout = null;
      const cleanup = () => {
        if (interval !== null) clearRepeater(interval);
        if (timeout !== null) clearTimer(timeout);
        if (typeof target.removeEventListener === 'function') target.removeEventListener('manga-vault-active', onActive);
        try { if (channel) channel.close(); } catch (_) {}
      };
      const finish = (ready) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(!!ready);
      };
      const check = () => {
        try {
          if (isVaultReady()) { finish(true); return true; }
        } catch (_) {}
        return false;
      };
      const request = () => {
        if (check()) return;
        try { if (channel) channel.postMessage({ type: 'vault-request' }); } catch (_) {}
      };
      const onActive = () => { if (!check()) request(); };
      if (typeof target.addEventListener === 'function') target.addEventListener('manga-vault-active', onActive);
      request();
      interval = setRepeater(request, Math.max(50, Number(requestEveryMs) || 200));
      timeout = setTimer(() => finish(check()), Math.max(0, Number(timeoutMs) || 3000));
    });
  }

  function makePageDeps(target) {
    if (!target || !target.localStorage) return null;
    let items;
    try {
      const parsed = JSON.parse(target.localStorage.getItem(SAVED_ITEMS_KEY) || '[]');
      items = Array.isArray(parsed) ? parsed : [];
    } catch (_) { items = []; }
    const isVaultReady = () => !!(target.MangaVault && typeof target.MangaVault.loadActive === 'function' && target.MangaVault.loadActive());
    return {
      getSavedItems: () => items,
      persistItems: async () => {
        target.localStorage.setItem(SAVED_ITEMS_KEY, JSON.stringify(items));
        if (isVaultReady() && target.MangaVault && typeof target.MangaVault.savePayload === 'function' && target.MangaVaultPayload && typeof target.MangaVaultPayload.buildFromLocalStorage === 'function') {
          await target.MangaVault.savePayload(target.MangaVaultPayload.buildFromLocalStorage());
        }
      },
      genId: (prefix) => String(prefix || 'i') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      now: () => Date.now(),
      isVaultReady,
      awaitVaultReady: () => waitForVaultReady(target, isVaultReady),
      afterAdded: () => {
        const schedule = typeof target.setTimeout === 'function' ? target.setTimeout.bind(target) : setTimeout;
        schedule(() => { if (target.location && typeof target.location.reload === 'function') target.location.reload(); }, 50);
      }
    };
  }

  function autoInstall() {
    if (typeof window === 'undefined' || window.__mangaExtensionBridgeInstalled) return false;
    try {
      const deps = makePageDeps(root);
      if (!deps) return false;
      install(deps, window);
      watchVaultReady(deps.isVaultReady, window);
      window.__mangaExtensionBridgeInstalled = true;
      window.postMessage({ type: READY_TYPE }, location.origin);
      return true;
    } catch (_) { return false; }
  }

  if (typeof window !== 'undefined') {
    if (!autoInstall()) {
      let attempts = 0;
      const timer = setInterval(() => { attempts += 1; if (autoInstall() || attempts > 100) clearInterval(timer); }, 100);
    }
  }

  return { REQUEST_TYPE, RESULT_TYPE, READY_TYPE, normalizeUrl, validateDraft, findDuplicate, buildSavedItem, importDraft, install, watchVaultReady, waitForVaultReady, makePageDeps, autoInstall };
});