/* testCode shared Liquid Glass material renderer.
   This file is the single optical implementation for desktop and mobile.
   Content behind a surface is never captured, cloned, read or persisted. */
(() => {
  'use strict';

  const SVG = 'http://www.w3.org/2000/svg';
  const SCALE = 36;
  const PRESETS = Object.freeze([
    { selector: '#readerApp #topbar, #readerApp #controls, #readerApp #nextVolumeBanner', kind: 'panel', optical: true },
    { selector: '#readerApp .ctrlBtn', kind: 'button', optical: false },
    { selector: '#mobileBottomNav.liquidGlassNav', kind: 'panel', optical: true },
    { selector: '#mobileBottomNav .liquidGlassSelection', kind: 'lens', optical: true },
    { selector: '#mobileUtilityMenu', kind: 'panel', optical: true },
    { selector: '#appGlobalHeader.globalAppHeader', kind: 'panel', optical: true },
    { selector: '#mangaListSection .bookshelf-pagination', kind: 'panel', optical: true },
    { selector: '.glass, .glassBtn', kind: 'button', optical: false },
  ]);

  // Signed distance to a rounded rectangular lens (negative inside).
  function roundedDistance(x, y, width, height, radius) {
    const a = width / 2;
    const b = height / 2;
    const r = Math.max(0, Math.min(radius, a, b));
    const dx = Math.abs(x - a) - a + r;
    const dy = Math.abs(y - b) - b + r;
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
      + Math.min(Math.max(dx, dy), 0) - r;
  }

  // Encoded red/green offsets for SVG feDisplacementMap.
  function displacementPixels(width, height, radius, bevel = 17, strength = 11) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const thickness = Math.max(2, bevel);
    const amplitude = Math.max(0, Math.min(17, strength));
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const px = x + .5;
        const py = y + .5;
        const d = roundedDistance(px, py, w, h, radius);
        let offsetX = 0;
        let offsetY = 0;
        if (d < 0 && d > -thickness) {
          const gx = roundedDistance(px + .5, py, w, h, radius) - roundedDistance(px - .5, py, w, h, radius);
          const gy = roundedDistance(px, py + .5, w, h, radius) - roundedDistance(px, py - .5, w, h, radius);
          const length = Math.hypot(gx, gy) || 1;
          const t = 1 - Math.min(1, -d / thickness);
          const shift = amplitude * t * t * (3 - 2 * t);
          offsetX = -gx / length * shift;
          offsetY = -gy / length * shift;
        }
        const i = (y * w + x) * 4;
        pixels[i] = Math.round(255 * (.5 + offsetX / SCALE));
        pixels[i + 1] = Math.round(255 * (.5 + offsetY / SCALE));
        pixels[i + 2] = 128;
        pixels[i + 3] = 255;
      }
    }
    return pixels;
  }

  function canRefract(win) {
    const ua = String(win.navigator?.userAgent || '');
    // Safari (including iOS Chrome) does not consistently apply SVG filters
    // to CSS backdrop-filter. Use its native blur instead of claiming refraction.
    const blink = /(?:Chrome|Chromium|Edg|OPR)\/[\d.]+/.test(ua) && !/(CriOS|EdgiOS|FxiOS)\//.test(ua);
    return blink && !!win.CSS?.supports?.('backdrop-filter', 'url("#lg-probe")')
      && !!win.ResizeObserver;
  }

  function createMaterialEngine(doc, win) {
    const surfaces = new Map();
    const custom = new Map();
    const optical = canRefract(win);
    const reducedTransparency = win.matchMedia?.('(prefers-reduced-transparency: reduce)');
    const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let scanScheduled = false;
    let resizeScheduled = false;
    let idCounter = 0;
    let observer = null;
    let watcher = null;
    let svg = null;
    let defs = null;

    function addDefs() {
      if (svg) return;
      svg = doc.createElementNS(SVG, 'svg');
      svg.classList.add('lg-definitions');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      defs = doc.createElementNS(SVG, 'defs');
      svg.append(defs);
      doc.body.append(svg);
    }

    function createFilter(state) {
      addDefs();
      const filter = doc.createElementNS(SVG, 'filter');
      filter.id = 'tc-lg-' + (++idCounter);
      filter.setAttribute('x', '-20%');
      filter.setAttribute('y', '-45%');
      filter.setAttribute('width', '140%');
      filter.setAttribute('height', '190%');
      filter.setAttribute('color-interpolation-filters', 'sRGB');

      const image = doc.createElementNS(SVG, 'feImage');
      image.setAttribute('preserveAspectRatio', 'none');
      image.setAttribute('result', 'lensMap');
      const blur = doc.createElementNS(SVG, 'feGaussianBlur');
      blur.setAttribute('in', 'SourceGraphic');
      blur.setAttribute('stdDeviation', '2.6');
      blur.setAttribute('result', 'softBackdrop');
      const displacement = doc.createElementNS(SVG, 'feDisplacementMap');
      displacement.setAttribute('in', 'softBackdrop');
      displacement.setAttribute('in2', 'lensMap');
      displacement.setAttribute('scale', String(SCALE));
      displacement.setAttribute('xChannelSelector', 'R');
      displacement.setAttribute('yChannelSelector', 'G');
      filter.append(image, blur, displacement);
      defs.append(filter);
      state.filter = filter;
      state.image = image;
      state.filterId = filter.id;
    }

    function registerElement(node, options) {
      if (!node || !node.classList || surfaces.has(node)) return;
      const kind = options.kind === 'lens' ? 'lens' : options.kind === 'button' ? 'button' : 'panel';
      const state = {
        node, kind, optical: options.optical !== false && kind !== 'button',
        filter: null, image: null, width: 0, height: 0, radius: 0, lastRatio: 0,
        onMove: null, onLeave: null
      };
      surfaces.set(node, state);
      node.classList.add('lg-surface');
      node.dataset.lgMaterial = kind;
      if (state.optical && optical) {
        createFilter(state);
        watcher?.observe(node);
      }

      if (!reducedMotion?.matches) {
        state.onMove = (event) => {
          if (event.pointerType === 'touch' && !event.isPrimary) return;
          const rect = node.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const x = Math.max(0, Math.min(100, (event.clientX - rect.left) * 100 / rect.width));
          const y = Math.max(0, Math.min(100, (event.clientY - rect.top) * 100 / rect.height));
          node.style.setProperty('--lg-light-x', x.toFixed(1) + '%');
          node.style.setProperty('--lg-light-y', y.toFixed(1) + '%');
        };
        state.onLeave = () => {
          node.style.removeProperty('--lg-light-x');
          node.style.removeProperty('--lg-light-y');
        };
        node.addEventListener('pointermove', state.onMove, { passive: true });
        node.addEventListener('pointerleave', state.onLeave, { passive: true });
      }
      scheduleResize();
    }

    function removeElement(node) {
      const state = surfaces.get(node);
      if (!state) return;
      watcher?.unobserve(node);
      node.removeEventListener('pointermove', state.onMove);
      node.removeEventListener('pointerleave', state.onLeave);
      node.classList.remove('lg-surface', 'lg-optical');
      node.style.removeProperty('--lg-material-filter');
      node.style.removeProperty('--lg-light-x');
      node.style.removeProperty('--lg-light-y');
      delete node.dataset.lgMaterial;
      state.filter?.remove();
      surfaces.delete(node);
    }

    function scan() {
      if (disposed) return;
      for (const [node] of surfaces) if (!node.isConnected) removeElement(node);
      for (const preset of PRESETS) {
        doc.querySelectorAll(preset.selector).forEach((node) => registerElement(node, preset));
      }
      doc.querySelectorAll('[data-liquid-glass]').forEach((node) => {
        registerElement(node, {
          kind: node.dataset.liquidGlass || 'panel',
          optical: node.dataset.liquidGlass !== 'button'
        });
      });
      for (const [selector, options] of custom) {
        doc.querySelectorAll(selector).forEach((node) => registerElement(node, options));
      }
    }

    function scheduleScan() {
      if (disposed || scanScheduled) return;
      scanScheduled = true;
      win.requestAnimationFrame(() => {
        scanScheduled = false;
        scan();
      });
    }

    function redraw(state) {
      const { node } = state;
      if (!node.isConnected || !node.getBoundingClientRect) return;
      if (!optical || reducedTransparency?.matches || !state.optical) {
        node.classList.remove('lg-optical');
        return;
      }
      const bounds = node.getBoundingClientRect();
      const style = win.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || bounds.width < 15 || bounds.height < 12) {
        node.classList.remove('lg-optical');
        return;
      }
      // A surface can be wide, but its map need not exceed 1200 x 200 pixels.
      const ratio = Math.min(1, 1200 / bounds.width, 200 / bounds.height);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      const radius = (parseFloat(style.borderTopLeftRadius) || 0) * ratio;
      if (state.width === width && state.height === height && state.radius === radius && state.lastRatio === ratio) return;
      try {
        const canvas = doc.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return;
        const imageData = context.createImageData(width, height);
        imageData.data.set(displacementPixels(width, height, radius, 17 * ratio, 11 * ratio));
        context.putImageData(imageData, 0, 0);
        state.image.setAttribute('x', '0');
        state.image.setAttribute('y', '0');
        state.image.setAttribute('width', String(bounds.width));
        state.image.setAttribute('height', String(bounds.height));
        state.image.setAttribute('href', canvas.toDataURL('image/png'));
        node.style.setProperty('--lg-material-filter', 'url("#' + state.filterId + '") saturate(170%)');
        state.width = width;
        state.height = height;
        state.radius = radius;
        state.lastRatio = ratio;
        node.classList.add('lg-optical');
      } catch (_) {
        node.classList.remove('lg-optical');
      }
    }

    function scheduleResize() {
      if (disposed || resizeScheduled) return;
      resizeScheduled = true;
      win.requestAnimationFrame(() => {
        resizeScheduled = false;
        for (const state of surfaces.values()) if (state.optical) redraw(state);
      });
    }

    function register(selector, options = {}) {
      if (typeof selector !== 'string' || !selector.trim()) return;
      custom.set(selector, options);
      scheduleScan();
    }

    function destroy() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      watcher?.disconnect();
      for (const node of surfaces.keys()) removeElement(node);
      svg?.remove();
      custom.clear();
    }

    if (optical) watcher = new win.ResizeObserver(scheduleResize);
    observer = new win.MutationObserver(scheduleScan);
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    reducedTransparency?.addEventListener?.('change', scheduleResize);
    win.addEventListener('resize', scheduleResize, { passive: true });
    win.addEventListener('pagehide', destroy, { once: true });
    scan();
    return { register, refresh: scheduleScan, destroy };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PRESETS, roundedDistance, displacementPixels, canRefract, createMaterialEngine };
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const init = () => {
      if (window.TestCodeLiquidGlass) return;
      window.TestCodeLiquidGlass = createMaterialEngine(document, window);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }
})();
