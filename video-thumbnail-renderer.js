(function (root) {
  'use strict';

  function imageUrl(video) {
    if (video && video.thumbnailUrl) return String(video.thumbnailUrl);
    try {
      const url = new URL(video && video.url || '');
      const host = url.hostname.replace(/^www\./, '');
      let id = '';
      if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
      if (host === 'youtube.com' || host.endsWith('.youtube.com')) id = url.searchParams.get('v') || ((url.pathname.match(/^\/(?:shorts|embed|v)\/([^/?#]+)/) || [])[1] || '');
      return id ? 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/hqdefault.jpg' : '';
    } catch (_) { return ''; }
  }

  function isDirectVideo(url) { return /\.(?:mp4|webm|ogg|ogv|m4v|mov)(?:[?#].*)?$/i.test(String(url || '')); }

  function render(container, video, options) {
    const doc = options && options.documentRef || root.document;
    if (!container || !doc) throw new TypeError('container and document are required');
    const record = video || {};
    container.replaceChildren();
    const fallback = doc.createElement('span');
    fallback.className = options && options.fallbackClass || 'videoThumbnailFallback';
    const mark = doc.createElement('b'); mark.textContent = '▶';
    const service = doc.createElement('span'); service.textContent = options && options.serviceLabel || record.service || record.a || 'VIDEO';
    fallback.append(mark, service); container.append(fallback);
    let image = null; let preview = null;
    const show = (media) => { if (media.dataset) media.dataset.frameReady = '1'; media.style.visibility = 'visible'; fallback.hidden = true; };
    const revealFallback = (media) => { if (media && media.parentNode) media.remove(); fallback.hidden = false; };
    const addDirectPreview = () => {
      if (preview || !isDirectVideo(record.url)) return;
      preview = doc.createElement('video'); preview.className = options && options.videoClass || 'vl-thumb-direct-video';
      preview.muted = true; preview.playsInline = true; preview.preload = 'metadata'; preview.src = record.url;
      preview.style.visibility = 'hidden'; preview.addEventListener('loadedmetadata', () => { try { preview.currentTime = Math.max(0, Number(record.thumbnailTimeSeconds) || 0.1); } catch (_) {} });
      preview.addEventListener('seeked', () => show(preview));
      preview.addEventListener('loadeddata', () => { if (!preview.currentTime) show(preview); });
      preview.addEventListener('error', () => revealFallback(preview)); container.append(preview);
    };
    const src = imageUrl(record);
    if (src) {
      image = doc.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.src = src;
      image.style.visibility = 'hidden'; image.addEventListener('load', () => show(image));
      image.addEventListener('error', () => { revealFallback(image); image = null; addDirectPreview(); }); container.append(image);
    } else addDirectPreview();
    return { fallback, get image() { return image; }, get video() { return preview; } };
  }

  const api = Object.freeze({ imageUrl, render });
  root.MangaReaderVideoThumbnailRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
