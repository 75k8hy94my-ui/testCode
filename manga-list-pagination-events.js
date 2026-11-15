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
        if (typeof deps.allowSwipeTarget === 'function' && deps.allowSwipeTarget(node)) return false;
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
        gesture = { identifier: point.identifier, x: point.clientX, y: point.clientY, axis: null };
      };
      const onTouchMove = (event) => {
        if (!gesture) return;
        if (event.touches?.length !== 1 || event.touches[0]?.identifier !== gesture.identifier) {
          if (gesture.axis === 'horizontal') deps.onSwipeFinish?.(0);
          gesture = null;
          return;
        }
        const point = event.touches[0];
        const dx = point.clientX - gesture.x;
        const dy = point.clientY - gesture.y;
        // Lock the direction once, so vertical page scrolling cannot turn
        // into a horizontal page swipe partway through the gesture.
        if (!gesture.axis && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          gesture = null;
          return;
        }
        if (!gesture.axis && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.25) {
          gesture.axis = 'horizontal';
        }
        if (gesture.axis === 'horizontal' && typeof deps.onSwipeMove === 'function') {
          if (event.cancelable) event.preventDefault();
          deps.onSwipeMove(dx);
        }
      };
      const onTouchEnd = (event) => {
        const started = gesture;
        gesture = null;
        if (!started) return;
        if (event.changedTouches?.length !== 1 ||
            event.changedTouches[0]?.identifier !== started.identifier) {
          if (started.axis === 'horizontal') deps.onSwipeFinish?.(0);
          return;
        }
        const point = event.changedTouches[0];
        const dx = point.clientX - started.x;
        const dy = point.clientY - started.y;
        const recognized = Math.abs(dx) >= 70 && Math.abs(dy) <= Math.abs(dx) * 0.6;
        const horizontal = started.axis === 'horizontal';
        if (horizontal && event.cancelable) event.preventDefault();
        if (horizontal && typeof deps.onSwipeMove === 'function') deps.onSwipeMove(dx);
        // The real neighbour may already be following the finger. Snap it
        // back for a short drag, or snap forward then commit the new page.
        const direction = recognized ? (dx < 0 ? 1 : -1) : 0;
        const handled = horizontal && typeof deps.onSwipeFinish === 'function'
          ? deps.onSwipeFinish(direction) : false;
        if (!recognized) return;
        if (event.cancelable) event.preventDefault();
        const targetButton = dx < 0 ? nextButton : prevButton;
        if (!handled && !targetButton.disabled) deps.onPageChange(direction);
      };
      const onTouchCancel = () => {
        if (gesture?.axis === 'horizontal') deps.onSwipeFinish?.(0);
        gesture = null;
      };
      if (swipeSurface) {
        if (typeof swipeSurface.addEventListener !== 'function' || typeof swipeSurface.removeEventListener !== 'function') {
          throw new TypeError('MangaListPaginationEventsFactory requires swipeSurface event methods');
        }
        swipeSurface.addEventListener('touchstart', onTouchStart, { passive: true });
        swipeSurface.addEventListener('touchmove', onTouchMove, { passive: typeof deps.onSwipeMove !== 'function' });
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
        if (gesture?.axis === 'horizontal') deps.onSwipeFinish?.(0);
        gesture = null;
        cleaned = true;
      };
    }

    return Object.freeze({ bind });
  }

  root.MangaListPaginationEventsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
