(() => {
  'use strict';
  if (window.__testcodeMangaRelayInstalled) return;
  window.__testcodeMangaRelayInstalled = true;

  const REQUEST_TYPE = 'testcode:manga-extension:import';
  const RESULT_TYPE = 'testcode:manga-extension:result';
  const READY_TYPE = 'testcode:manga-extension:bridge-ready';
  const pending = new Map();
  let bridgeReady = false;

  function requestId() { return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9); }

  function injectBridge() {
    if (document.querySelector('script[data-testcode-manga-extension-bridge]')) return;
    const script = document.createElement('script');
    script.dataset.testcodeMangaExtensionBridge = '1';
    script.src = new URL('manga-extension-bridge.js', location.href).href;
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }

  function deliver(draft) {
    return new Promise((resolve) => {
      const id = requestId();
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ status: bridgeReady ? 'invalid' : 'locked', message: bridgeReady ? 'testCodeから応答がありません。' : 'testCodeの保管庫を開いてください。' });
      }, 4000);
      pending.set(id, { resolve, timer });
      window.postMessage({ type: REQUEST_TYPE, requestId: id, draft }, location.origin);
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === READY_TYPE) {
      bridgeReady = true;
      chrome.runtime.sendMessage({ type:'TESTCODE_READY' }).catch(() => {});
      return;
    }
    if (event.data.type !== RESULT_TYPE) return;
    const key = String(event.data.requestId || '');
    const waiter = pending.get(key);
    if (!waiter) return;
    pending.delete(key);
    clearTimeout(waiter.timer);
    waiter.resolve(event.data.result || { status:'invalid', message:'応答形式が正しくありません。' });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'DELIVER_DRAFT' || !message.item) return false;
    deliver(message.item.draft).then(sendResponse).catch((error) => sendResponse({ status:'invalid', message:String(error && error.message || error) }));
    return true;
  });

  injectBridge();
  setTimeout(() => chrome.runtime.sendMessage({ type:'TESTCODE_READY' }).catch(() => {}), 500);
})();