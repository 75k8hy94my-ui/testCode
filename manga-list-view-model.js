(function (root) {
  'use strict';

  root.MangaListViewModel = Object.freeze({
    derive(input) {
      const {
        items, folders, authorCards, videos, folderView, seriesView, authorView, filters,
        searchQuery, sort, reorderMode, groupByAuthor, bulkEditMode, page, pageSize,
        ids, searchText, title, unreadItems
      } = input;
      const inSeriesGroup = folderView === ids.series && !!seriesView;
      const inSeriesRoot = folderView === ids.series && !seriesView;
      const inAuthorView = !!authorView;
      const atRoot = !folderView && !inAuthorView;
      const isRealFolder = !!folderView && folderView !== ids.favorites && folderView !== ids.unread &&
        folderView !== ids.synced && folderView !== ids.history && folderView !== ids.series;
      const canOrganize = atRoot || isRealFolder;
      const visibleShelfItems = items.slice();
      let itemsList = [];
      let folderCards = [];
      let seriesGroupCards = [];
      let authorGroupCards = [];
      let showFavoritesCard = false;
      let showSeriesCard = false;

      if (inAuthorView) {
        const authorCard = authorCards.find((card) => card.name === authorView || card.circleName === authorView);
        const names = authorCard ? [authorCard.name, authorCard.circleName].filter(Boolean) : [authorView];
        itemsList = visibleShelfItems.filter((it) => names.includes(String(it.author || '').trim()));
      } else if (!folderView) {
        itemsList = visibleShelfItems.filter((it) => !it.folderId && !it.series);
        folderCards = folders.filter((folder) => folder.id !== ids.history && !String(folder.id || '').startsWith('local-'));
        showFavoritesCard = true;
        showSeriesCard = true;
      } else if (folderView === ids.favorites) {
        itemsList = visibleShelfItems.filter((it) => it.favorite);
      } else if (folderView === ids.unread) {
        itemsList = unreadItems.filter((item) => visibleShelfItems.includes(item));
      } else if (folderView === ids.synced) {
        itemsList = visibleShelfItems.filter((it) => it.localSync);
      } else if (inSeriesRoot) {
        const groups = new Map();
        visibleShelfItems.forEach((it) => {
          if (!it.series) return;
          if (!groups.has(it.series)) groups.set(it.series, []);
          groups.get(it.series).push(it);
        });
        seriesGroupCards = Array.from(groups.entries())
          .map(([name, groupItems]) => ({ name, items: groupItems.slice().sort((a, b) => (a.volume || 0) - (b.volume || 0)) }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      } else if (inSeriesGroup) {
        itemsList = visibleShelfItems.filter((it) => it.series === seriesView)
          .sort((a, b) => (a.volume || 0) - (b.volume || 0));
      } else {
        itemsList = visibleShelfItems.filter((it) => it.folderId === folderView);
      }

      const normalizedFilter = (value) => String(value || '').trim().toLocaleLowerCase('ja');
      itemsList = itemsList.filter((item) => {
        const tags = Array.isArray(item.tags) ? item.tags.join(' ') : '';
        const haystack = searchText(item, folders, videos, authorCards);
        return (!filters.series || normalizedFilter(item.series).includes(normalizedFilter(filters.series))) &&
          (!filters.author || normalizedFilter(item.author).includes(normalizedFilter(filters.author))) &&
          (!filters.tags || normalizedFilter(tags).includes(normalizedFilter(filters.tags))) &&
          (!filters.source || normalizedFilter(item.sourceWork).includes(normalizedFilter(filters.source))) &&
          (!searchQuery || normalizedFilter(haystack).includes(normalizedFilter(searchQuery)));
      });
      if (!reorderMode) {
        if (sort === 'title-asc') {
          itemsList.sort((a, b) => title(a).localeCompare(title(b), 'ja'));
        } else if (sort === 'synced-first') {
          itemsList.sort((a, b) => Number(!!b.localSync) - Number(!!a.localSync) || (Number(b.addedAt) || 0) - (Number(a.addedAt) || 0));
        } else {
          itemsList.sort((a, b) => (Number(b.addedAt) || 0) - (Number(a.addedAt) || 0));
        }
      }
      if (groupByAuthor && !bulkEditMode && !inAuthorView && !inSeriesRoot) {
        const groups = new Map();
        itemsList.forEach((item) => {
          const name = String(item.author || '').trim();
          if (name) { if (!groups.has(name)) groups.set(name, []); groups.get(name).push(item); }
        });
        authorGroupCards = Array.from(groups.entries()).map(([name, groupItems]) => ({ name, items: groupItems }));
      }
      // Paginate the cards that are actually rendered. Previous versions
      // counted folders and loose works, but omitted the pinned virtual
      // folders and series groups while rendering them on every page.
      const ungroupedItems = itemsList.filter((item) => !String(item.author || '').trim());
      const fixedEntries = [
        ...(showFavoritesCard ? [{ type: 'favorites' }] : []),
        ...(showSeriesCard ? [{ type: 'series' }] : []),
        ...folderCards.map((folder) => ({ type: 'folder', folder })),
        ...seriesGroupCards.map((group) => ({ type: 'series-group', group })),
      ];
      const contentEntries = groupByAuthor && !bulkEditMode && !inAuthorView && !inSeriesRoot
        ? [
          ...authorGroupCards.map((group) => ({ type: 'author-group', group })),
          ...ungroupedItems.map((item) => ({ type: 'item', item })),
        ]
        : itemsList.map((item) => ({ type: 'item', item }));
      const pagedEntries = fixedEntries.concat(contentEntries);
      const perPage = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 25;
      const requestedPage = Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 1;
      const totalPages = Math.max(1, Math.ceil(pagedEntries.length / perPage));
      const normalizedPage = Math.min(Math.max(1, requestedPage), totalPages);
      const pageStart = (normalizedPage - 1) * perPage;
      const visibleEntries = pagedEntries.slice(pageStart, pageStart + perPage);
      return {
        atRoot, inSeriesGroup, inSeriesRoot, inAuthorView, canOrganize,
        itemsList, folderCards, seriesGroupCards, authorGroupCards,
        showFavoritesCard, showSeriesCard, visibleEntries,
        visibleFolderEntries: visibleEntries.filter((entry) => entry.type === 'folder'),
        visibleSeriesGroups: visibleEntries.filter((entry) => entry.type === 'series-group').map((entry) => entry.group),
        visibleAuthorGroups: visibleEntries.filter((entry) => entry.type === 'author-group').map((entry) => entry.group),
        visibleItems: visibleEntries.filter((entry) => entry.type === 'item').map((entry) => entry.item),
        totalPages, normalizedPage, totalEntries: pagedEntries.length
      };

    }
  });
})(typeof self !== 'undefined' ? self : this);
