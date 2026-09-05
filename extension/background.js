(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MangaExtensionBackground = api;
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.storage) api.installChromeHandlers(chrome);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEYS = { rules: 'mangaSiteRulesV1', origins: 'mangaRegisteredOriginsV1', pending: 'mangaPendingDraftsV1' };
  const diag = (stage, ok = true, detail = '') => ({ stage, ok, detail: String(detail || '').slice(0, 300) });
  function makeMemoryStore(initial = {}) { const data = Object.assign({}, initial); return { async get(key) { return data[key]; }, async set(key, value) { data[key] = value; } }; }
  function chromeStore(chromeApi) { return { async get(key) { const result = await chromeApi.storage.local.get(key); return result[key]; }, async set(key, value) { await chromeApi.storage.local.set({ [key]: value }); } }; }
  function uid() { return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); }
  function summarizeRuleFields(rule, total) { return { configured: rule && rule.fields ? Object.keys(rule.fields).filter((key) => rule.fields[key]).length : 0, total: Number(total) || 0 }; }
  function deliveryStateFromResult(result) { if (!result) return 'waiting'; if (result.status === 'added') return 'synced'; if (result.status === 'duplicate') return 'duplicate'; if (result.status === 'locked') return 'locked'; return 'waiting'; }
  function makeQueue(store) { return { async list() { const value = await store.get(KEYS.pending); return Array.isArray(value) ? value : []; }, async enqueue(draft) { const items = await this.list(); const id = uid(); items.push({ id, draft, queuedAt: Date.now() }); await store.set(KEYS.pending, items); return id; }, async ack(id) { const items = await this.list(); await store.set(KEYS.pending, items.filter((item) => item.id !== id)); } }; }
  function makeSerializedFlusher(work) { const inFlight = new Map(); return function run(key) { const normalizedKey = String(key || 'global'); if (inFlight.has(normalizedKey)) return inFlight.get(normalizedKey); let promise; try { promise = Promise.resolve(work(key)); } catch (error) { promise = Promise.reject(error); } promise = promise.finally(() => { if (inFlight.get(normalizedKey) === promise) inFlight.delete(normalizedKey); }); inFlight.set(normalizedKey, promise); return promise; }; }
  async function registeredOrigins(store) { const value = await store.get(KEYS.origins); return Array.isArray(value) ? value : []; }
  async function rules(store) { const value = await store.get(KEYS.rules); return Array.isArray(value) ? value : []; }
  async function injectSite(chromeApi, tabId) { if (!tabId) return; try { await chromeApi.scripting.executeScript({ target:{ tabId }, files:['content/rule-locator.js','content/extractor.js','content/element-picker.js','content/site-toolbar.js'] }); } catch (_) {} }
  async function findTestCodeTabs(chromeApi) { return chromeApi.tabs.query({ url:'https://75k8hy94my-ui.github.io/testCode/reader.html*' }); }
  async function flushPending(chromeApi, queue, tabId) {
    const diagnostics = [];
    const tabs = typeof tabId === 'number' ? [{ id:tabId }] : await findTestCodeTabs(chromeApi);
    diagnostics.push(diag('reader-detected', tabs.length > 0, tabs.length ? tabs.length + ' tab(s)' : 'reader.html が開かれていません'));
    if (!tabs.length) return { delivered:0, lastResult:null, diagnostics };
    let delivered = 0, lastResult = null;
    for (const item of await queue.list()) {
      let terminal = false;
      for (const tab of tabs) {
        try {
          diagnostics.push(diag('relay-send', true, 'tab ' + tab.id));
          const response = await chromeApi.tabs.sendMessage(tab.id, { type:'DELIVER_DRAFT', item });
          if (response) { lastResult = response; if (Array.isArray(response.diagnostics)) diagnostics.push(...response.diagnostics); }
          diagnostics.push(diag('relay-result', !!response, response ? response.status : '応答なし'));
          if (response && (response.status === 'added' || response.status === 'duplicate')) { terminal = true; break; }
          if (response && response.status === 'locked') break;
        } catch (error) {
          diagnostics.push(diag('relay-error', false, error && error.message || error));
        }
      }
      if (terminal) { await queue.ack(item.id); delivered += 1; diagnostics.push(diag('queue-acked')); }
      else diagnostics.push(diag('queue-retained', true, '再送待ち'));
    }
    return { delivered, lastResult, diagnostics };
  }
  function installChromeHandlers(chromeApi) {
    const store = chromeStore(chromeApi); const queue = makeQueue(store); const serialFlush = makeSerializedFlusher((tabId) => flushPending(chromeApi, queue, tabId));
    chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
      (async () => {
        if (!message || !message.type) return { ok:false };
        if (message.type === 'GET_SITE_STATUS') { const origin=message.origin; return { ok:true, registered:(await registeredOrigins(store)).includes(origin), rules:(await rules(store)).filter((rule)=>rule.origin===origin) }; }
        if (message.type === 'REGISTER_SITE') { const origin=message.origin; const granted=await chromeApi.permissions.contains({origins:[origin+'/*']}); if(!granted)return{ok:false,error:'permission-not-granted'}; const origins=await registeredOrigins(store); if(!origins.includes(origin)){origins.push(origin);await store.set(KEYS.origins,origins);} if(message.tabId)await injectSite(chromeApi,message.tabId); return{ok:true}; }
        if (message.type === 'GET_RULES') return { ok:true, rules:await rules(store) };
        if (message.type === 'SAVE_RULE') { const all=await rules(store); const next=Object.assign({},message.rule,{updatedAt:Date.now()}); const index=all.findIndex((rule)=>rule.id===next.id); if(index>=0)all[index]=next;else all.push(next); await store.set(KEYS.rules,all); return{ok:true,rule:next}; }
        if (message.type === 'QUEUE_DRAFT') { const id=await queue.enqueue(message.draft); const result=await serialFlush('delivery'); return { ok:true, id, delivered:result.delivered>0, deliveryState:deliveryStateFromResult(result.lastResult), lastResult:result.lastResult, diagnostics:[diag('queue-saved'), ...(result.diagnostics || [])] }; }
        if (message.type === 'TESTCODE_READY' || message.type === 'FLUSH_PENDING') return Object.assign({ok:true},await serialFlush('delivery'));
        return { ok:false,error:'unknown-message' };
      })().then(sendResponse).catch((error)=>sendResponse({ok:false,error:String(error&&error.message||error),diagnostics:[diag('background-error',false,error&&error.message||error)]})); return true;
    });
    if (chromeApi.tabs && chromeApi.tabs.onUpdated) chromeApi.tabs.onUpdated.addListener(async(tabId,changeInfo,tab)=>{ if(changeInfo.status!=='complete'||!tab.url)return; try{const origin=new URL(tab.url).origin;if((await registeredOrigins(store)).includes(origin))await injectSite(chromeApi,tabId);}catch(_){} });
  }
  return { KEYS, makeMemoryStore, makeQueue, makeSerializedFlusher, summarizeRuleFields, deliveryStateFromResult, installChromeHandlers, flushPending };
});