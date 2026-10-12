(() => {
  'use strict';
  if (typeof document === 'undefined') return;
  let overlay = null;
  let input = null;
  let activePage = '';
  function page() {
    const name = location.pathname.split('/').pop();
    return name === 'manga.html' ? 'manga' : name === 'video.html' ? 'video' : '';
  }
  function emit(query, target = activePage) {
    if (target) document.dispatchEvent(new CustomEvent('testcode-context-search-change', {
      detail: { page: target, query }
    }));
  }
  function close() {
    if (!overlay) return;
    const old = activePage;
    overlay.remove();
    overlay = null;
    input = null;
    activePage = '';
    emit('', old);
  }
  function open() {
    const target = page();
    if (!target) return;
    if (overlay) close();
    activePage = target;
    overlay = document.createElement('section');
    overlay.id = 'testcodeContextSearch';
    overlay.setAttribute('role', 'search');
    overlay.setAttribute('aria-label', target === 'manga' ? '漫画を検索' : '動画を検索');
    Object.assign(overlay.style, {
      position: 'fixed', zIndex: '2200', left: '50%', top: '76px',
      transform: 'translateX(-50%)', width: 'min(560px,calc(100vw - 24px))',
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '12px', borderRadius: '18px', background: '#1c2330',
      border: '1px solid #516075', boxShadow: '0 16px 48px #0008',
      color: '#f9fafb'
    });
    const label = document.createElement('label');
    label.textContent = target === 'manga' ? '漫画を検索' : '動画を検索';
    label.setAttribute('for', 'testcodeContextSearchInput');
    label.style.position = 'absolute';
    label.style.width = '1px';
    label.style.height = '1px';
    label.style.overflow = 'hidden';
    input = document.createElement('input');
    input.id = 'testcodeContextSearchInput';
    input.type = 'search';
    input.placeholder = '検索';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', label.textContent);
    Object.assign(input.style, {
      flex: '1', minWidth: '0', minHeight: '44px', padding: '10px 12px',
      borderRadius: '12px', border: '1px solid #58687a',
      background: '#101620', color: '#fff', fontSize: '16px'
    });
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = '閉じる';
    dismiss.setAttribute('aria-label', '検索を閉じる');
    Object.assign(dismiss.style, {
      minHeight: '44px', padding: '0 12px', borderRadius: '12px',
      border: '1px solid #58687a', background: '#354255',
      color: '#fff', cursor: 'pointer'
    });
    dismiss.addEventListener('click', close);
    input.addEventListener('input', () => emit(input.value));
    input.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    overlay.append(label, input, dismiss);
    document.body.appendChild(overlay);
    input.focus();
  }
  function toggle() {
    if (overlay && activePage === page()) close();
    else open();
  }
  document.addEventListener('home-profile-routechange', () => {
    if (overlay && activePage !== page()) close();
  });
  window.addEventListener('popstate', () => {
    if (overlay && activePage !== page()) close();
  });
  window.TestCodeContextSearch = Object.freeze({ open, close, toggle });
})();