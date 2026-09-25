(() => {
  'use strict';

  function serializeError(error) {
    return { name: error?.name || 'Error', message: error?.message || String(error) };
  }

  function createWorkerMessageHandler({ process } = {}) {
    const processFunction = process || ((options) => {
      const host = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null);
      if (!host?.ImagePhotoProcessor?.processPhotoOnMainThread) throw new Error('ImagePhotoProcessor is unavailable in worker');
      return host.ImagePhotoProcessor.processPhotoOnMainThread(options.file, options);
    });
    return async (message, send) => {
      if (!message || message.type !== 'process') return;
      try {
        const result = await processFunction({
          file: message.file,
          profile: message.profile,
          onProgress: progress => send({ type: 'progress', progress })
        });
        send({ type: 'complete', result });
      } catch (error) {
        send({ type: 'error', error: serializeError(error) });
      }
    };
  }

  const host = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null);
  if (host && typeof host.importScripts === 'function' && !host.ImagePhotoProcessor) {
    host.importScripts('image-compression-profile.js', 'image-pyramid-builder.js', 'image-photo-processor.js');
  }
  if (host && typeof host.postMessage === 'function' && typeof host.addEventListener === 'function') {
    const handler = createWorkerMessageHandler();
    host.addEventListener('message', event => handler(event.data, message => host.postMessage(message)));
  }

  const api = { createWorkerMessageHandler, serializeError };
  if (typeof module !== 'undefined') module.exports = api;
})();
