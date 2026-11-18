(function (root) {
  'use strict';

  // Owns DOM construction, card presentation and element references, never list persistence or sync.
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


  // Presentational cards only. Library state remains authoritative and actions
  // return to the library; this factory never installs document listeners or starts routes.
  function createCardRenderer(deps) {
    if (!deps?.documentRef || !deps?.data || !deps?.state || !deps?.actions) {
      throw new TypeError('video card presentation dependencies are required');
    }
    const { documentRef: document, data: Data, customProperties: CustomProperties, state,
      effectiveVideos, folderName, canReadProtectedData, actions } = deps;
    const STATUS_LABELS = { '': '', later: 'あとで見る', watching: '視聴中', watched: '視聴済み' };
  function formatDate(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(value)); }
    catch (_) { return ''; }
  }
  function progressPercent(video) {
    if (!video.durationSeconds || video.progressSeconds == null) return null;
    return Math.max(0, Math.min(100, Math.round((video.progressSeconds / video.durationSeconds) * 100)));
  }

  function createCard(video) {
    const VideoCard = root.MangaReaderVideoCard;
    if (!VideoCard || typeof VideoCard.create !== 'function') throw new Error('video card component is unavailable');
    const title = Data.displayTitle(video, effectiveVideos());
    const isBookmark = Data.videoEntryKind(video, state.meta[String(video.id)]) === 'bookmark';
    const metadata = [];
    const service = Data.deriveService(video.url, video.a);
    if (service && !isBookmark) metadata.push(service);
    if (video.folderId && folderName(video.folderId)) metadata.push(folderName(video.folderId));
    if (video.seriesId && effectiveVideos().some(item => item.id !== video.id && item.seriesId === video.seriesId)) metadata.push('シリーズ');
    if (video.watchStatus && STATUS_LABELS[video.watchStatus]) metadata.push(STATUS_LABELS[video.watchStatus]);
    if (video.lastOpenedAt) metadata.push(formatDate(video.lastOpenedAt));
    if (video.openCount) metadata.push(video.openCount + '回');
    const customLabels = [];
    if (canReadProtectedData() && CustomProperties) {
      const stored = state.customValues[String(video.id)] || {};
      const shown = Object.values(state.customDefinitions.properties || {}).filter((property) => property && property.deleted !== true && property.hidden !== true && Object.prototype.hasOwnProperty.call(stored, property.id) && stored[property.id] !== null && stored[property.id] !== '').sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      shown.forEach((property) => {
        const value = CustomProperties.formatValue(property, stored[property.id], state.customDefinitions);
        if (value !== '') customLabels.push(property.name + ': ' + value);
      });
    }
    // Legacy publications used a link to a special player as their stored
    // URL. Give them the exact same MP4 thumbnail and dimensions as all new
    // published video cards, without rewriting saved IDs or metadata.
    let cardMedia = video;
    if (state.meta[String(video.id)]?.virtualPublishedEdit) {
      const publication = state.meta[String(video.id)].virtualPublishedEdit;
      const first = publication.edit?.clips?.[0];
      const source = first && state.baseVideos.find((item) => String(item.id) === first.sourceVideoId);
      if (source) {
        const sourceMeta = state.meta[String(source.id)] || {};
        const mediaUrl = typeof sourceMeta.url === 'string' ? sourceMeta.url : source.url;
        if (Data.isDirectVideoUrl(mediaUrl)) {
          cardMedia = { ...video, url: mediaUrl,
            thumbnailTimeSeconds: video.thumbnailTimeSeconds == null ? first.startSeconds : video.thumbnailTimeSeconds,
            rotate90Direction: first.rotation === 90 ? 'right' : first.rotation === -90 ? 'left' : 'none',
            virtualThumbRotation: first.rotation || 0 };
        }
      }
    }
    const card = VideoCard.create(cardMedia, {
      documentRef: document, layout: state.view === 'compact' ? 'compact' : 'grid', openClass: 'vl-open',
      bookmark: isBookmark, openHref: isBookmark && video.embedPage !== true ? video.url : null, serviceLabel: service,
      title, metadata, tags: Array.isArray(video.tags) ? video.tags : [], customLabels,
      progressPercent: isBookmark ? null : progressPercent(video),
      thumbnailRenderer: root.MangaReaderVideoThumbnailRenderer,
      thumbnailOptions: { fallbackClass: 'vl-thumb-fallback', videoClass: 'vl-thumb-direct-video', serviceLabel: service || 'VIDEO' },
      onOpen: () => actions.openVideo(video.id),
      menuActions: [{ label: video.favorite ? 'お気に入りを解除' : 'お気に入りに追加', onSelect: () => actions.toggleFavorite(video.id, !video.favorite) },
        ...(video.seriesId && effectiveVideos().some(item => item.id !== video.id && item.seriesId === video.seriesId)
          ? [{ label: 'シリーズから外す', onSelect: () => actions.removeSeries([video.id]) }] : [])],
      editHref: 'video-edit.html?id=' + encodeURIComponent(video.id) + '&return=list',
    });
    card.classList.add('vl-card');
    card.dataset.videoId = String(video.id);
    if (state.seriesSelecting) {
      const pick = document.createElement('label');
      pick.className = 'vl-series-pick';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.seriesSelected.has(String(video.id));
      checkbox.setAttribute('aria-label', title + 'をシリーズ用に選択');
      checkbox.addEventListener('change', () => actions.selectVideo(video.id, checkbox.checked));
      pick.append(checkbox, document.createTextNode('選択'));
      card.append(pick);
    }
    return card;
  }

  function createSeriesCard(group) {
    const section = document.createElement('section');
    section.className = 'vl-series';
    section.dataset.seriesId = group.id;
    const heading = document.createElement('div');
    heading.className = 'vl-series-heading';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'vl-series-toggle';
    const expanded = state.expandedSeries.has(group.id);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = (expanded ? '▾ ' : '▸ ') + 'シリーズ · ' + group.videos.length + '本';
    toggle.addEventListener('click', () => actions.toggleSeries(group.id, !expanded));
    heading.append(toggle);
    if (state.seriesSelecting) {
      const label = document.createElement('label');
      label.className = 'vl-series-select-all';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = group.videos.every(video => state.seriesSelected.has(String(video.id)));
      checkbox.setAttribute('aria-label', 'このシリーズ内の動画をすべて選択');
      checkbox.addEventListener('change', () => actions.selectSeries(group.videos.map(video => video.id), checkbox.checked));
      label.append(checkbox, document.createTextNode('まとめて選択'));
      heading.append(label);
    }
    section.append(heading);
    if (expanded) {
      const grid = document.createElement('div');
      grid.className = 'vl-series-videos';
      group.videos.forEach(video => grid.append(createCard(video)));
      section.append(grid);
    }
    return section;
  }
    return Object.freeze({ createCard, createSeriesCard });
  }

  root.MangaReaderVideoLibraryView = Object.freeze({ setupMarkup, createCardRenderer });
}(typeof window !== 'undefined' ? window : globalThis));
