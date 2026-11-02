(function (root) {
  'use strict';

  // Limit simultaneous MP4 seeks/decoders. Mobile WebKit can stall when a
  // full page of video cards starts loading at once.
  const corsBlockedOrigins = new Set();
  const previewJobs = [];
  let activePreviews = 0;
  function drainPreviews() {
    while (activePreviews < 2 && previewJobs.length) {
      const job = previewJobs.shift();
      if (job.container.isConnected === false) continue;
      activePreviews += 1;
      let released = false;
      job.start(() => {
        if (released) return;
        released = true;
        activePreviews -= 1;
        drainPreviews();
      });
    }
  }
  function schedulePreview(container, start) {
    previewJobs.push({ container, start });
    drainPreviews();
  }

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
    const addDirectPreview = (releaseSlot) => {
      if (preview || !isDirectVideo(record.url)) { releaseSlot(); return; }
      const time = Math.max(0, Number(record.thumbnailTimeSeconds) || 0.1);
      let target = time;
      let captureRequested = false;
      let settled = false;
      let sourceOrigin = '';
      try { sourceOrigin = new URL(record.url).origin; } catch (_) {}
      const ownOrigin = root.location && root.location.origin || '';
      let corsEnabled = !sourceOrigin || !corsBlockedOrigins.has(sourceOrigin);

      preview = doc.createElement('video');
      preview.className = options && options.videoClass || 'vl-thumb-direct-video';
      preview.muted = true;
      preview.playsInline = true;
      preview.preload = 'metadata';
      if (corsEnabled) preview.crossOrigin = 'anonymous';
      preview.style.visibility = 'hidden';

      const release = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        releaseSlot();
      };
      const fail = () => { release(); revealFallback(preview); preview = null; };
      const displayFrame = () => {
        if (!preview || !preview.isConnected || (cache && !cache.permitted())) { release(); return; }
        applyNativeRatio(Number(preview.videoWidth), Number(preview.videoHeight));
        applyMediaRotation(preview, Number(preview.videoWidth), Number(preview.videoHeight));
        show(preview);
        release();
        if (captureRequested || !corsEnabled || !cache || !cache.permitted()
          || typeof cache.captureFromVideoAndStore !== 'function' || Number(preview.readyState) < 2) return;
        captureRequested = true;
        const sourceVideo = preview;
        cache.captureFromVideoAndStore(record.url, time, sourceVideo).then(blob => {
          if (!blob || preview !== sourceVideo || !preview.isConnected
            || !cache.permitted() || !root.URL || !root.URL.createObjectURL) return;
          const objectUrl = root.URL.createObjectURL(blob);
          const cached = doc.createElement('img');
          cached.alt = ''; cached.className = 'videoThumbnailCached';
          cached.onload = () => {
            if (preview === sourceVideo && sourceVideo.isConnected && cache.permitted()) {
              applyNativeRatio(cached.naturalWidth, cached.naturalHeight);
              applyMediaRotation(cached, cached.naturalWidth, cached.naturalHeight);
              preview = null;
              sourceVideo.pause();
              sourceVideo.removeAttribute('src');
              sourceVideo.remove();
              container.append(cached);
              show(cached);
            }
            root.URL.revokeObjectURL(objectUrl);
          };
          cached.onerror = () => root.URL.revokeObjectURL(objectUrl);
          cached.src = objectUrl;
        }).catch(() => {});
      };
      const timer = setTimeout(() => {
        if (!preview) { release(); return; }
        // A decoded initial frame is preferable to a blank card if iOS never
        // fires seeked after seeking an MP4.
        if (Number(preview.readyState) >= 2) displayFrame();
        else fail();
      }, 12000);
      preview.addEventListener('loadedmetadata', () => {
        if (!preview) return;
        applyNativeRatio(Number(preview.videoWidth), Number(preview.videoHeight));
        applyMediaRotation(preview, Number(preview.videoWidth), Number(preview.videoHeight));
        const duration = Number(preview.duration);
        if (Number.isFinite(duration) && duration > 0) {
          target = Math.min(time, Math.max(0, duration - 0.05));
          if (options && typeof options.onDuration === 'function') options.onDuration(duration);
        }
        try { preview.currentTime = target; } catch (_) { /* loadeddata can still supply a frame */ }
      });
      preview.addEventListener('seeked', displayFrame);
      preview.addEventListener('loadeddata', () => {
        if (!preview) return;
        // Seeking to the first few milliseconds does not consistently emit
        // seeked on iOS, but loadeddata still supplies a real decoded frame.
        if (Math.abs((Number(preview.currentTime) || 0) - target) < 0.15) displayFrame();
      });
      preview.addEventListener('error', () => {
        if (!preview) return;
        // Many public MP4 hosts permit playback but not CORS pixel access.
        // Retry ordinary playback once, then skip CORS on this origin for
        // subsequent cards instead of repeatedly failing every video.
        if (corsEnabled && sourceOrigin && sourceOrigin !== ownOrigin) {
          corsEnabled = false;
          corsBlockedOrigins.add(sourceOrigin);
          preview.removeAttribute('src');
          preview.removeAttribute('crossorigin');
          preview.src = record.url;
          try { preview.load(); } catch (_) {}
          return;
        }
        fail();
      });
      container.append(preview);
      preview.src = record.url;
    };
    const queueDirectPreview = () => {
      let scheduled = false;
      const start = () => {
        if (scheduled || container.isConnected === false || (cache && !cache.permitted())) return;
        scheduled = true;
        schedulePreview(container, addDirectPreview);
      };
      // Read IndexedDB first; only start remote MP4 downloads near the viewport.
      if (typeof root.IntersectionObserver === 'function') {
        const observer = new root.IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
        }, { rootMargin: '280px 0px' });
        observer.observe(container);
      } else if (typeof root.setTimeout === 'function') root.setTimeout(start, 0);
      else Promise.resolve().then(start);
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
      image.addEventListener('error', () => { revealFallback(image); image = null; queueDirectPreview(); }); container.append(image);
    } else if (cache && cache.permitted() && isDirectVideo(record.url)) {
      cache.read(record.url, Math.max(0, Number(record.thumbnailTimeSeconds) || 0.1)).then(blob => {
        if (!blob || !root.URL || !root.URL.createObjectURL || !cache.permitted()) { queueDirectPreview(); return; }
        const url = root.URL.createObjectURL(blob), cached = doc.createElement('img');
        cached.className = 'videoThumbnailCached'; cached.alt = '';
        cached.onload = () => { applyNativeRatio(cached.naturalWidth, cached.naturalHeight); applyMediaRotation(cached, cached.naturalWidth, cached.naturalHeight); if (cache.permitted()) show(cached); root.URL.revokeObjectURL(url); };
        cached.onerror = () => { cached.remove(); root.URL.revokeObjectURL(url); queueDirectPreview(); };
        cached.src = url; container.append(cached);
      }).catch(queueDirectPreview);
    } else queueDirectPreview();
    return { fallback, get image() { return image; }, get video() { return preview; } };
  }

  const api = Object.freeze({ imageUrl, render });
  root.MangaReaderVideoThumbnailRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
