(() => {
  'use strict';

  // A transparent displacement map changes only pixels near the rounded rim.
  // The page, its images, and protected reader data are never copied or read.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PANEL_IDS = ['topbar', 'controls', 'nextVolumeBanner'];
  const FILTER_SCALE = 36;

  function signedDistance(x, y, width, height, radius) {
    const halfX = width / 2;
    const halfY = height / 2;
    const r = Math.max(0, Math.min(radius, halfX, halfY));
    const qx = Math.abs(x - halfX) - (halfX - r);
    const qy = Math.abs(y - halfY) - (halfY - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
      + Math.min(Math.max(qx, qy), 0) - r;
  }

  function createDisplacementPixels(width, height, radius, options = {}) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const bevel = Math.max(1, Number(options.bevel) || 19);
    const strength = Math.max(0, Math.min(FILTER_SCALE / 2 - 1, Number(options.strength) || 14));
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const distance = signedDistance(px, py, w, h, radius);
        let dx = 0;
        let dy = 0;
        if (distance < 0 && distance > -bevel) {
          const gx = signedDistance(px + 0.7, py, w, h, radius)
            - signedDistance(px - 0.7, py, w, h, radius);
          const gy = signedDistance(px, py + 0.7, w, h, radius)
            - signedDistance(px, py - 0.7, w, h, radius);
          const normalLength = Math.hypot(gx, gy) || 1;
          const amount = 1 - Math.min(1, -distance / bevel);
          // The stronger rim bends the backdrop inwards, like a convex lens.
          const shift = strength * amount * amount * (3 - 2 * amount);
          dx = -gx / normalLength * shift;
          dy = -gy / normalLength * shift;
        }
        const i = (y * w + x) * 4;
        pixels[i] = Math.round(255 * (0.5 + dx / FILTER_SCALE));
        pixels[i + 1] = Math.round(255 * (0.5 + dy / FILTER_SCALE));
        pixels[i + 2] = 128;
        pixels[i + 3] = 255;
      }
    }
    return pixels;
  }

  function supportsOpticalBackdrop(win) {
    const ua = String(win.navigator?.userAgent || '');
    // CSS.supports(url()) alone is insufficient: WebKit accepts the syntax
    // without applying an SVG displacement to the *backdrop*.
    const blink = /(?:Chrome|Chromium|Edg|OPR)\/[\d.]+/.test(ua)
      && !/(?:CriOS|EdgiOS|FxiOS)\//.test(ua);
    return blink && !!win.CSS?.supports?.('backdrop-filter', 'url("#reader-glass-probe")')
      && typeof win.ResizeObserver === 'function';
  }

  function initialize(doc, win) {
    const panels = PANEL_IDS.map((id) => doc.getElementById(id)).filter(Boolean);
    if (panels.length !== PANEL_IDS.length || !win.matchMedia) return;
    const desktop = win.matchMedia('(min-width: 801px)');
    const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
    const optical = supportsOpticalBackdrop(win);
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('reader-glass-filter-defs');
    const defs = doc.createElementNS(SVG_NS, 'defs');
    svg.append(defs);
    doc.body.append(svg);
    const panelState = new Map();

    for (const panel of panels) {
      const id = 'reader-optical-' + panel.id;
      const filter = doc.createElementNS(SVG_NS, 'filter');
      filter.setAttribute('id', id);
      filter.setAttribute('x', '-20%');
      filter.setAttribute('y', '-60%');
      filter.setAttribute('width', '140%');
      filter.setAttribute('height', '220%');
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const blur = doc.createElementNS(SVG_NS, 'feGaussianBlur');
      blur.setAttribute('in', 'SourceGraphic');
      blur.setAttribute('stdDeviation', '2.5');
      blur.setAttribute('result', 'softBackdrop');
      const map = doc.createElementNS(SVG_NS, 'feImage');
      map.setAttribute('x', '0');
      map.setAttribute('y', '0');
      map.setAttribute('preserveAspectRatio', 'none');
      map.setAttribute('result', 'refractMap');
      const displacement = doc.createElementNS(SVG_NS, 'feDisplacementMap');
      displacement.setAttribute('in', 'softBackdrop');
      displacement.setAttribute('in2', 'refractMap');
      displacement.setAttribute('scale', String(FILTER_SCALE));
      displacement.setAttribute('xChannelSelector', 'R');
      displacement.setAttribute('yChannelSelector', 'G');
      filter.append(blur, map, displacement);
      defs.append(filter);
      panelState.set(panel, { id, map, width: 0, height: 0, radius: -1 });
    }

    function redraw(panel) {
      if (!desktop.matches || !optical || !panel.isConnected) return;
      const rect = panel.getBoundingClientRect();
      if (rect.width < 30 || rect.height < 20) return;
      const width = Math.min(1400, Math.round(rect.width));
      const height = Math.min(240, Math.round(rect.height));
      const radius = Math.min(height / 2, parseFloat(win.getComputedStyle(panel).borderTopLeftRadius) || 20);
      const state = panelState.get(panel);
      if (state.width === width && state.height === height && state.radius === radius) return;
      try {
        const canvas = doc.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: false });
        if (!context) return;
        const image = context.createImageData(width, height);
        image.data.set(createDisplacementPixels(width, height, radius));
        context.putImageData(image, 0, 0);
        state.map.setAttribute('width', String(rect.width));
        state.map.setAttribute('height', String(rect.height));
        state.map.setAttribute('href', canvas.toDataURL('image/png'));
        state.width = width;
        state.height = height;
        state.radius = radius;
        panel.style.setProperty('--reader-optical-filter', 'url("#' + state.id + '") saturate(170%)');
        panel.classList.add('reader-glass-refracting');
      } catch (_) {
        // Canvas disabled / resource failure: keep the CSS frosted fallback.
        panel.classList.remove('reader-glass-refracting');
      }
    }

    let queued = false;
    function schedule() {
      if (queued) return;
      queued = true;
      win.requestAnimationFrame(() => {
        queued = false;
        if (!desktop.matches) {
          panels.forEach((panel) => panel.classList.remove('reader-glass-refracting'));
          return;
        }
        panels.forEach(redraw);
      });
    }

    if (optical) {
      const observer = new win.ResizeObserver(schedule);
      panels.forEach((panel) => observer.observe(panel));
      desktop.addEventListener?.('change', schedule);
      win.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    }

    if (!reducedMotion.matches) {
      for (const panel of panels) {
        panel.addEventListener('pointermove', (event) => {
          if (!desktop.matches || event.pointerType === 'touch') return;
          const rect = panel.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          panel.style.setProperty('--reader-light-x', ((event.clientX - rect.left) / rect.width * 100).toFixed(1) + '%');
          panel.style.setProperty('--reader-light-y', ((event.clientY - rect.top) / rect.height * 100).toFixed(1) + '%');
        }, { passive: true });
        panel.addEventListener('pointerleave', () => {
          panel.style.removeProperty('--reader-light-x');
          panel.style.removeProperty('--reader-light-y');
        }, { passive: true });
      }
    }
    schedule();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { signedDistance, createDisplacementPixels, supportsOpticalBackdrop };
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initialize(document, window), { once: true });
    } else {
      initialize(document, window);
    }
  }
})();