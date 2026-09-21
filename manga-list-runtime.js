(function (root) {
  'use strict';

  const REQUIRED = [
    'getState', 'setState', 'getElements', 'getDocument', 'getConfig',
    'getSavedVideos', 'clearLocalCoverObjectUrls', 'confirmAction', 'setTimeout',
    'persistAll', 'renderDashboard', 'renderAuthorDashboard', 'updateBulkEditButton',
    'getVisibleItems', 'appendFolderPreview', 'createStaticCard', 'loadLocalCover',
    'getCoverSourceCache', 'setupFeedImage', 'makeHeartIcon', 'moveItemInList',
    'moveFolderInList', 'rememberReaderReturnView', 'closeSavedList',
    'setReadingListContext', 'openItem', 'renderList', 'buildFavoritesFolderCard',
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
          context.rememberReaderReturnView();
          context.closeSavedList();
          context.setReadingListContext(folderItems, 0);
          context.openItem(folderItems[0], false);
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

      if (Array.isArray(item.pages) && item.pages.length) {
        const source = item.pages[0];
        if (item.localSync) {
          context.loadLocalCover(item, img);
        } else {
          const coverSourceCache = context.getCoverSourceCache();
          img.src = coverSourceCache.get(source) || source; // exact URL already known; no extension cascade needed
          img.addEventListener('load', () => coverSourceCache.set(source, img.currentSrc || img.src), { once: true });
        }
      } else {
        context.setupFeedImage(img, item.url, item.numberWidth, item.pagePattern);
      }
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
            card.style.transition = 'opacity .16s ease, transform .16s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(.94)';
            context.setTimeout(() => {
              card.remove();
              if (!elements.savedListItems.children.length) {
                elements.savedListEmpty.textContent = 'お気に入りはまだ追加されていません';
                elements.savedListEmpty.style.display = 'block';
              }
            }, 160);
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

    function renderSavedList() {
      const doc = context.getDocument();
      const elements = context.getElements();
      const state = context.getState();
      const config = context.getConfig();
      context.clearLocalCoverObjectUrls();
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

      elements.savedListItems.innerHTML = '';
      elements.savedListItems.classList.add('bookshelf');
      elements.savedListItems.appendChild(elements.bookshelfPagination);

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
      const { itemsList, folderCards, seriesGroupCards, authorGroupCards, showFavoritesCard, showSeriesCard,
        visibleEntries, visibleFolderEntries, visibleAuthorGroups, visibleItems, totalPages } = viewModel;
      context.setState({ bookshelfPage: viewModel.normalizedPage });
      const isEmpty = folderCards.length === 0 && itemsList.length === 0 && seriesGroupCards.length === 0 &&
        !showFavoritesCard && !showSeriesCard;
      const emptyText = state.currentFolderView === config.FAVORITES_FOLDER_ID
        ? 'お気に入りはまだ追加されていません'
        : state.currentFolderView === config.UNREAD_FOLDER_ID
          ? '保存された漫画はまだありません'
        : state.currentFolderView === config.SYNCED_FOLDER_ID
          ? '同期済みの漫画はまだありません'
        : inSeriesRoot
          ? 'シリーズはまだ設定されていません'
          : (state.currentFolderView ? 'このフォルダにはまだ何もありません' : '保存されたURLはまだありません');
      if (!isEmpty) {
        const frag = context.createDocumentFragment();
        if (showFavoritesCard) frag.appendChild(context.buildFavoritesFolderCard());
        if (showSeriesCard) frag.appendChild(context.buildSeriesFolderCard());
        visibleFolderEntries.forEach((entry) => frag.appendChild(buildFolderCard(entry.folder, folderCards, showOrganizeControls)));
        seriesGroupCards.forEach((group) => frag.appendChild(context.buildSeriesGroupCard(group)));
        if (state.groupByAuthorEnabled && !state.bulkEditMode && authorGroupCards.length) {
          visibleAuthorGroups.forEach((group) => frag.appendChild(context.buildAuthorGroupCard(group)));
        }
        elements.savedListItems.appendChild(frag);
      }
      context.renderCards({
        elements: {
          savedListItems: elements.savedListItems,
          savedListEmpty: elements.savedListEmpty,
          bookshelfPagination: elements.bookshelfPagination,
          bookshelfPrevBtn: elements.bookshelfPrevBtn,
          bookshelfNextBtn: elements.bookshelfNextBtn,
          bookshelfPageLabel: elements.bookshelfPageLabel
        },
        items: visibleItems,
        createCard: (item, list, organizeMode) => buildBookCard(item, list, organizeMode),
        list: itemsList,
        reorderMode: showOrganizeControls,
        empty: isEmpty,
        emptyText,
        page: viewModel.normalizedPage,
        totalPages
      });

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
