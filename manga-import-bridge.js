(function (root) {
  'use strict';
  const MAX_ITEMS = 500;
  const MAX_TIMEOUT = 30000;
  function create({ windowRef, origin, timeoutMs = 12000, createRequestId = () => (windowRef.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`) }) {
    if (!windowRef || typeof windowRef.addEventListener !== 'function' || typeof windowRef.postMessage !== 'function' || typeof origin !== 'string' || !origin) throw new TypeError('MangaImportBridge requires windowRef and origin');
    const timeout = Math.max(100, Math.min(MAX_TIMEOUT, Number(timeoutMs) || 12000));
    function request(type, extra = {}) {
      const requestId = String(createRequestId());
      if (!requestId || requestId.length > 128) return Promise.reject(new Error('Invalid import request ID'));
      return new Promise((resolve, reject) => {
        let timer;
        const finish = (fn, value) => { windowRef.removeEventListener('message', onMessage); windowRef.clearTimeout?.(timer); clearTimeout(timer); fn(value); };
        const onMessage = (event) => {
          const data = event?.data;
          if (!data) return;
          const responseLike = typeof data.type === 'string' && (data.type.startsWith('TESTCODE_MOMON_IMPORT_') || data.requestId === requestId);
          if (!responseLike) return;
          if (event.source !== windowRef || event.origin !== origin) return finish(reject, new Error('Mismatched import response source or origin'));
          if (data.requestId !== requestId) return finish(reject, new Error('Mismatched import response request ID'));
          if (data.type === 'TESTCODE_MOMON_IMPORT_ERROR') {
            if (data.schemaVersion === 1 && typeof data.error === 'string') finish(reject, new Error(data.error));
            return;
          }
          const removing = type === 'TESTCODE_MOMON_IMPORT_REMOVE_REQUEST';
          const expectedType = removing ? 'TESTCODE_MOMON_IMPORT_REMOVE_RESPONSE' : 'TESTCODE_MOMON_IMPORT_RESPONSE';
          if (data.type !== expectedType) return finish(reject, new Error('Invalid import response type'));
          if (data.schemaVersion !== 1) return finish(reject, new Error('Invalid import response schema'));
          if (removing) {
            if (!Array.isArray(data.removedQueueIds) || data.removedQueueIds.some(id => typeof id !== 'string')) return finish(reject, new Error('Invalid queue removal response'));
            return finish(resolve, data.removedQueueIds);
          }
          let serializedBytes = Infinity;
          try { serializedBytes = new TextEncoder().encode(JSON.stringify(data.items)).length; } catch (_) {}
          if (!Array.isArray(data.items) || data.items.length > MAX_ITEMS || serializedBytes > 4 * 1024 * 1024 || data.items.some(item => !item || typeof item.queueId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.queueId) || !Number.isFinite(item.addedAt) || !item.candidate || typeof item.candidate !== 'object' || !Array.isArray(item.warnings) || item.warnings.length > 20 || item.warnings.some(warning => typeof warning !== 'string' || warning.length > 500))) return finish(reject, new Error('Invalid queued item response'));
          if (new Set(data.items.map(item => item.queueId)).size !== data.items.length) return finish(reject, new Error('Duplicate queue ID in response'));
          finish(resolve, data.items.map(item => ({ queueId: item.queueId, candidate: item.candidate, addedAt: item.addedAt, warnings: [...item.warnings] })));
        };
        windowRef.addEventListener('message', onMessage);
        timer = (windowRef.setTimeout || setTimeout)(() => finish(reject, new Error('Import request timed out')), timeout);
        windowRef.postMessage({ type, schemaVersion: 1, requestId, ...extra }, origin);
      });
    }
    return Object.freeze({
      requestQueuedCandidates: () => request('TESTCODE_MOMON_IMPORT_REQUEST'),
      removeQueuedCandidates(queueIds) {
        if (!Array.isArray(queueIds) || !queueIds.length || queueIds.length > MAX_ITEMS || queueIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) || new Set(queueIds).size !== queueIds.length) return Promise.reject(new Error('Invalid queue IDs'));
        return request('TESTCODE_MOMON_IMPORT_REMOVE_REQUEST', { queueIds: [...queueIds] });
      },
    });
  }
  root.MangaImportBridge = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : globalThis);
