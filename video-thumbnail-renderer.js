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
    const cache = root.MangaReaderVideoThumbnailCache;
    const rotation = root.MangaReaderVideoData && typeof root.MangaReaderVideoData.getRotationDirection === 'function'
      ? root.MangaReaderVideoData.getRotationDirection(record)
      : (record.rotate90Direction === 'left' || record.rotate90Direction === 'right'
        ? record.rotate90Direction : record.rotate90 === true ? 'left' : 'none');
    const rotate180 = record.virtualThumbRotation === 180;
    const rotate = isDirectVideo(record.url) && (rotation !== 'none' || rotate180);
    const applyMediaRotation = (media, width, height) => {
      if (!rotate || !media || !(width > 0 && height > 0)) return;
      if (rotate180) {
        media.style.inset = '0';
        media.style.width = '100%';
        media.style.height = '100%';
        media.style.transformOrigin = 'center center';
        media.style.transform = 'rotate(180deg)';
        media.style.objectFit = 'cover';
        return;
      }
      // A rotated media element must occupy the exchanged width/height of the thumbnail.
      // Percentages are relative to the thumbnail's (rotated) dimensions.
      media.style.inset = 'auto';
      media.style.left = '50%';
      media.style.top = '50%';
      media.style.width = '56.25%';
      media.style.height = '177.777778%';
      media.style.transform = 'translate(-50%, -50%) rotate(' + (rotation === 'right' ? '90' : '-90') + 'deg)';
      media.style.objectFit = 'cover';
    };
    const applyNativeRatio = (width, height) => {
      if (!isDirectVideo(record.url) || !(width > 0 && height > 0)) return;
      container.style.aspectRatio = width + ' / ' + height;
    };
    const addDirectPreview = () => {
      if (preview || !isDirectVideo(record.url)) return;
      preview = doc.createElement('video'); preview.className = options && options.videoClass || 'vl-thumb-direct-video';
      preview.muted = true; preview.playsInline = true; preview.preload = 'metadata'; preview.src = record.url;
      preview.style.visibility = 'hidden'; preview.addEventListener('loadedmetadata', () => {
        applyNativeRatio(Number(preview.videoWidth), Number(preview.videoHeight));
        applyMediaRotation(preview, Number(preview.videoWidth), Number(preview.videoHeight));
        const duration = Number(preview.duration);
        if (Number.isFinite(duration) && duration > 0 && options && typeof options.onDuration === 'function') options.onDuration(duration);
        try { preview.currentTime = Math.max(0, Number(record.thumbnailTimeSeconds) || 0.1); } catch (_) {}
      });
      preview.addEventListener('seeked', () => {
        show(preview);
        if (cache && cache.permitted()) {
          const time = Math.max(0, Number(record.thumbnailTimeSeconds) || 0.1);
          cache.getOrCapture(record.url, time).then(blob => {
            if (!blob || !preview || !preview.isConnected || !cache.permitted() || !root.URL || !root.URL.createObjectURL) return;
            const objectUrl = root.URL.createObjectURL(blob);
            const cached = doc.createElement('img');
            cached.alt = ''; cached.className = 'videoThumbnailCached';
            cached.onload = () => {
              applyNativeRatio(cached.naturalWidth, cached.naturalHeight);
              applyMediaRotation(cached, cached.naturalWidth, cached.naturalHeight);
              if (preview && preview.isConnected && cache.permitted()) {
                preview.pause(); preview.removeAttribute('src'); preview.remove(); preview = null;
                container.append(cached); show(cached);
              }
              root.URL.revokeObjectURL(objectUrl);
            };
            cached.onerror = () => root.URL.revokeObjectURL(objectUrl);
            cached.src = objectUrl;
          }).catch(() => {});
        }
      });
      preview.addEventListener('loadeddata', () => { if (!preview.currentTime) show(preview); });
      preview.addEventListener('error', () => revealFallback(preview)); container.append(preview);
    };
    const src = imageUrl(record);
    if (src) {
      image = doc.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.src = src;
      image.style.visibility = 'hidden'; image.addEventListener('load', () => {
        if (rotate) {
          // Custom thumbnails may not have the same ratio as the video frame.
          applyNativeRatio(image.naturalWidth, image.naturalHeight);
          applyMediaRotation(image, image.naturalWidth, image.naturalHeight);
        }
        show(image);
      });
      image.addEventListener('error', () => { revealFallback(image); image = null; addDirectPreview(); }); container.append(image);
    } else if (cache && cache.permitted() && isDirectVideo(record.url)) {
      cache.read(record.url, Math.max(0, Number(record.thumbnailTimeSeconds) || 0.1)).then(blob => {
        if (!blob || !root.URL || !root.URL.createObjectURL || !cache.permitted()) { addDirectPreview(); return; }
        const url = root.URL.createObjectURL(blob), cached = doc.createElement('img');
        cached.className = 'videoThumbnailCached'; cached.alt = '';
        cached.onload = () => { applyNativeRatio(cached.naturalWidth, cached.naturalHeight); applyMediaRotation(cached, cached.naturalWidth, cached.naturalHeight); if (cache.permitted()) show(cached); root.URL.revokeObjectURL(url); };
        cached.onerror = () => { cached.remove(); root.URL.revokeObjectURL(url); addDirectPreview(); };
        cached.src = url; container.append(cached);
      }).catch(addDirectPreview);
    } else addDirectPreview();
    return { fallback, get image() { return image; }, get video() { return preview; } };
  }

  const api = Object.freeze({ imageUrl, render });
  root.MangaReaderVideoThumbnailRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
