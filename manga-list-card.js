(function (root) {
  'use strict';

  root.MangaListCardBoundary = Object.freeze({
    createStaticCard({ documentRef, item, reorderMode, bulkEditMode, bulkSelected, recentlyClosed, itemSubtext, itemDisplayTitle, readingRecordText, itemPageCountText }) {
      const card = documentRef.createElement('div');
      card.className = 'book-card' + (reorderMode ? ' reorder-card' : '') + (item.id === recentlyClosed ? ' just-closed' : '');
      card.title = itemSubtext(item);

      let select = null;
      if (bulkEditMode) {
        select = documentRef.createElement('input');
        select.type = 'checkbox'; select.className = 'bulk-select'; select.checked = bulkSelected.has(item.id);
        select.title = '一括編集の対象にする';
        card.appendChild(select);
      }

      const cover = documentRef.createElement('div');
      cover.className = 'book-cover';
      const img = documentRef.createElement('img');
      img.alt = itemDisplayTitle(item);
      img.loading = 'eager';
      img.decoding = 'async';
      img.fetchPriority = 'low';
      cover.appendChild(img);
      card.appendChild(cover);

      const appendDetails = () => {
        const title = documentRef.createElement('div');
        title.className = 'book-title';
        title.textContent = itemDisplayTitle(item);
        card.appendChild(title);
        if (item.series) {
          const seriesEl = documentRef.createElement('div');
          seriesEl.className = 'book-series';
          seriesEl.textContent = 'シリーズ';
          card.appendChild(seriesEl);
        }
        if (item.author) {
          const authorEl = documentRef.createElement('div');
          authorEl.className = 'book-author';
          authorEl.textContent = item.author;
          authorEl.title = item.author;
          card.appendChild(authorEl);
        }
        if (item.isDoujin && item.sourceWork) {
          const sourceWorkEl = documentRef.createElement('div');
          sourceWorkEl.className = 'book-author';
          sourceWorkEl.textContent = '同人誌 ・ ' + item.sourceWork;
          sourceWorkEl.title = '元ネタの作品名: ' + item.sourceWork;
          card.appendChild(sourceWorkEl);
        }
        const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
        if (tags.length) {
          const tagsEl = documentRef.createElement('div');
          tagsEl.className = 'book-tags';
          tagsEl.title = tags.join(', ');
          tags.slice(0, 3).forEach((tag) => {
            const tagEl = documentRef.createElement('span');
            tagEl.className = 'book-tag';
            tagEl.textContent = tag;
            tagsEl.appendChild(tagEl);
          });
          if (tags.length > 3) {
            const moreEl = documentRef.createElement('span');
            moreEl.className = 'book-tag';
            moreEl.textContent = '+' + (tags.length - 3);
            tagsEl.appendChild(moreEl);
          }
          card.appendChild(tagsEl);
        }
        const readingEl = documentRef.createElement('div');
        readingEl.className = 'book-reading' + (item.lastReadAt ? '' : ' unread');
        readingEl.textContent = readingRecordText(item) + ' ・ ' + itemPageCountText(item);
        readingEl.title = item.lastReadAt
          ? '最終読書: ' + new Date(Number(item.lastReadAt)).toLocaleString('ja-JP') + ' / ' + (Number(item.readCount) || 1) + '回'
          : 'まだ読んでいません';
        card.appendChild(readingEl);
        if (item.lastReadAt) readingEl.remove();
        else readingEl.textContent = '未読';
      };

      return { card, select, cover, img, appendDetails };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
