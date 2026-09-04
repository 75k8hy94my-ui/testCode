(()=>{
'use strict';

function createWorkerHandler(searchApi, postMessageFn) {
  if (!searchApi || typeof searchApi.buildIndex !== 'function' || typeof searchApi.search !== 'function') throw new Error('legal index search API is required');
  if (typeof postMessageFn !== 'function') throw new Error('postMessage function is required');
  let index = searchApi.buildIndex([]);

  return function handle(message) {
    const data = message && typeof message === 'object' ? message : {};
    try {
      if (data.type === 'build') {
        index = searchApi.buildIndex(Array.isArray(data.books) ? data.books : []);
        postMessageFn({ type: 'built', generation: Number(data.generation || 0) });
        return;
      }
      if (data.type === 'search') {
        const results = searchApi.search(index, data.query || '', data.options || {});
        postMessageFn({ type: 'results', requestId: Number(data.requestId || 0), results });
        return;
      }
      if (data.type === 'dispose') {
        index = searchApi.buildIndex([]);
        return;
      }
      throw new Error(`unsupported worker message: ${String(data.type || '')}`);
    } catch (error) {
      postMessageFn({
        type: 'error',
        requestId: data.requestId == null ? undefined : Number(data.requestId),
        message: error && error.message ? error.message : String(error)
      });
    }
  };
}

const api = { createWorkerHandler };
if (typeof module !== 'undefined') module.exports = api;
if (typeof window !== 'undefined') window.LegalIndexSearchWorker = api;

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof importScripts === 'function') {
  try {
    if (!self.HyakusenCatalog) importScripts('hyakusen-catalog.js');
    if (!self.LegalIndexSearch) importScripts('legal-index-search.js');
    const handler = createWorkerHandler(self.LegalIndexSearch, self.postMessage.bind(self));
    self.onmessage = (event) => handler(event.data);
  } catch (error) {
    self.postMessage({ type: 'error', message: error && error.message ? error.message : String(error) });
  }
}
})();
