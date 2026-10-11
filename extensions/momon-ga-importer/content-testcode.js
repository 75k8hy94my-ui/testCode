(() => {
  'use strict';
  if (location.origin !== 'https://75k8hy94my-ui.github.io' || location.pathname !== '/testCode/manga.html') return;
  const pending = new Set();
  let queueReadGranted = false;
  window.addEventListener('click', event => {
    if (event.isTrusted && event.target?.closest?.('#bulkDetectBtn')) queueReadGranted = true;
  }, true);
  window.addEventListener('message', async event => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || data?.type !== 'TESTCODE_MOMON_IMPORT_REQUEST' || data.schemaVersion !== 1 || typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 128 || pending.has(data.requestId) || !queueReadGranted) return;
    queueReadGranted = false;
    pending.add(data.requestId);
    try {
      const request = { type: 'MOMON_QUEUE_REQUEST', schemaVersion: 1, requestId: data.requestId };
      const response = await chrome.runtime.sendMessage(request);
      if (response?.type === 'TESTCODE_MOMON_IMPORT_RESPONSE' && response.schemaVersion === 1 && response.requestId === data.requestId && Array.isArray(response.items)) window.postMessage(response, location.origin);
      else if (response?.error) window.postMessage({ type: 'TESTCODE_MOMON_IMPORT_ERROR', schemaVersion: 1, requestId: data.requestId, error: response.error }, location.origin);
    } catch (error) {
      window.postMessage({ type: 'TESTCODE_MOMON_IMPORT_ERROR', schemaVersion: 1, requestId: data.requestId, error: error.message }, location.origin);
    } finally { pending.delete(data.requestId); }
  });
})();
