(function (root) {
  'use strict';

  const REQUIRED = [
    'getState', 'setState', 'getElements', 'getDocument', 'getConfig',
    'getSavedVideos', 'clearLocalCoverObjectUrls', 'confirmAction', 'setTimeout',
    'persistAll', 'renderDashboard', 'renderAuthorDashboard', 'updateBulkEditButton',
    'getVisibleItems', 'appendFolderPreview', 'createStaticCard', 'loadLocalCover',
    'getCoverSourceCache', 'setupFeedImage', 'makeHeartIcon', 'moveItemInList',
    'moveFolderInList', 'renderList', 'buildFavoritesFolderCard',
    'buildSeriesFolderCard', 'buildSeriesGroupCard', 'buildAuthorGroupCard',
    'buildSearchText',
    'deriveViewModel', 'renderCards', 'createDocumentFragment', 'openReader'
  ];

  function create(context) {
    if (!context || typeof context !== 'object') {
      throw new TypeError('MangaListRuntimeFactory requires context object');
    }
    for (const name of REQUIRED) {
      if (typeof context[name] !== 'function') {
        throw new TypeError('MangaListRuntimeFactory requires function: ' + name);
      }
    }

    let activePage = null;
    let activeAnimation = null;

    function slideBetweenPages(doc, frame, outgoing, incoming, direction) {
      const view = doc.defaultView;
      if (!outgoing || !direction || typeof view?.matchMedia !== 'function' ||
        !view.matchMedia('(max-width: 899px)').matches ||
        view.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const track = doc.createElement('div');
      track.className = 'bookshelf-slide-track';
      if (direction > 0) track.append(outgoing, incoming);
      else track.append(incoming, outgoing);
      frame.replaceChildren(track);

      // Both panels stay in the track until the slide finishes, so covers
      // actually travel sideways instead of disappearing and reappearing.
      if (typeof track.animate !== 'function') {
        frame.replaceChildren(incoming);
        return;
      }
      const start = direction > 0 ? 'translateX(0%)' : 'translateX(-50%)';
      const end = direction > 0 ? 'translateX(-50%)' : 'translateX(0%)';
      const animation = track.animate([{ transform: start }, { transform: end }], {
        duration: 300,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards'
      });
      activeAnimation = animation;
      const finish = () => {
        if (activeAnimation !== animation) return;
        activeAnimation = null;
        // Restore a single page as soon as the transition ends. Avoid
        // keeping off-screen cards and their thumbnails mounted indefinitely.
        frame.replaceChildren(incoming);
        animation.cancel();
      };
      animation.finished.then(finish, finish);
    }

    function handleMangaCardOpen(item, list) {
      return context.openReader(item, list);
    }

    function buildFolderCard(folder, folderList, organizeMode) {
      const doc = context.getDocument();
      const config = context.getConfig();
      const state = context.getState();
      const card = doc.createElement('div');
      card.className = 'book-card folder-card' + (folder.id === state.recentlyClosedFolderId ? ' just-closed' : '');
      const folderItems = context.getVisibleItems().filter((item) => item.folderId === folder.id);

      const cover = doc.createElement('div');
      cover.className = 'book-cover folder-cover';
      context.appendFolderPreview(cover, folderItems, config.ICON_FOLDER, '空のフォルダ', 'フォルダ');

      // フォルダの削除・並び替えは常時出さず、本棚の編集モードだけで行う。
      if (organizeMode && folder.id !== config.HISTORY_FOLDER_ID) {
        const delBtn = doc.createElement('button');
        delBtn.className = 'book-delBtn';
        delBtn.textContent = '×';
        delBtn.title = '削除';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (folderItems.length && !context.confirmAction('「' + folder.name + '」フォルダと、その中のURLをすべて削除します。本当によろしいですか？')) return;
          const current = context.getState();
          context.setState({
            savedItems: current.savedItems.filter((it) => it.folderId !== folder.id),
            savedFolders: current.savedFolders.filter((f) => f.id !== folder.id)
          });
          context.persistAll();
          context.renderList();
        });
        cover.appendChild(delBtn);

        const idx = folderList.indexOf(folder);
        const upBtn = doc.createElement('button');
        upBtn.className = 'book-moveBtn book-moveUpBtn';
        upBtn.textContent = '←';
        upBtn.title = '左へ移動';
        upBtn.disabled = idx <= 0;
        upBtn.addEventListener('click', (e) => { e.stopPropagation(); context.moveFolderInList(folder, folderList, -1); });
        cover.appendChild(upBtn);

        const downBtn = doc.createElement('button');
        downBtn.className = 'book-moveBtn book-moveDownBtn';
        downBtn.textContent = '→';
        downBtn.title = '右へ移動';
        downBtn.disabled = idx >= folderList.length - 1;
        downBtn.addEventListener('click', (e) => { e.stopPropagation(); context.moveFolderInList(folder, folderList, 1); });
        cover.appendChild(downBtn);
      }

      const title = doc.createElement('div');
      title.className = 'book-title';
      title.textContent = folder.name;

      card.appendChild(cover);
      card.appendChild(title);
      if (!organizeMode) card.addEventListener('click', () => {
        context.setState({ recentlyClosedFolderId: null });
        if (folderItems.length === 1) {
          // 1冊だけのフォルダは直接開くが、閉じた際の戻り先はこのフォルダにする。
          context.setState({ currentFolderView: folder.id, currentSeriesView: null, reorderMode: false });
          context.openReader(folderItems[0], folderItems);
          return;
        }
        context.setState({ currentFolderView: folder.id, currentSeriesView: null, reorderMode: false });
        context.renderList();
      });
      return card;
    }

    function buildBookCard(item, list, reorderMode) {
      const doc = context.getDocument();
      const elements = context.getElements();
      const state = context.getState();
      const { card, select, cover, img, appendDetails } = context.createStaticCard({
        documentRef: doc,
        item,
        reorderMode,
        bulkEditMode: state.bulkEditMode,
        bulkSelected: state.bulkSelectedIds,
        recentlyClosed: state.recentlyClosedItemId,
        itemSubtext: context.itemSubtext,
        itemDisplayTitle: context.itemDisplayTitle,
        readingRecordText: context.readingRecordText,
        itemPageCountText: context.itemPageCountText
      });
      if (select) {
        select.addEventListener('click', (e) => e.stopPropagation());
        select.addEventListener('change', () => {
          if (select.checked) state.bulkSelectedIds.add(item.id); else state.bulkSelectedIds.delete(item.id);
          context.updateBulkEditButton();
        });
      }

      const requiresLocalCover = Boolean(item.encryptedAssets?.pages?.length || item.localSync);
      const originalPage = item.pageManifest?.version === 1 && item.pageManifest.pages?.[0]
        || item.pages?.[0] || '';
      const loadCover = () => {
        if (img.dataset) img.dataset.coverState = 'loading';
        if (requiresLocalCover) {
          void context.loadLocalCover(item, img);
        } else {
          context.setupFeedImage(img, item.url, item.numberWidth, item.pagePattern, item.id, originalPage);
        }
      };
      if (requiresLocalCover) {
        img.addEventListener('load', () => { if (img.dataset) img.dataset.coverState = 'loaded'; });
        img.addEventListener('error', () => { if (img.dataset) img.dataset.coverState = 'failed'; });
      }
      const loadingLabel = doc.createElement('span');
      loadingLabel.className = 'book-cover-loading';
      loadingLabel.textContent = '読み込み中…';
      cover.appendChild(loadingLabel);
      const retryButton = doc.createElement('button');
      retryButton.className = 'book-cover-retry';
      retryButton.type = 'button';
      retryButton.textContent = '画像を再読み込み';
      retryButton.addEventListener('click', (event) => {
        event.stopPropagation();
        loadCover();
      });
      cover.appendChild(retryButton);
      loadCover();
      if (reorderMode) {
        const idx = list.indexOf(item);
        const upBtn = doc.createElement('button');
        upBtn.className = 'book-moveBtn book-moveUpBtn';
        upBtn.textContent = '←';
        upBtn.title = '左へ移動';
        upBtn.disabled = idx <= 0;
        upBtn.addEventListener('click', (e) => { e.stopPropagation(); context.moveItemInList(item, list, -1); });
        cover.appendChild(upBtn);

        const downBtn = doc.createElement('button');
        downBtn.className = 'book-moveBtn book-moveDownBtn';
        downBtn.textContent = '→';
        downBtn.title = '右へ移動';
        downBtn.disabled = idx >= list.length - 1;
        downBtn.addEventListener('click', (e) => { e.stopPropagation(); context.moveItemInList(item, list, 1); });
        cover.appendChild(downBtn);
      } else {
        const favBtn = doc.createElement('button');
        favBtn.className = 'book-favBtn';
        const updateFavoriteButton = () => {
          favBtn.replaceChildren(context.makeHeartIcon(!!item.favorite));
          favBtn.classList.toggle('is-favorite', !!item.favorite);
          favBtn.title = item.favorite ? 'お気に入りから外す' : 'お気に入りに追加';
          favBtn.setAttribute('aria-label', favBtn.title);
          favBtn.setAttribute('aria-pressed', item.favorite ? 'true' : 'false');
        };
        updateFavoriteButton();
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          item.favorite = !item.favorite;
          context.persistAll();
          updateFavoriteButton();
          if (context.getState().currentFolderView === context.getConfig().FAVORITES_FOLDER_ID && !item.favorite) {
            // Recompute the list rather than detaching only this card.
            // The shelf now contains a frame and pager even when no works
            // remain, so checking root children never detects emptiness.
            context.renderList();
          }
        });
        cover.appendChild(favBtn);
      }

      appendDetails();
      if (!reorderMode && !state.bulkEditMode) {
        card.addEventListener('click', () => context.openReader(item, list));
      }
      return card;
    }

    function renderSavedList(direction = 0) {
      const doc = context.getDocument();
      const elements = context.getElements();
      const state = context.getState();
      const config = context.getConfig();
      const inSeriesGroup = state.currentFolderView === config.SERIES_FOLDER_ID && !!state.currentSeriesView;
      const inSeriesRoot = state.currentFolderView === config.SERIES_FOLDER_ID && !state.currentSeriesView;
      const inAuthorView = !!state.currentAuthorView;
      const atRoot = !state.currentFolderView && !inAuthorView;
      context.renderDashboard(atRoot && !state.shelfSearchQuery);
      context.renderAuthorDashboard(inAuthorView);
      const isRealFolder = !!state.currentFolderView && state.currentFolderView !== config.FAVORITES_FOLDER_ID &&
        state.currentFolderView !== config.UNREAD_FOLDER_ID && state.currentFolderView !== config.SYNCED_FOLDER_ID &&
        state.currentFolderView !== config.HISTORY_FOLDER_ID && state.currentFolderView !== config.SERIES_FOLDER_ID;
      const canOrganize = atRoot || isRealFolder;
      const showOrganizeControls = canOrganize && state.reorderMode;

      elements.listBackBtn.style.display = state.currentFolderView || inAuthorView ? '' : 'none';
      elements.listNewFolderBtn.style.display = atRoot ? '' : 'none';
      elements.editShelfBtn.style.display = canOrganize ? '' : 'none';
      elements.editShelfBtn.classList.toggle('active', showOrganizeControls);
      elements.editShelfBtn.textContent = showOrganizeControls ? '編集完了' : '編集';
      context.updateBulkEditButton();
      elements.listNewFolderRow.style.display = 'none';

      if (state.currentFolderView === config.HISTORY_FOLDER_ID) elements.listFolderTitle.textContent = config.HISTORY_FOLDER_NAME;
      else if (state.currentFolderView === config.FAVORITES_FOLDER_ID) elements.listFolderTitle.textContent = config.FAVORITES_FOLDER_NAME;
      else if (state.currentFolderView === config.UNREAD_FOLDER_ID) elements.listFolderTitle.textContent = config.UNREAD_FOLDER_NAME;
      else if (state.currentFolderView === config.SYNCED_FOLDER_ID) elements.listFolderTitle.textContent = config.SYNCED_FOLDER_NAME;
      else if (inSeriesGroup) elements.listFolderTitle.textContent = state.currentSeriesView;
      else if (inSeriesRoot) elements.listFolderTitle.textContent = config.SERIES_FOLDER_NAME;
      else if (inAuthorView) elements.listFolderTitle.textContent = state.currentAuthorView;
      else if (state.currentFolderView) {
        const folder = state.savedFolders.find((f) => f.id === state.currentFolderView);
        elements.listFolderTitle.textContent = folder ? folder.name : '';
      } else elements.listFolderTitle.textContent = '';

      // Preserve the currently displayed DOM page only for a user-triggered
      // page turn; ordinary rerenders (search, folders, edits) stay immediate.
      const outgoingPage = direction && activePage && elements.savedListItems.contains(activePage)
        ? activePage : null;
      if (activeAnimation) {
        activeAnimation.cancel();
        activeAnimation = null;
      }
      elements.savedListItems.innerHTML = '';
      elements.savedListItems.classList.add('bookshelf');
      const frame = doc.createElement('div');
      frame.className = 'bookshelf-page-frame';
      const incomingPage = doc.createElement('div');
      incomingPage.className = 'bookshelf-page';
      frame.appendChild(incomingPage);
      elements.savedListItems.appendChild(frame);
      activePage = incomingPage;

      const viewModel = context.deriveViewModel({
        items: context.shelfVisibleItems(),
        folders: state.savedFolders,
        authorCards: state.authorCards,
        videos: context.getSavedVideos(),
        folderView: state.currentFolderView,
        seriesView: state.currentSeriesView,
        authorView: state.currentAuthorView,
        filters: state.shelfFilters,
        searchQuery: state.shelfSearchQuery,
        sort: state.shelfSort,
        reorderMode: state.reorderMode,
        groupByAuthor: state.groupByAuthorEnabled,
        bulkEditMode: state.bulkEditMode,
        page: state.bookshelfPage,
        pageSize: config.BOOKSHELF_PAGE_SIZE,
        ids: {
          favorites: config.FAVORITES_FOLDER_ID,
          unread: config.UNREAD_FOLDER_ID,
          synced: config.SYNCED_FOLDER_ID,
          history: config.HISTORY_FOLDER_ID,
          series: config.SERIES_FOLDER_ID
        },
        searchText: context.buildSearchText,
        title: context.itemDisplayTitle,
        unreadItems: context.unreadOrderItems()
      });
      const { itemsList, folderCards, visibleEntries, totalPages } = viewModel;
      context.setState({ bookshelfPage: viewModel.normalizedPage });
      const isEmpty = viewModel.totalEntries === 0;
      const emptyText = state.currentFolderView === config.FAVORITES_FOLDER_ID
        ? 'お気に入りはまだ追加されていません'
        : state.currentFolderView === config.UNREAD_FOLDER_ID
          ? '保存された漫画はまだありません'
        : state.currentFolderView === config.SYNCED_FOLDER_ID
          ? '同期済みの漫画はまだありません'
        : inSeriesRoot
          ? 'シリーズはまだ設定されていません'
          : (state.currentFolderView ? 'このフォルダにはまだ何もありません' : '保存されたURLはまだありません');
      // Render the same page slice that determines page count. Do not append
      // series or pinned folders independently of the page model.
      context.renderCards({
        elements: {
          savedListItems: incomingPage,
          savedListEmpty: elements.savedListEmpty,
          bookshelfPagination: elements.bookshelfPagination,
          bookshelfPrevBtn: elements.bookshelfPrevBtn,
          bookshelfNextBtn: elements.bookshelfNextBtn,
          bookshelfPageLabel: elements.bookshelfPageLabel
        },
        items: visibleEntries,
        createCard: (entry, list, organizeMode) => {
          if (entry.type === 'favorites') return context.buildFavoritesFolderCard();
          if (entry.type === 'series') return context.buildSeriesFolderCard();
          if (entry.type === 'folder') return buildFolderCard(entry.folder, folderCards, organizeMode);
          if (entry.type === 'series-group') return context.buildSeriesGroupCard(entry.group);
          if (entry.type === 'author-group') return context.buildAuthorGroupCard(entry.group);
          return buildBookCard(entry.item, list, organizeMode);
        },
        list: itemsList,
        reorderMode: showOrganizeControls,
        empty: isEmpty,
        emptyText,
        page: viewModel.normalizedPage,
        totalPages
      });
      // Pager belongs after the current page in both DOM and visual order.
      elements.savedListItems.appendChild(elements.bookshelfPagination);
      slideBetweenPages(doc, frame, outgoingPage, incomingPage, direction);

      elements.smartListRow.style.display = atRoot ? 'flex' : 'none';
      if (atRoot) {
        const historyCount = state.savedItems.filter((item) => item.folderId === config.HISTORY_FOLDER_ID).length;
        const unreadCount = context.unreadOrderItems().filter((item) => !Number(item.lastReadAt)).length;
        elements.historyListBtn.textContent = '履歴 (' + historyCount + ')';
        elements.unreadListBtn.textContent = '読んでいない順 (' + unreadCount + ')';
        elements.groupAuthorBtn.classList.toggle('active', state.groupByAuthorEnabled);
        elements.groupAuthorBtn.textContent = state.groupByAuthorEnabled ? '作者まとめを解除' : '作者でまとめる';
      }
    }

    return Object.freeze({ renderSavedList, buildBookCard, buildFolderCard, handleMangaCardOpen });
  }

  root.MangaListRuntimeFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
