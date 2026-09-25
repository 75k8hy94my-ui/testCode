(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const ICONS = Object.freeze({
    home: '<svg class="mobileNavGlyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5v8A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M9 20v-6h6v6"/></svg>',
    manga: '<svg class="mobileNavGlyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c3-1.5 5.5-1.2 8 .7v13c-2.2-1.7-4.8-2-8-.6z"/><path d="M20 5.5c-3-1.5-5.5-1.2-8 .7v13c2.2-1.7 4.8-2 8-.6z"/></svg>',
    video: '<svg class="mobileNavGlyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></svg>',
    profile: '<svg class="mobileNavGlyph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/></svg>'
  });

  const SPA_ITEMS = Object.freeze([
    { key:'home', label:'ホーム', href:'home.html', id:'mobileNavHome' },
    { key:'manga', label:'漫画', href:'manga.html', id:'mobileNavManga' },
    { key:'video', label:'動画', href:'video.html', id:'mobileNavVideo' },
    { key:'profile', label:'プロフィール', href:'profile.html', id:'mobileNavProfile' },
  ]);

  const states = new WeakMap();
  let currentNav = null;
  let attachRaf = 0;
  let scrollRaf = 0;
  let lastScrollY = 0;

  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function pageKey(pathname = location.pathname) {
    const name = pathname.split('/').pop() || 'home.html';
    if (name === 'profile.html') return 'profile';
    if (name === 'manga.html' || name === 'reader.html') return 'manga';
    if (name === 'video.html' || name === 'video-player.html') return 'video';
    return 'home';
  }

  function createLens() {
    const lens = document.createElement('span');
    lens.className = 'liquidGlassSelection';
    lens.setAttribute('aria-hidden','true');
    return lens;
  }

  function createSpaItem(item) {
    const link = document.createElement('a');
    link.id = item.id;
    link.href = item.href;
    link.dataset.mobileRoute = item.key;
    link.className = 'liquidGlassNavItem';
    link.draggable = false;
    link.setAttribute('draggable','false');
    link.setAttribute('aria-label', item.label);
    link.innerHTML = ICONS[item.key] + '<span class="liquidGlassNavLabel">' + item.label + '</span>';
    return link;
  }

  function populateSpaNav(nav) {
    nav.replaceChildren();
    nav.className = 'mobileBottomNav liquidGlassNav';
    nav.dataset.mobileNavKind = 'spa';
    nav.setAttribute('aria-label','モバイルメニュー');
    nav.appendChild(createLens());
    SPA_ITEMS.forEach((item) => nav.appendChild(createSpaItem(item)));
  }

  function ensureLens(nav) {
    let lens = [...nav.children].find((node) => node.classList && node.classList.contains('liquidGlassSelection'));
    if (!lens) {
      lens = createLens();
      nav.insertBefore(lens, nav.firstChild);
    }
    return lens;
  }

  function readerFallbackTarget(nav) {
    if (nav.classList.contains('reader-mode')) return nav.querySelector('#mobileNavVideo');
    const screen = new URLSearchParams(location.hash.replace(/^#/, '')).get('screen') || '';
    if (screen === 'video-list' || screen.startsWith('video-')) return nav.querySelector('#mobileNavVideo');
    if (screen === 'author-cards' || screen.startsWith('author-') || screen === 'backup' || screen === 'settings') return nav.querySelector('#mobileNavMore');
    return nav.querySelector('#mobileNavManga');
  }

  function ensureScrollEdge() {
    let edge = document.getElementById('liquidGlassScrollEdge');
    if (!edge) {
      edge = document.createElement('div');
      edge.id = 'liquidGlassScrollEdge';
      edge.className = 'liquidGlassScrollEdge';
      edge.setAttribute('aria-hidden','true');
      document.body.appendChild(edge);
    }
    return edge;
  }

  function activeItem(nav) {
    if (!nav) return null;
    if (nav.dataset.mobileNavKind === 'spa') {
      const key = pageKey();
      let found = null;
      nav.querySelectorAll('[data-mobile-route]').forEach((item) => {
        const active = item.dataset.mobileRoute === key;
        item.classList.toggle('active', active);
        if (active) {
          item.setAttribute('aria-current','page');
          found = item;
        } else {
          item.removeAttribute('aria-current');
        }
      });
      return found;
    }
    return nav.querySelector('.liquidGlassNavItem.active, .mobileBottomNavBtn.active, [aria-current="page"]') || readerFallbackTarget(nav);
  }

  function setLensImmediate(lens, x, width) {
    lens.style.width = width + 'px';
    lens.style.transform = 'translate3d(' + x + 'px,0,0) scale3d(1,1,1)';
    lens.style.opacity = '1';
  }

  function moveLens(nav, animate = true) {
    if (!nav || !nav.isConnected) return;
    const state = states.get(nav);
    if (!state) return;
    const target = activeItem(nav);
    const lens = state.lens;
    if (nav.dataset.mobileNavKind === 'spa') {
      if (lens && !nav.classList.contains('liquidDragMode') && !nav.classList.contains('liquidHoldArmed')) lens.style.opacity = '0';
      return;
    }
    if (!target || !target.isConnected || nav.getClientRects().length === 0) {
      lens.style.opacity = '0';
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const itemRect = target.getBoundingClientRect();
    if (!navRect.width || !itemRect.width) return;
    const lensInset = nav.dataset.mobileNavKind === 'spa' ? 4 : 3;
    const x = Math.round((itemRect.left - navRect.left + lensInset) * 10) / 10;
    const width = Math.round(Math.max(0, itemRect.width - lensInset * 2) * 10) / 10;
    const previous = state.lensMetrics;

    if (!previous || !animate || reduceMotion() || typeof lens.animate !== 'function') {
      setLensImmediate(lens, x, width);
      state.lensMetrics = { x, width };
      return;
    }
    if (Math.abs(previous.x - x) < .5 && Math.abs(previous.width - width) < .5) {
      setLensImmediate(lens, x, width);
      return;
    }

    lens.getAnimations().forEach((animation) => animation.cancel());
    const direction = x >= previous.x ? 1 : -1;
    const distance = Math.abs(x - previous.x);
    const stretch = Math.min(1.18, 1.07 + distance / 900);
    const settle = Math.min(10, distance * .08) * direction;
    const middle = previous.x + (x - previous.x) * .58;
    lens.style.width = width + 'px';
    lens.style.transform = 'translate3d(' + x + 'px,0,0) scale3d(1,1,1)';
    lens.style.opacity = '1';
    nav.classList.add('liquidLensMoving');
    nav.dataset.lensDirection = direction > 0 ? 'forward' : 'backward';

    const animation = lens.animate([
      { transform:'translate3d(' + previous.x + 'px,0,0) scale3d(1,1,1)', width:previous.width + 'px', offset:0 },
      { transform:'translate3d(' + middle + 'px,0,0) scale3d(' + stretch + ',.95,1)', width:((previous.width + width) / 2) + 'px', offset:.58 },
      { transform:'translate3d(' + (x + settle) + 'px,0,0) scale3d(.985,1.025,1)', width:width + 'px', offset:.84 },
      { transform:'translate3d(' + x + 'px,0,0) scale3d(1,1,1)', width:width + 'px', offset:1 }
    ], {
      duration: 430,
      easing: 'cubic-bezier(.22,.86,.36,1)',
      fill: 'none'
    });
    animation.finished.catch(() => {}).finally(() => {
      if (nav.isConnected) nav.classList.remove('liquidLensMoving');
    });
    state.lensMetrics = { x, width };
  }

  function scheduleLens(nav = currentNav, animate = true) {
    if (!nav) return;
    const state = states.get(nav);
    if (!state) return;
    cancelAnimationFrame(state.measureRaf || 0);
    state.measureRaf = requestAnimationFrame(() => moveLens(nav, animate));
  }

  function updateLight(nav, event) {
    const state = states.get(nav);
    if (!state) return;
    state.pointerEvent = event;
    if (state.pointerRaf) return;
    state.pointerRaf = requestAnimationFrame(() => {
      state.pointerRaf = 0;
      const latest = state.pointerEvent;
      const rect = nav.getBoundingClientRect();
      if (!latest || !rect.width || !rect.height) return;
      const x = Math.max(0, Math.min(100, ((latest.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((latest.clientY - rect.top) / rect.height) * 100));
      nav.style.setProperty('--glass-light-x', x.toFixed(2) + '%');
      nav.style.setProperty('--glass-light-y', y.toFixed(2) + '%');
      const lens = state.lens;
      if (lens) {
        lens.style.setProperty('--lens-light-x', x.toFixed(2) + '%');
        lens.style.setProperty('--lens-light-y', y.toFixed(2) + '%');
      }
    });
  }

  function releasePress(nav) {
    nav.querySelectorAll('.liquidPressed').forEach((item) => item.classList.remove('liquidPressed'));
    nav.classList.remove('glassPressed');
  }

  const LONG_PRESS_MS = 160;
  const QUICK_SCRUB_MS = 70;
  const QUICK_SCRUB_X = 7;
  const TAP_SLOP = 14;

  function spaNavItems(nav) {
    return [...nav.querySelectorAll('[data-mobile-route]')];
  }

  function clearLongPressTimer(state) {
    if (!state || !state.longPressTimer) return;
    clearTimeout(state.longPressTimer);
    state.longPressTimer = 0;
  }

  function nearestSpaItem(nav, clientX) {
    const items = spaNavItems(nav);
    let nearest = null;
    let distance = Infinity;
    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const nextDistance = Math.abs(clientX - (rect.left + rect.width / 2));
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = item;
      }
    });
    return nearest;
  }

  function setDragPreview(nav, item) {
    nav.querySelectorAll('.liquidDragPreview').forEach((node) => node.classList.remove('liquidDragPreview'));
    if (item) item.classList.add('liquidDragPreview');
    const state = states.get(nav);
    if (state && state.drag) state.drag.previewItem = item || null;
  }

  function positionHoldLens(nav, item) {
    const state = states.get(nav);
    if (!state || !state.lens || !item) return;
    const navRect = nav.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (!navRect.width || !itemRect.width) return;
    const width = Math.min(62, Math.max(50, itemRect.width - 24));
    const center = itemRect.left - navRect.left + itemRect.width / 2;
    const x = Math.round((center - width / 2) * 10) / 10;
    state.lens.style.width = width + 'px';
    state.lens.style.transform = 'translate3d(' + x + 'px,0,0) scale3d(.94,.94,1)';
    state.lens.style.opacity = '.48';
  }

  function positionDragLens(nav, clientX) {
    const state = states.get(nav);
    if (!state || !state.drag || !state.drag.active || !state.lens) return;
    const rect = nav.getBoundingClientRect();
    const width = state.drag.lensWidth || 88;
    const half = width / 2;
    const center = Math.max(half + 5, Math.min(rect.width - half - 5, clientX - rect.left));
    const x = Math.round((center - half) * 10) / 10;
    state.lens.style.width = width + 'px';
    state.lens.style.transform = 'translate3d(' + x + 'px,0,0) scale3d(1,1,1)';
    state.lens.style.opacity = '1';
    setDragPreview(nav, nearestSpaItem(nav, clientX));
  }

  function startSpaLongPressDrag(nav, state) {
    const drag = state.drag;
    if (!drag || drag.active || !drag.startItem) return;
    drag.active = true;
    clearLongPressTimer(state);
    nav.classList.remove('liquidHoldArmed');
    nav.querySelectorAll('.liquidHoldOrigin').forEach((node) => node.classList.remove('liquidHoldOrigin'));
    releasePress(nav);
    nav.classList.add('liquidDragMode');
    nav.classList.remove('liquidNavCompact');
    const itemRect = drag.startItem.getBoundingClientRect();
    drag.lensWidth = Math.min(96, Math.max(68, itemRect.width + 8));
    try {
      if (nav.setPointerCapture && drag.pointerId != null) nav.setPointerCapture(drag.pointerId);
    } catch (_) {}
    if (window.getSelection) {
      const selection = window.getSelection();
      if (selection && typeof selection.removeAllRanges === 'function') selection.removeAllRanges();
    }
    positionDragLens(nav, drag.lastX);
    document.dispatchEvent(new CustomEvent('mobile-bottom-nav-dragstart', {
      detail:{ route:drag.startItem.dataset.mobileRoute || '' }
    }));
  }

  function resetSpaDrag(nav, state, { commit = false } = {}) {
    if (!state || !state.drag) return;
    const drag = state.drag;
    clearLongPressTimer(state);
    const wasActive = !!drag.active;
    const destination = drag.previewItem;
    const pointerId = drag.pointerId;

    nav.classList.remove('liquidDragMode','liquidHoldArmed');
    nav.querySelectorAll('.liquidDragPreview,.liquidHoldOrigin').forEach((node) => {
      node.classList.remove('liquidDragPreview','liquidHoldOrigin');
    });
    if (state.lens) {
      state.lens.style.opacity = '0';
      state.lens.style.removeProperty('width');
      state.lens.style.removeProperty('transform');
    }
    try {
      if (nav.releasePointerCapture && pointerId != null && nav.hasPointerCapture && nav.hasPointerCapture(pointerId)) {
        nav.releasePointerCapture(pointerId);
      }
    } catch (_) {}

    state.drag = null;
    releasePress(nav);

    if (!wasActive) return;
    state.suppressClickUntil = Date.now() + 420;
    if (!commit || !destination) return;

    const current = activeItem(nav);
    if (destination === current) return;

    state.commitDragClick = true;
    requestAnimationFrame(() => {
      if (!destination.isConnected) return;
      destination.click();
    });
  }

  function armSpaLongPress(nav, state, event, item) {
    clearLongPressTimer(state);
    state.drag = {
      active:false,
      pointerId:event.pointerId,
      startedAt:performance.now(),
      startX:event.clientX,
      startY:event.clientY,
      lastX:event.clientX,
      lastY:event.clientY,
      startItem:item,
      previewItem:item,
      lensWidth:0
    };
    nav.classList.add('liquidHoldArmed');
    item.classList.add('liquidHoldOrigin');
    positionHoldLens(nav, item);
    state.longPressTimer = setTimeout(() => startSpaLongPressDrag(nav, state), LONG_PRESS_MS);
  }

  function bindSpaLongPressDrag(nav, state) {
    const blockNativeLinkGesture = (event) => {
      if (!event.target.closest('[data-mobile-route]')) return;
      event.preventDefault();
    };

    nav.addEventListener('contextmenu', blockNativeLinkGesture);
    nav.addEventListener('dragstart', blockNativeLinkGesture);
    nav.addEventListener('selectstart', blockNativeLinkGesture);

    nav.addEventListener('click', (event) => {
      if (state.commitDragClick) {
        state.commitDragClick = false;
        return;
      }
      if (Date.now() < (state.suppressClickUntil || 0)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    nav.addEventListener('pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      const item = event.target.closest('[data-mobile-route]');
      if (!item || item.closest('#mobileBottomNav') !== nav) return;

      // Own the gesture immediately so iOS Safari cannot scroll the page or lift the link.
      event.preventDefault();
      try {
        if (nav.setPointerCapture && event.pointerId != null) nav.setPointerCapture(event.pointerId);
      } catch (_) {}
      armSpaLongPress(nav, state, event, item);
    }, { passive:false });

    nav.addEventListener('pointermove', (event) => {
      const drag = state.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;

      event.preventDefault();
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      if (!drag.active) {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        const elapsed = performance.now() - drag.startedAt;
        const horizontalIntent = Math.abs(dx) >= QUICK_SCRUB_X && Math.abs(dx) > Math.abs(dy) * 1.05;
        if (elapsed >= QUICK_SCRUB_MS && horizontalIntent) {
          startSpaLongPressDrag(nav, state);
          positionDragLens(nav, event.clientX);
        } else {
          positionHoldLens(nav, drag.startItem);
        }
        return;
      }

      positionDragLens(nav, event.clientX);
    }, { passive:false });

    nav.addEventListener('pointerup', (event) => {
      const drag = state.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();

      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (drag.active) {
        resetSpaDrag(nav, state, { commit:true });
        return;
      }

      const tapItem = drag.startItem;
      resetSpaDrag(nav, state, { commit:false });
      if (!tapItem || moved > TAP_SLOP) return;

      // Native click was intentionally cancelled on pointerdown; fire exactly one app click.
      state.commitDragClick = true;
      requestAnimationFrame(() => {
        if (tapItem.isConnected) tapItem.click();
      });
    }, { passive:false });

    nav.addEventListener('pointercancel', (event) => {
      const drag = state.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      resetSpaDrag(nav, state, { commit:false });
    }, { passive:true });
  }

  function bindNav(nav) {
    let state = states.get(nav);
    if (state && state.bound) {
      currentNav = nav;
      scheduleLens(nav, false);
      return nav;
    }

    state = state || {};
    state.bound = true;
    state.lens = ensureLens(nav);
    state.lensMetrics = null;
    state.longPressTimer = 0;
    state.suppressClickUntil = 0;
    state.commitDragClick = false;
    states.set(nav, state);
    currentNav = nav;
    state.scrollEdge = ensureScrollEdge();

    nav.addEventListener('pointermove', (event) => updateLight(nav, event), { passive:true });
    nav.addEventListener('pointerdown', (event) => {
      updateLight(nav, event);
      nav.classList.add('glassPressed');
      const item = event.target.closest('.liquidGlassNavItem,.mobileBottomNavBtn');
      if (item) item.classList.add('liquidPressed');
    }, { passive:true });
    ['pointerup','pointercancel'].forEach((type) => nav.addEventListener(type, () => releasePress(nav), { passive:true }));
    nav.addEventListener('pointerleave', () => {
      releasePress(nav);
      nav.style.removeProperty('--glass-light-x');
      nav.style.removeProperty('--glass-light-y');
    }, { passive:true });

    state.observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'attributes' || record.type === 'childList')) scheduleLens(nav, true);
    });
    state.observer.observe(nav, { subtree:true, childList:true, attributes:true, attributeFilter:['class','aria-current'] });

    if (typeof ResizeObserver === 'function') {
      state.resizeObserver = new ResizeObserver(() => scheduleLens(nav, false));
      state.resizeObserver.observe(nav);
    }
    if (nav.dataset.mobileNavKind === 'spa') bindSpaLongPressDrag(nav, state);
    scheduleLens(nav, false);
    document.dispatchEvent(new CustomEvent('mobile-bottom-nav-ready', { detail:{ kind:nav.dataset.mobileNavKind || 'reader' } }));
    return nav;
  }

  function enhance(nav) {
    if (!nav) return null;
    const reader = !!nav.querySelector('#mobileNavMore');
    nav.classList.add('liquidGlassNav');
    nav.dataset.mobileNavKind = reader ? 'reader' : (nav.dataset.mobileNavKind || 'spa');
    nav.querySelectorAll('a,button').forEach((item) => {
      if (item.closest('#mobileBottomNav') !== nav) return;
      item.classList.add('liquidGlassNavItem');
      const svg = item.querySelector('svg');
      if (svg) svg.classList.add('mobileNavGlyph');
      const label = item.querySelector('span');
      if (label) label.classList.add('liquidGlassNavLabel');
    });
    ensureLens(nav);
    return bindNav(nav);
  }

  function ensureSpaNav(host = document.getElementById('homeApp') || document.querySelector('.homeShell')) {
    if (!host) return null;
    let nav = document.getElementById('mobileBottomNav');
    if (nav && nav.querySelector('#mobileNavMore')) {
      nav.remove();
      nav = null;
      const utility = document.getElementById('mobileUtilityMenu');
      if (utility) utility.remove();
    }
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'mobileBottomNav';
      host.appendChild(nav);
    }
    if (nav.dataset.mobileNavKind !== 'spa' || !nav.querySelector('#mobileNavHome')) populateSpaNav(nav);
    return enhance(nav);
  }

  function syncActive(nav = document.getElementById('mobileBottomNav')) {
    if (!nav) return;
    enhance(nav);
    scheduleLens(nav, true);
  }

  function attachCurrent() {
    attachRaf = 0;
    const nav = document.getElementById('mobileBottomNav');
    if (nav) {
      enhance(nav);
      syncActive(nav);
      return;
    }
    const name = location.pathname.split('/').pop() || 'home.html';
    if (['home.html','profile.html','manga.html','video.html','video-player.html'].includes(name)) ensureSpaNav();
  }

  function scheduleAttach() {
    if (attachRaf) return;
    attachRaf = requestAnimationFrame(attachCurrent);
  }

  function scrollPosition(event) {
    const target = event && event.target;
    if (target && target !== document && target !== window && typeof target.scrollTop === 'number') return Math.max(0, target.scrollTop);
    return Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  }

  function handleScroll(event) {
    if (!currentNav || !currentNav.isConnected) return;
    const y = scrollPosition(event);
    const previous = lastScrollY;
    lastScrollY = y;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      if (!currentNav || !currentNav.isConnected) return;
      const movingDown = y > previous + 3;
      const movingUp = y < previous - 3;
      const state = states.get(currentNav);
      if (state && state.scrollEdge) state.scrollEdge.classList.toggle('liquidScrollActive', y > 14);
      if (movingDown && y > 72) currentNav.classList.add('liquidNavCompact');
      else if (movingUp || y < 28) currentNav.classList.remove('liquidNavCompact');
    });
  }

  document.addEventListener('home-profile-routechange', () => { scheduleAttach(); setTimeout(() => syncActive(), 0); });
  document.addEventListener('scroll', handleScroll, { passive:true, capture:true });
  window.addEventListener('popstate', scheduleAttach);
  window.addEventListener('hashchange', scheduleAttach);
  window.addEventListener('pageshow', scheduleAttach);
  window.addEventListener('resize', () => scheduleLens(currentNav, false), { passive:true });
  window.addEventListener('orientationchange', () => setTimeout(() => scheduleLens(currentNav, false), 120), { passive:true });

  const bodyObserver = new MutationObserver(() => {
    const nav = document.getElementById('mobileBottomNav');
    if (nav !== currentNav) scheduleAttach();
  });

  function boot() {
    if (document.body) {
      bodyObserver.observe(document.body, { childList:true, subtree:true });
      attachCurrent();
    }
  }

  window.MobileBottomNav = { ensureSpaNav, enhance, syncActive, refresh:scheduleAttach, SPA_ITEMS, ICONS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();