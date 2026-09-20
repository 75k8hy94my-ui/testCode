(function (root) {
  'use strict';

  root.MangaListRenderer = Object.freeze({
    render({ elements, items, createCard, list, reorderMode, empty, emptyText, page, totalPages }) {
      const {
        savedListItems, savedListEmpty, bookshelfPagination,
        bookshelfPrevBtn, bookshelfNextBtn, bookshelfPageLabel
      } = elements;
      const safeTotalPages = Math.max(1, totalPages);
      const safePage = Math.min(Math.max(1, page), safeTotalPages);
      bookshelfPagination.style.display = safeTotalPages > 1 ? 'flex' : 'none';
      bookshelfPrevBtn.disabled = safePage <= 1;
      bookshelfNextBtn.disabled = safePage >= safeTotalPages;
      bookshelfPageLabel.textContent = safePage + ' / ' + safeTotalPages;

      if (empty) {
        savedListEmpty.style.display = 'block';
        savedListEmpty.textContent = emptyText;
        return;
      }

      savedListEmpty.style.display = 'none';
      const fragment = document.createDocumentFragment();
      items.forEach((item) => {
        fragment.appendChild(createCard(item, list, reorderMode));
      });
      savedListItems.appendChild(fragment);
    }
  });
})(typeof self !== 'undefined' ? self : this);
