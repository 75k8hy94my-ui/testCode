(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object' || typeof deps.onPageChange !== 'function') {
      throw new TypeError('MangaListPaginationEventsFactory requires function: onPageChange');
    }

    let bound = false;
    let cleaned = false;

    function bind(elements) {
      if (bound || cleaned) {
        throw new TypeError('MangaListPaginationEventsFactory bind instance is already used');
      }
      if (!elements || typeof elements !== 'object') {
        throw new TypeError('MangaListPaginationEventsFactory requires button elements');
      }
      const { prevButton, nextButton } = elements;
      if (!prevButton || typeof prevButton.addEventListener !== 'function' || typeof prevButton.removeEventListener !== 'function') {
        throw new TypeError('MangaListPaginationEventsFactory requires prevButton event methods');
      }
      if (!nextButton || typeof nextButton.addEventListener !== 'function' || typeof nextButton.removeEventListener !== 'function') {
        throw new TypeError('MangaListPaginationEventsFactory requires nextButton event methods');
      }

      function handlePreviousPage() {
        deps.onPageChange(-1);
      }

      function handleNextPage() {
        deps.onPageChange(1);
      }

      prevButton.addEventListener('click', handlePreviousPage);
      nextButton.addEventListener('click', handleNextPage);

      // Touch events are scoped to the shelf grid, never the Reader or the
      // whole document. Keep normal vertical scrolling and card taps intact.
      const swipeSurface = elements.swipeSurface;
      let gesture = null;
      const interactiveTarget = (target) => {
        const node = target?.nodeType === 3 ? target.parentElement : target;
        return typeof node?.closest === 'function' && !!node.closest(
          'button, a, input, textarea, select, label, [contenteditable], [data-no-page-swipe]'
        );
      };
      const onTouchStart = (event) => {
        gesture = null;
        if (event.touches?.length !== 1 || interactiveTarget(event.target)) return;
        const point = event.touches[0];
        if (!Number.isFinite(point?.clientX) || !Number.isFinite(point?.clientY)) return;
        const rect = typeof swipeSurface.getBoundingClientRect === 'function'
          ? swipeSurface.getBoundingClientRect() : null;
        // Preserve browser history gestures at the sides of the viewport.
        if (rect && (point.clientX < rect.left + 18 || point.clientX > rect.right - 18)) return;
        gesture = { identifier: point.identifier, x: point.clientX, y: point.clientY };
      };
      const onTouchMove = (event) => {
        if (!gesture) return;
        if (event.touches?.length !== 1 || event.touches[0]?.identifier !== gesture.identifier) {
          gesture = null;
          return;
        }
        const point = event.touches[0];
        const dx = point.clientX - gesture.x;
        const dy = point.clientY - gesture.y;
        // Once the user begins scrolling vertically, never reinterpret the
        // rest of that gesture as a page turn.
        if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) gesture = null;
      };
      const onTouchEnd = (event) => {
        const started = gesture;
        gesture = null;
        if (!started || event.changedTouches?.length !== 1) return;
        const point = event.changedTouches[0];
        if (point?.identifier !== started.identifier) return;
        const dx = point.clientX - started.x;
        const dy = point.clientY - started.y;
        if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
        // Cancel the synthetic click following a recognized swipe, including
        // a swipe at the first/last page that cannot change the current page.
        if (event.cancelable) event.preventDefault();
        const targetButton = dx < 0 ? nextButton : prevButton;
        if (!targetButton.disabled) deps.onPageChange(dx < 0 ? 1 : -1);
      };
      const onTouchCancel = () => { gesture = null; };
      if (swipeSurface) {
        if (typeof swipeSurface.addEventListener !== 'function' || typeof swipeSurface.removeEventListener !== 'function') {
          throw new TypeError('MangaListPaginationEventsFactory requires swipeSurface event methods');
        }
        swipeSurface.addEventListener('touchstart', onTouchStart, { passive: true });
        swipeSurface.addEventListener('touchmove', onTouchMove, { passive: true });
        swipeSurface.addEventListener('touchend', onTouchEnd, { passive: false });
        swipeSurface.addEventListener('touchcancel', onTouchCancel);
      }
      bound = true;

      return function cleanup() {
        if (cleaned) return;
        prevButton.removeEventListener('click', handlePreviousPage);
        nextButton.removeEventListener('click', handleNextPage);
        if (swipeSurface) {
          swipeSurface.removeEventListener('touchstart', onTouchStart);
          swipeSurface.removeEventListener('touchmove', onTouchMove);
          swipeSurface.removeEventListener('touchend', onTouchEnd);
          swipeSurface.removeEventListener('touchcancel', onTouchCancel);
        }
        gesture = null;
        cleaned = true;
      };
    }

    return Object.freeze({ bind });
  }

  root.MangaListPaginationEventsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
