(function (root) {
  'use strict';

  // Owns only DOM construction and element references, never list data or sync.
  // Called exclusively from MangaReaderVideoLibrary.init() after route boot.
  function setupMarkup(documentRef, dom) {
    const document = documentRef;
    const section = document.getElementById('videoListSection');
    if (!section) return false;
    if (section.dataset.videoLibraryEnhanced === '1') return true;
    section.dataset.videoLibraryEnhanced = '1';
    const legacyToolbar = document.getElementById('videoListToolbar');
    const legacyItems = document.getElementById('videoListItems');
    const legacyEmpty = document.getElementById('videoListEmpty');
    if (legacyToolbar) legacyToolbar.style.display = 'none';
    if (legacyItems) legacyItems.style.display = 'none';
    if (legacyEmpty) legacyEmpty.style.display = 'none';

    const app = document.createElement('div');
    app.id = 'videoLibraryApp';
    app.innerHTML = `
      <div class="vl-top">
        <div class="vl-search"><input id="videoLibrarySearch" type="search" inputmode="search" autocomplete="off" placeholder="動画を検索"></div>
        <button id="videoLibraryAdd" class="vl-primary" type="button">＋ 追加</button>
        <a id="videoLibraryProperties" class="vl-secondary" href="video-properties.html">プロパティ設定</a>
        <button id="videoLibraryShorts" class="vl-primary vl-shorts" type="button">縦スワイプ再生</button>
        <button id="videoLibraryHidden" class="vl-icon-btn" type="button">非表示</button>
        <button id="videoLibrarySeriesMode" class="vl-icon-btn" type="button" aria-pressed="false">シリーズ</button>
      </div>
      <div id="videoLibraryQuick" class="vl-chips" aria-label="クイックフィルタ">
        <button class="vl-chip" data-quick="all" type="button">すべて</button>
        <button class="vl-chip" data-quick="favorite" type="button">★ お気に入り</button>
        <button class="vl-chip" data-quick="later" type="button">あとで見る</button>
        <button class="vl-chip" data-quick="watching" type="button">視聴中</button>
        <button class="vl-chip" data-quick="watched" type="button">視聴済み</button>
      </div>
      <div class="vl-filters">
        <select id="videoLibraryFolder" aria-label="フォルダ"><option value="">全フォルダ</option></select>
        <select id="videoLibraryTag" aria-label="タグ"><option value="">全タグ</option></select>
        <select id="videoLibraryService" aria-label="サービス"><option value="">全サービス</option></select>
        <select id="videoLibraryKind" aria-label="リンクの種類"><option value="all">すべての種類</option><option value="direct">直リンク動画</option><option value="bookmark">ブックマーク</option></select>
        <select id="videoLibrarySort" aria-label="並べ替え"></select>
        <button id="videoLibraryView" class="vl-icon-btn" type="button" aria-label="表示形式を切り替え">表示</button>
        <label class="vl-thumbnail-size-label" for="videoLibraryThumbnailSize">サムネイルサイズ <select id="videoLibraryThumbnailSize" aria-label="動画一覧のサムネイルサイズ"><option value="small">小</option><option value="normal">標準</option><option value="large">大</option></select></label>
      </div>
      <details class="vl-custom-filter"><summary>カスタムプロパティで絞り込む</summary><div id="videoLibraryCustomFilters" class="vl-custom-filter-list"></div></details>
      <div id="videoLibrarySeriesBar" class="vl-series-bar" hidden>
        <span id="videoLibrarySeriesCount">0本選択中</span>
        <button id="videoLibrarySeriesGroup" type="button">まとめる</button>
        <button id="videoLibrarySeriesRemove" type="button">シリーズから外す</button>
        <button id="videoLibrarySeriesCancel" type="button">キャンセル</button>
      </div>
      <div class="vl-summary"><span id="videoLibraryCount"></span><span id="videoLibraryStatus" aria-live="polite"></span></div>
      <p id="videoLibraryAccessNotice" class="vl-access-notice" aria-live="polite" hidden>VPN接続を確認できるまで、動画データの読み込みと追加・編集を停止しています。</p>
      <div id="videoLibraryResults"></div>
      <nav id="videoLibraryPagination" class="bookshelf-pagination vl-pagination" aria-label="動画一覧のページ移動" hidden>
        <button id="videoLibraryPrevPage" class="bookshelfPagerButton" type="button" aria-label="前のページ"><svg class="bookshelfPagerGlyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <span id="videoLibraryPageLabel" aria-live="polite">1 / 1</span>
        <button id="videoLibraryNextPage" class="bookshelfPagerButton" type="button" aria-label="次のページ"><svg class="bookshelfPagerGlyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </nav>`;
    section.prepend(app);

    const sheet = document.createElement('section');
    sheet.id = 'videoLibrarySheet';
    sheet.hidden = true;
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = `
      <div class="vl-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="videoLibrarySheetTitle">
        <div class="vl-sheet-head"><h2 id="videoLibrarySheetTitle">動画</h2></div>
        <form id="videoLibraryForm" class="vl-form">
          <div class="vl-url-row"><div class="vl-field"><label for="videoLibraryUrl">動画URL</label><input id="videoLibraryUrl" type="url" autocomplete="off" placeholder="https://..."></div><button id="videoLibraryUrlEdit" class="vl-url-edit" type="button">編集</button></div>
          <div class="vl-field"><label for="videoLibraryTitle">タイトル</label><input id="videoLibraryTitle" type="text" autocomplete="off"></div>
          <div class="vl-two">
            <div class="vl-field"><label for="videoLibraryEditFolder">フォルダ</label><select id="videoLibraryEditFolder"></select></div>
            <div class="vl-field"><label for="videoLibraryStatusSelect">状態（任意）</label><select id="videoLibraryStatusSelect"><option value="">未設定</option><option value="later">あとで見る</option><option value="watching">視聴中</option><option value="watched">視聴済み</option></select></div>
          </div>
          <div class="vl-field"><label for="videoLibraryTags">タグ（カンマ区切り）</label><input id="videoLibraryTags" type="text" autocomplete="off"></div><div id="videoLibrarySuggestedTags" class="vl-suggested-tags" aria-label="既存のタグ"></div>
          <div class="vl-field"><label for="videoLibraryMemo">メモ</label><textarea id="videoLibraryMemo"></textarea></div>
          <label class="vl-check"><input id="videoLibraryFavorite" type="checkbox"> お気に入り</label>
          <label class="vl-check"><input id="videoLibraryEmbedPage" type="checkbox"> 外部ページを埋め込む（直リンク以外）</label>
          <div class="vl-field"><label for="videoLibraryRotate90Direction">再生時の回転</label><select id="videoLibraryRotate90Direction"><option value="none">回転なし</option><option value="left">常に左90°回転</option><option value="right">常に右90°回転</option></select></div>
          <details class="vl-advanced"><summary>再生情報・サムネイル</summary>
            <div class="vl-two">
              <div class="vl-field"><label for="videoLibraryLegacyService">サービス名</label><input id="videoLibraryLegacyService" type="text" autocomplete="off"></div>
              <div class="vl-field"><label for="videoLibraryLegacyId">動画ID</label><input id="videoLibraryLegacyId" type="text" inputmode="numeric" autocomplete="off"></div>
            </div>
            <div class="vl-field"><label for="videoLibraryThumbnail">サムネイルURL（任意）</label><input id="videoLibraryThumbnail" type="url" autocomplete="off"></div>
          </details>
          <div id="videoLibraryFormError" class="vl-summary" aria-live="polite"></div>
          <div class="vl-sheet-actions"><button id="videoLibraryDelete" class="danger" type="button">削除</button><button id="videoLibraryCancel" type="button">キャンセル</button><button class="save" type="submit">保存</button></div>
        </form>
        <div id="videoLibraryFolderManager" hidden>
          <div class="vl-folder-create"><input id="videoLibraryNewFolder" type="text" placeholder="新しいフォルダ名"><button id="videoLibraryCreateFolder" class="vl-primary" type="button">追加</button></div>
          <div id="videoLibraryFolderList" class="vl-folder-list"></div>
        </div>
      </div>`;
    document.body.appendChild(sheet);

    Object.assign(dom, {
      section, app, search: document.getElementById('videoLibrarySearch'), quick: document.getElementById('videoLibraryQuick'),
      folder: document.getElementById('videoLibraryFolder'), tag: document.getElementById('videoLibraryTag'), service: document.getElementById('videoLibraryService'), kind: document.getElementById('videoLibraryKind'),
      sort: document.getElementById('videoLibrarySort'), view: document.getElementById('videoLibraryView'), thumbnailSize: document.getElementById('videoLibraryThumbnailSize'), foldersBtn: document.getElementById('videoLibraryFolders'),
      customFilters: document.getElementById('videoLibraryCustomFilters'),
      seriesMode: document.getElementById('videoLibrarySeriesMode'), seriesBar: document.getElementById('videoLibrarySeriesBar'),
      seriesCount: document.getElementById('videoLibrarySeriesCount'), seriesGroup: document.getElementById('videoLibrarySeriesGroup'),
      seriesRemove: document.getElementById('videoLibrarySeriesRemove'), seriesCancel: document.getElementById('videoLibrarySeriesCancel'),
      add: document.getElementById('videoLibraryAdd'), shorts: document.getElementById('videoLibraryShorts'), hiddenBtn: document.getElementById('videoLibraryHidden'), count: document.getElementById('videoLibraryCount'), status: document.getElementById('videoLibraryStatus'), results: document.getElementById('videoLibraryResults'),
      pagination: document.getElementById('videoLibraryPagination'), prevPage: document.getElementById('videoLibraryPrevPage'), nextPage: document.getElementById('videoLibraryNextPage'), pageLabel: document.getElementById('videoLibraryPageLabel'),
      sheet, sheetTitle: document.getElementById('videoLibrarySheetTitle'), form: document.getElementById('videoLibraryForm'),
      formError: document.getElementById('videoLibraryFormError'), url: document.getElementById('videoLibraryUrl'), urlEdit: document.getElementById('videoLibraryUrlEdit'), suggestedTags: document.getElementById('videoLibrarySuggestedTags'), title: document.getElementById('videoLibraryTitle'), editFolder: document.getElementById('videoLibraryEditFolder'),
      statusSelect: document.getElementById('videoLibraryStatusSelect'), tags: document.getElementById('videoLibraryTags'), memo: document.getElementById('videoLibraryMemo'), favorite: document.getElementById('videoLibraryFavorite'), embedPage: document.getElementById('videoLibraryEmbedPage'),
      legacyService: document.getElementById('videoLibraryLegacyService'), legacyId: document.getElementById('videoLibraryLegacyId'), thumbnail: document.getElementById('videoLibraryThumbnail'),
      rotate90Direction: document.getElementById('videoLibraryRotate90Direction'),
      deleteBtn: document.getElementById('videoLibraryDelete'), cancel: document.getElementById('videoLibraryCancel'), folderManager: document.getElementById('videoLibraryFolderManager'),
      newFolder: document.getElementById('videoLibraryNewFolder'), createFolder: document.getElementById('videoLibraryCreateFolder'), folderList: document.getElementById('videoLibraryFolderList'),
      legacyItems,
      accessNotice: document.getElementById('videoLibraryAccessNotice'),
    });
    return true;
  }


  root.MangaReaderVideoLibraryView = Object.freeze({ setupMarkup });
}(typeof window !== 'undefined' ? window : globalThis));
