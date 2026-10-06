(() => {
  'use strict';
  if (location.origin !== 'https://75k8hy94my-ui.github.io' || location.pathname !== '/testCode/manga.html') return;
  const pending = new Set();
  window.addEventListener('message', async event => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || !['TESTCODE_MOMON_IMPORT_REQUEST', 'TESTCODE_MOMON_IMPORT_REMOVE_REQUEST'].includes(data?.type) || data.schemaVersion !== 1 || typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 128 || pending.has(data.requestId)) return;
    const removal = data.type === 'TESTCODE_MOMON_IMPORT_REMOVE_REQUEST';
    if (removal && (!Array.isArray(data.queueIds) || !data.queueIds.length || data.queueIds.length > 500 || new Set(data.queueIds).size !== data.queueIds.length || data.queueIds.some(id => typeof id !== 'string' || !id || id.length > 128))) return;
    pending.add(data.requestId);
    try {
      const request = removal ? { type: 'MOMON_QUEUE_REMOVE_SELECTED', schemaVersion: 1, requestId: data.requestId, queueIds: data.queueIds } : { type: 'MOMON_QUEUE_REQUEST', schemaVersion: 1, requestId: data.requestId };
      const response = await chrome.runtime.sendMessage(request);
      if (response?.type === (removal ? 'TESTCODE_MOMON_IMPORT_REMOVE_RESPONSE' : 'TESTCODE_MOMON_IMPORT_RESPONSE') && response.schemaVersion === 1 && response.requestId === data.requestId && (removal ? Array.isArray(response.removedQueueIds) : Array.isArray(response.items))) window.postMessage(response, location.origin);
      else if (response?.error) window.postMessage({ type: 'TESTCODE_MOMON_IMPORT_ERROR', schemaVersion: 1, requestId: data.requestId, error: response.error }, location.origin);
    } catch (error) {
      window.postMessage({ type: 'TESTCODE_MOMON_IMPORT_ERROR', schemaVersion: 1, requestId: data.requestId, error: error.message }, location.origin);
    } finally { pending.delete(data.requestId); }
  });
})();
