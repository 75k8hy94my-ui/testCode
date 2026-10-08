(function (root) {
  'use strict';

  function install(frame, media, direction, options) {
    const className = direction === 'left' ? 'videoPlayerRotatedLeft'
      : direction === 'right' ? 'videoPlayerRotatedRight' : '';
    if (!frame || !media || !className) return () => {};

    const config = options || {};
    const requestFrame = config.requestFrame || (typeof root.requestAnimationFrame === 'function'
      ? (callback) => root.requestAnimationFrame(callback)
      : (callback) => callback());
    const ResizeObserverImpl = config.ResizeObserverImpl || root.ResizeObserver;
    let disposed = false;
    let metadataReady = Number(media.videoWidth) > 0 && Number(media.videoHeight) > 0;
    let resizeObserver = null;

    function resize() {
      if (disposed || !metadataReady) return;
      requestFrame(() => {
        if (disposed) return;
        const width = Number(frame.clientWidth) || 0;
        const height = Number(frame.clientHeight) || 0;
        if (width && height) {
          media.style.width = height + 'px';
          media.style.height = width + 'px';
        }
      });
    }

    function onMetadata() {
      metadataReady = Number(media.videoWidth) > 0 && Number(media.videoHeight) > 0;
      resize();
    }

    media.classList.add(className);
    media.addEventListener('loadedmetadata', onMetadata);
    if (typeof ResizeObserverImpl === 'function') {
      resizeObserver = new ResizeObserverImpl(resize);
      resizeObserver.observe(frame);
    }
    resize();

    return () => {
      if (disposed) return;
      disposed = true;
      media.removeEventListener('loadedmetadata', onMetadata);
      if (resizeObserver) resizeObserver.disconnect();
      media.classList.remove(className);
      media.style.width = '';
      media.style.height = '';
    };
  }

  const api = Object.freeze({ install });
  root.MangaReaderVideoRotation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
