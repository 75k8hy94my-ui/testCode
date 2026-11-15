(function (root) {
  'use strict';

  function create({ documentRef: doc, windowRef: win, mountElement: mount,
                    getItem, canReadProtectedData, onEdit, onSafeOpen }) {
    if (!doc || !win || !mount || [getItem, canReadProtectedData, onEdit, onSafeOpen].some(fn => typeof fn !== 'function')) {
      throw new TypeError('MangaCardContextMenu requires a shelf and action callbacks');
    }
    const menu = doc.createElement('div');
    menu.className = 'manga-card-context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '漫画の操作');
    menu.hidden = true;
    let selectedId = '';

    function hide() {
      selectedId = '';
      menu.hidden = true;
    }
    function makeAction(label, callback) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = label;
      button.addEventListener('click', () => {
        const id = selectedId;
        hide();
        if (!id || !canReadProtectedData()) return;
        const item = getItem(id);
        if (item) callback(item);
      });
      menu.appendChild(button);
      return button;
    }
    const edit = makeAction('編集', onEdit);
    const safe = makeAction('セーフモードで開く', onSafeOpen);
    doc.body.appendChild(menu);

    const isCoarse = () => !!win.matchMedia && !win.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let touchTimer = null;
    let touchStart = null;
    let suppressClickId = '';
    let suppressClickUntil = 0;
    const cancelTimer = () => {
      if (touchTimer != null) (win.clearTimeout || clearTimeout)(touchTimer);
      touchTimer = null;
    };
    function findCard(target, coverOnly = false) {
      if (coverOnly) {
        const cover = target?.closest?.('.book-cover');
        if (!cover || target?.closest?.('button,input,a,select,textarea')) return null;
        target = cover;
      }
      const card = target?.closest?.('.book-card[data-manga-item-id]');
      return card && mount.contains(card) ? card : null;
    }
    function showForCard(card, mode, x = 0, y = 0) {
      if (!card || !canReadProtectedData()) return false;
      const item = getItem(card.getAttribute('data-manga-item-id'));
      if (!item) return false;
      selectedId = String(item.id);
      menu.setAttribute('data-mode', mode);
      menu.hidden = false;
      if (mode === 'sheet') {
        menu.style.left = '0px';
        menu.style.right = '0px';
        menu.style.top = 'auto';
        menu.style.bottom = '0px';
      } else {
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
        const rect = menu.getBoundingClientRect();
        menu.style.left = Math.round(Math.max(8, Math.min(x, win.innerWidth - rect.width - 8))) + 'px';
        menu.style.top = Math.round(Math.max(8, Math.min(y, win.innerHeight - rect.height - 8))) + 'px';
      }
      edit.focus({ preventScroll: true });
      return true;
    }
    function onContextMenu(event) {
      const coarse = event.pointerType === 'touch' || isCoarse();
      const card = findCard(event.target, coarse);
      if (!card) return;
      if (!canReadProtectedData()) return;
      event.preventDefault();
      cancelTimer();
      if (coarse) {
        suppressClickId = card.getAttribute('data-manga-item-id');
        suppressClickUntil = Date.now() + 1300;
        touchStart = { card, activated:true };
      } else touchStart = null;
      showForCard(card, coarse ? 'sheet' : 'desktop', event.clientX, event.clientY);
    }
    function onTouchStart(event) {
      if (!isCoarse() || event.touches?.length !== 1 || !canReadProtectedData()) return;
      const card = findCard(event.target, true);
      if (!card) return;
      cancelTimer();
      const touch = event.touches[0];
      touchStart = { card, x: touch.clientX, y: touch.clientY, activated:false };
      touchTimer = (win.setTimeout || setTimeout)(() => {
        touchTimer = null;
        const pending = touchStart;
        if (!pending || pending.card !== card || !canReadProtectedData()) return;
        if (showForCard(card, 'sheet')) {
          pending.activated = true;
          suppressClickId = card.getAttribute('data-manga-item-id');
          suppressClickUntil = Date.now() + 1300;
          win.navigator?.vibrate?.(12);
        }
      }, 520);
    }
    function onTouchMove(event) {
      if (!touchStart || touchStart.activated) return;
      if (event.touches?.length !== 1) { cancelTimer(); touchStart = null; return; }
      const point = event.touches[0];
      if (Math.hypot(point.clientX - touchStart.x, point.clientY - touchStart.y) > 12) {
        cancelTimer(); touchStart = null;
      }
    }
    function onTouchEnd(event) {
      cancelTimer();
      if (touchStart?.activated) event.preventDefault();
      touchStart = null;
    }
    function onCoverClickCapture(event) {
      if (!suppressClickId || Date.now() > suppressClickUntil) { suppressClickId = ''; return; }
      const card = findCard(event.target);
      if (card?.getAttribute('data-manga-item-id') === suppressClickId) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        suppressClickId = '';
      }
    }
    function onOutsidePointer(event) {
      if (!menu.hidden && !menu.contains(event.target)) hide();
    }
    function onKeydown(event) {
      if (menu.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        hide();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        (doc.activeElement === edit ? safe : edit).focus();
      }
    }
    function suppressNativeMenu(event) { event.preventDefault(); }
    function onScroll() {
      if (!touchStart?.activated) { cancelTimer(); touchStart = null; }
      if (menu.getAttribute('data-mode') !== 'sheet') hide();
    }
    function onResize() { cancelTimer(); touchStart = null; hide(); }

    mount.addEventListener('contextmenu', onContextMenu);
    mount.addEventListener('touchstart', onTouchStart, { passive:true });
    mount.addEventListener('touchmove', onTouchMove, { passive:true });
    mount.addEventListener('touchend', onTouchEnd, { passive:false });
    mount.addEventListener('touchcancel', onTouchEnd);
    mount.addEventListener('click', onCoverClickCapture, true);
    menu.addEventListener('contextmenu', suppressNativeMenu);
    doc.addEventListener('pointerdown', onOutsidePointer);
    doc.addEventListener('keydown', onKeydown);
    doc.addEventListener('scroll', onScroll, true);
    win.addEventListener('resize', onResize);

    return Object.freeze({
      destroy() {
        cancelTimer();
        mount.removeEventListener('contextmenu', onContextMenu);
        mount.removeEventListener('touchstart', onTouchStart);
        mount.removeEventListener('touchmove', onTouchMove);
        mount.removeEventListener('touchend', onTouchEnd);
        mount.removeEventListener('touchcancel', onTouchEnd);
        mount.removeEventListener('click', onCoverClickCapture, true);
        menu.removeEventListener('contextmenu', suppressNativeMenu);
        doc.removeEventListener('pointerdown', onOutsidePointer);
        doc.removeEventListener('keydown', onKeydown);
        doc.removeEventListener('scroll', onScroll, true);
        win.removeEventListener('resize', onResize);
        hide();
        menu.remove();
      }
    });
  }

  root.MangaCardContextMenu = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
