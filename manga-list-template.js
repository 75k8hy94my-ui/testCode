(function (root) {
  'use strict';

  function createMarkup() {
    return String.raw`<div id="mangaListSection">
      <div id="exportImportRow">
        <button class="textActionBtn" id="newBtn">新規</button>
        <button class="textActionBtn" id="addCustomBtn">個別追加</button>
        <button class="textActionBtn" id="bulkDetectBtn">一括読み込み</button>
      </div>
      <div id="smartListRow">
        <button class="smartListBtn" id="historyListBtn" type="button">履歴</button>
        <button class="smartListBtn" id="unreadListBtn" type="button">読んでいない順</button>
        <button class="smartListBtn" id="syncedListBtn" type="button">同期済み</button>
        <button class="smartListBtn" id="transferBudgetBtn" type="button">通信量</button>
      </div>
      <div id="listToolbar">
        <input id="shelfSearchInput" type="search" placeholder="タイトル・作者・タグ・フォルダ・動画を検索" aria-label="本棚検索" style="min-width:180px;flex:1;">
        <button class="ctrlBtn" id="listBackBtn" style="display:none;">← 戻る</button>
        <span id="listFolderTitle"></span>
        <button class="ctrlBtn" id="listNewFolderBtn">+ 新しいフォルダ</button>
        <button class="ctrlBtn" id="editShelfBtn">編集</button>
        <button class="ctrlBtn" id="bulkEditBtn" type="button">一括編集</button>
        <button class="ctrlBtn" id="undoBulkEditBtn" type="button" style="display:none;">もとに戻す</button>
        <button class="ctrlBtn" id="filterBtn" type="button">絞り込み</button>
        <select class="ctrlBtn" id="shelfSortSelect" aria-label="本棚の並び順">
          <option value="added-desc">新しい順</option>
          <option value="title-asc">タイトル順</option>
          <option value="synced-first">同期済みを上</option>
        </select>
        <button class="smartListBtn" id="groupAuthorBtn" type="button">作者でまとめる</button>
      </div>
      <div id="dashboard" hidden style="display:grid;gap:10px;margin:12px 0;"></div>
      <div id="filterRow" style="display:none;" class="filter-row">
        <input id="filterSeriesInput" type="text" placeholder="シリーズ">
        <input id="filterAuthorInput" type="text" placeholder="作者">
        <input id="filterTagsInput" type="text" placeholder="タグ">
        <input id="filterSourceInput" type="text" placeholder="元ネタ">
        <button class="ctrlBtn" id="applyFilterBtn" type="button">適用</button>
        <button class="ctrlBtn" id="clearFilterBtn" type="button">解除</button>
      </div>
      <div id="listNewFolderRow">
        <input id="listNewFolderInput" type="text" placeholder="新しいフォルダ名">
        <button class="ctrlBtn" id="listNewFolderConfirmBtn">追加</button>
      </div>
      <div id="savedListItems">
        <div id="bookshelfPagination" style="display:none;" class="bookshelf-pagination">
          <button class="ctrlBtn bookshelfPagerButton" id="bookshelfPrevBtn" type="button">前へ</button>
          <span id="bookshelfPageLabel"></span>
          <button class="ctrlBtn bookshelfPagerButton" id="bookshelfNextBtn" type="button">次へ</button>
        </div>
      </div>
      <div id="savedListEmpty" style="display:none;">保存されたURLはまだありません</div>
    </div>`;
  }

  root.MangaListTemplate = Object.freeze({ createMarkup });
})(typeof self !== 'undefined' ? self : this);
