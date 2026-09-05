(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MangaExtensionBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REQUEST_TYPE = 'testcode:manga-extension:import';
  const RESULT_TYPE = 'testcode:manga-extension:result';

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
    if (typeof deps.isVaultReady === 'function' && !deps.isVaultReady()) return { status:'locked', message:'保管庫がロックされています。' };
    const items = deps.getSavedItems();
    if (!Array.isArray(items)) return { status:'invalid', message:'本棚データを取得できません。' };
    if (findDuplicate(items, draft)) return { status:'duplicate', message:'すでに追加されています' };
    const item = buildSavedItem(draft, deps);
    items.unshift(item);
    deps.persistItems();
    if (typeof deps.renderSavedList === 'function') deps.renderSavedList();
    return { status:'added', message:'追加しました', itemId:item.id };
  }

  function install(deps, target = root) {
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

  function autoInstall() {
    if (typeof window === 'undefined' || window.__mangaExtensionBridgeInstalled) return false;
    try {
      if (typeof savedItems === 'undefined' || typeof persistItems !== 'function' || typeof genId !== 'function') return false;
      install({
        getSavedItems: () => savedItems,
        persistItems: () => persistItems(),
        renderSavedList: () => { if (typeof renderSavedList === 'function') renderSavedList(); },
        genId: (prefix) => genId(prefix),
        now: () => Date.now(),
        isVaultReady: () => !!(window.MangaVault && typeof MangaVault.loadActive === 'function' && MangaVault.loadActive())
      }, window);
      window.__mangaExtensionBridgeInstalled = true;
      window.postMessage({ type:'testcode:manga-extension:bridge-ready' }, location.origin);
      return true;
    } catch (_) { return false; }
  }

  if (typeof window !== 'undefined') {
    if (!autoInstall()) {
      let attempts = 0;
      const timer = setInterval(() => { attempts += 1; if (autoInstall() || attempts > 100) clearInterval(timer); }, 100);
    }
  }

  return { REQUEST_TYPE, RESULT_TYPE, normalizeUrl, validateDraft, findDuplicate, buildSavedItem, importDraft, install, autoInstall };
});