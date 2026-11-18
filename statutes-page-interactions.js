// iOS native selection menu suppression: preserve WebKit selection handles and
// Selection API for the definition editor; affect statute text only.
(() => {
  if (!document.documentElement.classList.contains('statutes-page')) return;
  document.addEventListener('contextmenu', (event) => {
    if (event.target instanceof Element &&
        event.target.closest('#routeContent .statuteSelectable')) {
      event.preventDefault();
    }
  }, { capture: true });
})();

/* Resize the two stacked panes on iPhone without affecting native selection. */
(() => {
  const root = document.documentElement;
  const host = document.getElementById('homeApp');
  const side = host?.querySelector('.statutesDefinitionSide');
  if (!host || !side || !root.classList.contains('statutes-page')) return;
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'statutesPhoneResize';
  grip.setAttribute('aria-label', '条文と定義の表示高さを調整');
  side.prepend(grip);
  const mobile = window.matchMedia('(max-width:620px)');
  const storageKey = 'statutes:phone-pane-ratio';
  let saved = .45;
  try {
    const n = Number(localStorage.getItem(storageKey));
    if (n >= .2 && n <= .8) saved = n;
  } catch (_) {}
  function setRatio(ratio) {
    saved = Math.max(.2, Math.min(.8, ratio));
    host.style.setProperty('--statutes-phone-top', (saved * 100).toFixed(2) + '%');
  }
  setRatio(saved);
  let dragging = false;
  grip.addEventListener('pointerdown', (event) => {
    if (!mobile.matches || !root.classList.contains('statutes-definition-open')) return;
    event.preventDefault();
    dragging = true;
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = host.getBoundingClientRect();
    const paddingTop = parseFloat(getComputedStyle(host).paddingTop) || 0;
    setRatio((event.clientY - rect.top - paddingTop) / Math.max(1, rect.height - paddingTop));
  });
  function finish() {
    if (!dragging) return;
    dragging = false;
    try { localStorage.setItem(storageKey, String(saved)); } catch (_) {}
  }
  grip.addEventListener('pointerup', finish);
  grip.addEventListener('pointercancel', finish);
  grip.addEventListener('lostpointercapture', finish);
})();

/* On the statutes route only, put the existing six-item app nav inside the
   action header so that its absolute position belongs to the same header band.
   Restore the normal DOM parent on desktop; other routes are unaffected. */
(() => {
  const root = document.documentElement;
  const header = document.getElementById('appGlobalHeader');
  const host = document.getElementById('homeApp');
  if (!root.classList.contains('statutes-page') || !header || !host) return;
  const mobile = window.matchMedia('(max-width:899px)');
  const mount = () => {
    const nav = document.getElementById('mobileBottomNav');
    if (!nav) return;
    const target = mobile.matches ? header : host;
    if (nav.parentElement !== target) target.appendChild(nav);
  };
  document.addEventListener('mobile-bottom-nav-ready', mount);
  mobile.addEventListener('change', mount);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once:true });
  } else mount();
})();

/* The mobile action bar can wrap (small phones, large type or a sync error).
   Measure its actual bottom edge instead of allowing it to cover article text. */
(() => {
  const root = document.documentElement;
  const header = document.getElementById('appGlobalHeader');
  if (!root.classList.contains('statutes-page') || !header) return;
  const mobile = window.matchMedia('(max-width:899px)');
  const measure = () => {
    if (!mobile.matches) {
      root.style.removeProperty('--statutes-mobile-content-top');
      return;
    }
    const bottom = Math.ceil(header.getBoundingClientRect().bottom + 12);
    root.style.setProperty('--statutes-mobile-content-top', bottom + 'px');
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(header);
  mobile.addEventListener('change', measure);
  window.addEventListener('resize', measure, { passive: true });
  measure();
})();
