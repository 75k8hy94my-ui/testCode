(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MangaExtensionBackground = api;
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.storage) api.installChromeHandlers(chrome);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEYS = { rules: 'mangaSiteRulesV1', origins: 'mangaRegisteredOriginsV1', pending: 'mangaPendingDraftsV1' };

  function makeMemoryStore(initial = {}) {
    const data = Object.assign({}, initial);
    return { async get(key) { return data[key]; }, async set(key, value) { data[key] = value; } };
  }

  function chromeStore(chromeApi) {
    return {
      async get(key) { const result = await chromeApi.storage.local.get(key); return result[key]; },
      async set(key, value) { await chromeApi.storage.local.set({ [key]: value }); }
    };
  }

  function uid() { return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); }

  function makeQueue(store) {
    return {
      async list() { return Array.isArray(await store.get(KEYS.pending)) ? await store.get(KEYS.pending) : []; },
      async enqueue(draft) {
        const items = Array.isArray(await store.get(KEYS.pending)) ? await store.get(KEYS.pending) : [];
        const id = uid(); items.push({ id, draft, queuedAt: Date.now() }); await store.set(KEYS.pending, items); return id;
      },
      async ack(id) {
        const items = Array.isArray(await store.get(KEYS.pending)) ? await store.get(KEYS.pending) : [];
        await store.set(KEYS.pending, items.filter((item) => item.id !== id));
      }
    };
  }

  async function registeredOrigins(store) { return Array.isArray(await store.get(KEYS.origins)) ? await store.get(KEYS.origins) : []; }
  async function rules(store) { return Array.isArray(await store.get(KEYS.rules)) ? await store.get(KEYS.rules) : []; }

  async function injectSite(chromeApi, tabId) {
    if (!tabId) return;
    try { await chromeApi.scripting.executeScript({ target: { tabId }, files: ['extension/content/rule-locator.js','extension/content/extractor.js','extension/content/element-picker.js','extension/content/site-toolbar.js'] }); } catch (_) {}
  }

  async function findTestCodeTabs(chromeApi) { return chromeApi.tabs.query({ url: 'https://75k8hy94my-ui.github.io/testCode/reader.html*' }); }

  async function flushPending(chromeApi, queue, tabId) {
    const tabs = tabId ? [{ id: tabId }] : await findTestCodeTabs(chromeApi);
    if (!tabs.length) return { delivered: 0 };
    let delivered = 0;
    for (const item of await queue.list()) {
      let terminal = false;
      for (const tab of tabs) {
        try {
          const response = await chromeApi.tabs.sendMessage(tab.id, { type: 'DELIVER_DRAFT', item });
          if (response && (response.status === 'added' || response.status === 'duplicate')) { terminal = true; break; }
          if (response && response.status === 'locked') break;
        } catch (_) {}
      }
      if (terminal) { await queue.ack(item.id); delivered += 1; }
    }
    return { delivered };
  }

  function installChromeHandlers(chromeApi) {
    const store = chromeStore(chromeApi); const queue = makeQueue(store);
    chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
      (async () => {
        if (!message || !message.type) return { ok: false };
        if (message.type === 'GET_SITE_STATUS') return { ok: true, registered: (await registeredOrigins(store)).includes(message.origin), rules: (await rules(store)).filter((rule) => rule.origin === message.origin) };
        if (message.type === 'REGISTER_SITE') {
          const origin = message.origin; const granted = await chromeApi.permissions.request({ origins: [origin + '/*'] });
          if (!granted) return { ok: false, error: 'permission-denied' };
          const origins = await registeredOrigins(store); if (!origins.includes(origin)) { origins.push(origin); await store.set(KEYS.origins, origins); }
          if (message.tabId) await injectSite(chromeApi, message.tabId); return { ok: true };
        }
        if (message.type === 'GET_RULES') return { ok: true, rules: await rules(store) };
        if (message.type === 'SAVE_RULE') {
          const all = await rules(store); const next = Object.assign({}, message.rule, { updatedAt: Date.now() }); const index = all.findIndex((rule) => rule.id === next.id);
          if (index >= 0) all[index] = next; else all.push(next); await store.set(KEYS.rules, all); return { ok: true, rule: next };
        }
        if (message.type === 'QUEUE_DRAFT') { const id = await queue.enqueue(message.draft); const result = await flushPending(chromeApi, queue); return { ok: true, id, delivered: result.delivered > 0 }; }
        if (message.type === 'TESTCODE_READY' || message.type === 'FLUSH_PENDING') return Object.assign({ ok: true }, await flushPending(chromeApi, queue, sender && sender.tab && sender.tab.id));
        return { ok: false, error: 'unknown-message' };
      })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error && error.message || error) }));
      return true;
    });
    if (chromeApi.tabs && chromeApi.tabs.onUpdated) chromeApi.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status !== 'complete' || !tab.url) return;
      try { const origin = new URL(tab.url).origin; if ((await registeredOrigins(store)).includes(origin)) await injectSite(chromeApi, tabId); } catch (_) {}
    });
  }
  return { KEYS, makeMemoryStore, makeQueue, installChromeHandlers, flushPending };
});