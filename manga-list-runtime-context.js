(function (root) {
  'use strict';

  const REQUIRED = [
    'getState', 'setState', 'getElements', 'getDocument', 'getConfig', 'getReaderScreen',
    'getSavedVideos', 'clearLocalCoverObjectUrls', 'confirmAction', 'setTimeout',
    'persistItems', 'persistFolders', 'persistAuthorCards', 'persistAll', 'scheduleCloudSync',
    'openReader', 'accessMedia', 'renderDashboard', 'renderAuthorDashboard',
    'getVisibleItems', 'appendFolderPreview', 'createStaticCard', 'loadLocalCover',
    'getCoverSourceCache', 'setupFeedImage', 'makeHeartIcon', 'moveItemInList',
    'moveFolderInList', 'rememberReaderReturnView', 'closeSavedList',
    'setReadingListContext', 'flashStatus', 'navigateReaderScreen', 'switchListTab',
    'openItem', 'renderList', 'updateBulkEditButton', 'shelfVisibleItems',
    'unreadOrderItems', 'itemDisplayTitle', 'itemSubtext', 'readingRecordText',
    'itemPageCountText', 'buildFavoritesFolderCard', 'buildSeriesFolderCard',
    'buildSeriesGroupCard', 'buildAuthorGroupCard', 'buildSearchText',
    'deriveViewModel', 'renderCards', 'createDocumentFragment'
  ];

  function create(deps) {
    if (!deps || typeof deps !== 'object') {
      throw new TypeError('MangaListRuntimeContextFactory requires dependency object');
    }
    for (const name of REQUIRED) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaListRuntimeContextFactory requires function: ' + name);
      }
    }
    return Object.freeze({
      getState: deps.getState,
      setState: deps.setState,
      getElements: deps.getElements,
      getDocument: deps.getDocument,
      getConfig: deps.getConfig,
      getReaderScreen: deps.getReaderScreen,
      getSavedVideos: deps.getSavedVideos,
      clearLocalCoverObjectUrls: deps.clearLocalCoverObjectUrls,
      confirmAction: deps.confirmAction,
      setTimeout: deps.setTimeout,
      persistItems: deps.persistItems,
      persistFolders: deps.persistFolders,
      persistAuthorCards: deps.persistAuthorCards,
      persistAll: deps.persistAll,
      scheduleCloudSync: deps.scheduleCloudSync,
      openReader: deps.openReader,
      accessMedia: deps.accessMedia,
      renderDashboard: deps.renderDashboard,
      renderAuthorDashboard: deps.renderAuthorDashboard,
      getVisibleItems: deps.getVisibleItems,
      appendFolderPreview: deps.appendFolderPreview,
      createStaticCard: deps.createStaticCard,
      loadLocalCover: deps.loadLocalCover,
      getCoverSourceCache: deps.getCoverSourceCache,
      setupFeedImage: deps.setupFeedImage,
      makeHeartIcon: deps.makeHeartIcon,
      moveItemInList: deps.moveItemInList,
      moveFolderInList: deps.moveFolderInList,
      rememberReaderReturnView: deps.rememberReaderReturnView,
      closeSavedList: deps.closeSavedList,
      setReadingListContext: deps.setReadingListContext,
      flashStatus: deps.flashStatus,
      navigateReaderScreen: deps.navigateReaderScreen,
      switchListTab: deps.switchListTab,
      openItem: deps.openItem,
      renderList: deps.renderList,
      updateBulkEditButton: deps.updateBulkEditButton,
      shelfVisibleItems: deps.shelfVisibleItems,
      unreadOrderItems: deps.unreadOrderItems,
      itemDisplayTitle: deps.itemDisplayTitle,
      itemSubtext: deps.itemSubtext,
      readingRecordText: deps.readingRecordText,
      itemPageCountText: deps.itemPageCountText,
      buildFavoritesFolderCard: deps.buildFavoritesFolderCard,
      buildSeriesFolderCard: deps.buildSeriesFolderCard,
      buildSeriesGroupCard: deps.buildSeriesGroupCard,
      buildAuthorGroupCard: deps.buildAuthorGroupCard,
      buildSearchText: deps.buildSearchText,
      deriveViewModel: deps.deriveViewModel,
      renderCards: deps.renderCards,
      createDocumentFragment: deps.createDocumentFragment,
      openReader: deps.openReader
    });
  }

  root.MangaListRuntimeContextFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
