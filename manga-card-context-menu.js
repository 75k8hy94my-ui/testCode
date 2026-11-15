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

    function onContextMenu(event) {
      if (event.pointerType === 'touch') return;
      const pointer = win.matchMedia?.('(hover: hover) and (pointer: fine)');
      if (pointer && !pointer.matches) return;
      const card = event.target?.closest?.('.book-card[data-manga-item-id]');
      if (!card || !mount.contains(card) || !canReadProtectedData()) return;
      const item = getItem(card.getAttribute('data-manga-item-id'));
      if (!item) return;
      event.preventDefault();
      selectedId = String(item.id);
      menu.hidden = false;
      const rect = menu.getBoundingClientRect();
      menu.style.left = Math.round(Math.max(8, Math.min(event.clientX, win.innerWidth - rect.width - 8))) + 'px';
      menu.style.top = Math.round(Math.max(8, Math.min(event.clientY, win.innerHeight - rect.height - 8))) + 'px';
      edit.focus({ preventScroll: true });
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

    mount.addEventListener('contextmenu', onContextMenu);
    menu.addEventListener('contextmenu', suppressNativeMenu);
    doc.addEventListener('pointerdown', onOutsidePointer);
    doc.addEventListener('keydown', onKeydown);
    doc.addEventListener('scroll', hide, true);
    win.addEventListener('resize', hide);

    return Object.freeze({
      destroy() {
        mount.removeEventListener('contextmenu', onContextMenu);
        menu.removeEventListener('contextmenu', suppressNativeMenu);
        doc.removeEventListener('pointerdown', onOutsidePointer);
        doc.removeEventListener('keydown', onKeydown);
        doc.removeEventListener('scroll', hide, true);
        win.removeEventListener('resize', hide);
        hide();
        menu.remove();
      }
    });
  }

  root.MangaCardContextMenu = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
