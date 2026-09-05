(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const Data = window.MangaReaderVideoData;
  if (!Data) return;

  const VIDEO_KEY = 'mangaReaderVideos';
  const FOLDER_KEY = 'mangaReaderVideoFolders';
  const META_KEY = 'mangaReaderVideoMeta';
  const PREF_KEY = 'mangaReaderVideoLibraryView';
  const STATUS_LABELS = { '': '', later: 'あとで見る', watching: '視聴中', watched: '視聴済み' };
  const SORT_LABELS = {
    'recent-added': '最近追加', oldest: '古い順', 'recent-opened': '最近開いた', 'most-opened': 'よく開く', title: 'タイトル'
  };

  const state = {
    baseVideos: [], folders: [], meta: {}, query: '', quick: 'all', folderId: '', tag: '', service: '', sort: 'recent-added', view: 'card',
    syncTimer: null, syncRunning: false, syncDirty: false, editorId: null, sheetMode: null, showHidden: false,
  };
  const dom = {};

  function readJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function id(prefix) { return prefix + '-' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()); }
  function text(value) { return String(value == null ? '' : value).trim(); }

  function loadPrefs() {
    const prefs = readJson(PREF_KEY, {});
    state.sort = SORT_LABELS[prefs.sort] ? prefs.sort : 'recent-added';
    state.view = prefs.view === 'compact' ? 'compact' : 'card';
    state.quick = ['all', 'favorite', 'later', 'watching', 'watched'].includes(prefs.quick) ? prefs.quick : 'all';
  }
  function savePrefs() { writeJson(PREF_KEY, { sort: state.sort, view: state.view, quick: state.quick }); }

  function loadLibraryState() {
    const rawVideos = readJson(VIDEO_KEY, []);
    state.baseVideos = Array.isArray(rawVideos) ? rawVideos : [];
    state.folders = Data.normalizeFolders(readJson(FOLDER_KEY, []));
    const rawMeta = readJson(META_KEY, {});
    state.meta = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta) ? rawMeta : {};
  }

  function effectiveVideo(base) {
    const meta = state.meta[base.id] && typeof state.meta[base.id] === 'object' ? state.meta[base.id] : {};
    return Data.normalizeVideo({ ...base, ...meta, id: base.id, a: base.a, b: base.b, addedAt: base.addedAt });
  }
  function effectiveVideos() { return state.baseVideos.map(effectiveVideo); }
  function baseById(videoId) { return state.baseVideos.find((video) => String(video.id) === String(videoId)) || null; }
  function folderName(folderId) { return (state.folders.find((folder) => folder.id === folderId) || {}).name || ''; }

  function setStatus(message, isError) {
    if (!dom.status) return;
    dom.status.textContent = message || '';
    dom.status.dataset.error = isError ? '1' : '0';
  }

  async function runVaultSync() {
    if (!window.MangaVault || !window.MangaVaultPayload || !MangaVault.loadActive || !MangaVault.loadActive()) return;
    if (state.syncRunning) { state.syncDirty = true; return; }
    state.syncRunning = true;
    setStatus('同期中…');
    try {
      await MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage());
      setStatus('保存しました');
      setTimeout(() => { if (dom.status && dom.status.textContent === '保存しました') setStatus(''); }, 1800);
    } catch (error) {
      setStatus('端末には保存済みです。同期: ' + (error && error.message ? error.message : '失敗'), true);
    } finally {
      state.syncRunning = false;
      if (state.syncDirty) { state.syncDirty = false; runVaultSync(); }
    }
  }
  function scheduleVaultSync() {
    clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(runVaultSync, 450);
  }
  function persistAux({ sync = true } = {}) {
    writeJson(FOLDER_KEY, state.folders);
    writeJson(META_KEY, state.meta);
    if (sync) scheduleVaultSync();
  }
  function updateMeta(videoId, patch, options) {
    const current = state.meta[videoId] && typeof state.meta[videoId] === 'object' ? state.meta[videoId] : {};
    state.meta[videoId] = { ...current, ...patch, updatedAt: Date.now() };
    persistAux(options);
  }

  function injectStyles() {
    if (document.getElementById('videoLibraryStyles')) return;
    const style = document.createElement('style');
    style.id = 'videoLibraryStyles';
    style.textContent = `
      #videoListSection[data-video-library-enhanced="1"]{overflow:hidden!important}#videoListSection[data-video-library-enhanced="1"] #videoListToolbar,#videoListSection[data-video-library-enhanced="1"] #videoListItems,#videoListSection[data-video-library-enhanced="1"] #videoListEmpty{display:none!important}
      #videoLibraryApp{display:flex;flex-direction:column;min-height:0;flex:1;gap:10px}
      .vl-top{display:flex;gap:8px;align-items:center}.vl-search{position:relative;flex:1}.vl-search input{width:100%;min-height:44px;border:1px solid var(--border);border-radius:14px;background:var(--bg-soft);color:var(--text);padding:10px 13px 10px 38px;font-size:16px}.vl-search::before{content:'⌕';position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--sub);font-size:20px}.vl-primary{min-height:44px;border:0;border-radius:14px;padding:0 14px;background:var(--accent);color:#fff;font-weight:750;cursor:pointer}.vl-chips{display:flex;gap:7px;overflow-x:auto;padding:1px 0 3px;scrollbar-width:none}.vl-chips::-webkit-scrollbar{display:none}.vl-chip{flex:0 0 auto;border:1px solid var(--border);border-radius:999px;background:var(--bg-soft);color:var(--sub);padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer}.vl-chip.active{color:var(--text);border-color:color-mix(in srgb,var(--accent) 55%,var(--border));background:var(--accent-dim)}
      .vl-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto auto;gap:7px}.vl-filters select,.vl-icon-btn{min-height:39px;min-width:0;border:1px solid var(--border);border-radius:11px;background:var(--bg-soft);color:var(--text);padding:0 9px}.vl-icon-btn{cursor:pointer;font-weight:700}.vl-summary{display:flex;justify-content:space-between;gap:10px;color:var(--sub);font-size:11px;min-height:18px}.vl-summary [data-error="1"]{color:#ef6464}
      #videoLibraryResults{overflow:auto;min-height:0;flex:1;padding:1px 1px 18px}.vl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:11px}.vl-grid.compact{display:flex;flex-direction:column;gap:6px}.vl-card{position:relative;min-width:0;border:1px solid var(--border);border-radius:16px;background:var(--bg-soft);overflow:visible;box-shadow:0 5px 18px rgba(0,0,0,.08)}.vl-open{display:block;width:100%;border:0;background:transparent;color:inherit;padding:0;text-align:left;cursor:pointer}.vl-thumb{position:relative;aspect-ratio:16/9;display:grid;place-items:center;border-radius:15px 15px 0 0;overflow:hidden;background:linear-gradient(135deg,var(--panel-2),var(--bg));color:var(--sub)}.vl-thumb img{width:100%;height:100%;object-fit:cover}.vl-thumb-fallback{display:grid;place-items:center;text-align:center;gap:5px;font-size:11px}.vl-thumb-fallback b{font-size:27px;color:var(--text)}.vl-body{padding:11px 12px 12px}.vl-title{font-weight:750;font-size:14px;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.vl-meta{margin-top:6px;color:var(--sub);font-size:11px;display:flex;gap:6px;flex-wrap:wrap}.vl-tags{margin-top:7px;display:flex;gap:5px;flex-wrap:wrap}.vl-tag{font-size:10px;border:1px solid var(--border);border-radius:999px;padding:3px 6px;color:var(--sub)}.vl-card-actions{position:absolute;right:8px;top:8px;display:flex;gap:4px;z-index:3}.vl-round{width:34px;height:34px;border:1px solid rgba(255,255,255,.24);border-radius:50%;display:grid;place-items:center;background:rgba(10,12,17,.76);color:#fff;backdrop-filter:blur(14px);cursor:pointer}.vl-round.active{color:#ffd35a}.vl-menu{position:relative}.vl-menu summary{list-style:none}.vl-menu summary::-webkit-details-marker{display:none}.vl-menu-panel{position:absolute;right:0;top:38px;width:170px;padding:6px;border:1px solid var(--border);border-radius:12px;background:var(--panel);box-shadow:var(--shadow-md);z-index:20}.vl-menu-panel button{display:block;width:100%;border:0;background:transparent;color:var(--text);text-align:left;padding:9px;border-radius:8px;cursor:pointer}.vl-menu-panel button:hover{background:var(--panel-2)}.vl-menu-panel .danger{color:#ff7777}.vl-progress{height:3px;background:var(--panel-2);margin-top:9px;border-radius:99px;overflow:hidden}.vl-progress i{display:block;height:100%;background:var(--accent)}
      .vl-grid.compact .vl-card{display:grid;grid-template-columns:116px minmax(0,1fr);min-height:76px;overflow:visible}.vl-grid.compact .vl-open{display:contents}.vl-grid.compact .vl-thumb{aspect-ratio:auto;height:76px;border-radius:15px 0 0 15px}.vl-grid.compact .vl-body{padding:10px 70px 8px 10px}.vl-grid.compact .vl-title{-webkit-line-clamp:1}.vl-grid.compact .vl-card-actions{top:50%;transform:translateY(-50%)}.vl-empty{padding:48px 18px;text-align:center;color:var(--sub);border:1px dashed var(--border);border-radius:16px}.vl-empty strong{display:block;color:var(--text);font-size:17px;margin-bottom:6px}
      #videoLibrarySheet{position:fixed;inset:0;z-index:180;background:rgba(0,0,0,.46);display:grid;align-items:end;padding:12px;backdrop-filter:blur(10px)}#videoLibrarySheet[hidden]{display:none!important}.vl-sheet-panel{width:min(680px,100%);max-height:min(90dvh,820px);margin:0 auto;overflow:auto;border:1px solid var(--border);border-radius:24px;background:var(--panel);color:var(--text);box-shadow:0 24px 70px rgba(0,0,0,.45);padding:18px}.vl-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:-18px;background:var(--panel);padding:16px 0 10px;z-index:2}.vl-sheet-head h2{margin:0;font-size:20px}.vl-close{border:1px solid var(--border);border-radius:999px;background:var(--panel-2);color:var(--text);width:38px;height:38px}.vl-form{display:grid;gap:12px}.vl-field label{display:block;color:var(--sub);font-size:11px;font-weight:700;margin:0 0 5px}.vl-field input,.vl-field select,.vl-field textarea{width:100%;border:1px solid var(--border);border-radius:12px;background:var(--bg-soft);color:var(--text);padding:11px;font-size:15px}.vl-field textarea{min-height:90px;resize:vertical}.vl-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.vl-check{display:flex;gap:8px;align-items:center}.vl-sheet-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}.vl-sheet-actions button{min-height:42px;border-radius:12px;padding:0 14px;border:1px solid var(--border);background:var(--panel-2);color:var(--text);font-weight:700}.vl-sheet-actions .save{border:0;background:var(--accent);color:#fff}.vl-sheet-actions .danger{margin-right:auto;color:#ff7777}.vl-advanced{border:1px solid var(--border);border-radius:12px;padding:0 11px}.vl-advanced summary{padding:11px 0;cursor:pointer;color:var(--sub);font-size:12px}.vl-help{margin:-4px 0 2px;color:var(--sub);font-size:11px;line-height:1.5}.vl-folder-create{display:flex;gap:8px}.vl-folder-create input{flex:1}.vl-folder-list{display:grid;gap:7px;margin-top:12px}.vl-folder-row{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:12px;padding:9px 10px}.vl-folder-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.vl-folder-row button{border:0;background:var(--panel-2);color:var(--text);border-radius:8px;padding:7px 9px}.vl-folder-row .danger{color:#ff7777}
      @media(max-width:700px){.vl-filters{grid-template-columns:1fr 1fr 1fr}.vl-filters #videoLibrarySort{grid-column:span 1}.vl-grid{grid-template-columns:1fr 1fr}.vl-sheet-panel{border-radius:24px 24px 18px 18px}.vl-two{grid-template-columns:1fr}}
      @media(max-width:480px){.vl-top{align-items:stretch}.vl-primary{padding:0 12px}.vl-filters{grid-template-columns:1fr 1fr}.vl-grid{grid-template-columns:1fr}.vl-grid.compact .vl-card{grid-template-columns:104px minmax(0,1fr)}.vl-grid.compact .vl-thumb{height:72px}.vl-grid.compact .vl-body{padding-right:66px}.vl-summary{padding:0 2px}}
    `;
    document.head.appendChild(style);
  }

  function setupMarkup() {
    const section = document.getElementById('videoListSection');
    if (!section || section.dataset.videoLibraryEnhanced === '1') return false;
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
        <button id="videoLibraryHidden" class="vl-icon-btn" type="button">非表示</button>
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
        <select id="videoLibrarySort" aria-label="並べ替え"></select>
        <button id="videoLibraryView" class="vl-icon-btn" type="button" aria-label="表示形式を切り替え">表示</button>
        <button id="videoLibraryFolders" class="vl-icon-btn" type="button">フォルダ</button>
      </div>
      <div class="vl-summary"><span id="videoLibraryCount"></span><span id="videoLibraryStatus" aria-live="polite"></span></div>
      <div id="videoLibraryResults"></div>`;
    section.prepend(app);

    const sheet = document.createElement('section');
    sheet.id = 'videoLibrarySheet';
    sheet.hidden = true;
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = `
      <div class="vl-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="videoLibrarySheetTitle">
        <div class="vl-sheet-head"><h2 id="videoLibrarySheetTitle">動画</h2><button id="videoLibrarySheetClose" class="vl-close" type="button" aria-label="閉じる">×</button></div>
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
          <details class="vl-advanced"><summary>再生情報・サムネイル</summary>
            <div class="vl-two">
              <div class="vl-field"><label for="videoLibraryLegacyService">サービス名</label><input id="videoLibraryLegacyService" type="text" autocomplete="off"></div>
              <div class="vl-field"><label for="videoLibraryLegacyId">動画ID</label><input id="videoLibraryLegacyId" type="text" inputmode="numeric" autocomplete="off"></div>
            </div>
            <div class="vl-field"><label for="videoLibraryThumbnail">サムネイルURL（任意）</label><input id="videoLibraryThumbnail" type="url" autocomplete="off"></div>
            <div class="vl-two">
              <div class="vl-field"><label for="videoLibraryRotateLeftStart">左90°回転 開始秒</label><input id="videoLibraryRotateLeftStart" type="number" min="0" step="0.1" inputmode="decimal" placeholder="例: 12.5"></div>
              <div class="vl-field"><label for="videoLibraryRotateLeftEnd">左90°回転 終了秒</label><input id="videoLibraryRotateLeftEnd" type="number" min="0" step="0.1" inputmode="decimal" placeholder="例: 28"></div>
            </div>
            <div class="vl-help">開始・終了を両方指定すると、その区間だけ直接再生動画を左90°回転します。</div>
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
      folder: document.getElementById('videoLibraryFolder'), tag: document.getElementById('videoLibraryTag'), service: document.getElementById('videoLibraryService'),
      sort: document.getElementById('videoLibrarySort'), view: document.getElementById('videoLibraryView'), foldersBtn: document.getElementById('videoLibraryFolders'),
      add: document.getElementById('videoLibraryAdd'), hiddenBtn: document.getElementById('videoLibraryHidden'), count: document.getElementById('videoLibraryCount'), status: document.getElementById('videoLibraryStatus'), results: document.getElementById('videoLibraryResults'),
      sheet, sheetTitle: document.getElementById('videoLibrarySheetTitle'), sheetClose: document.getElementById('videoLibrarySheetClose'), form: document.getElementById('videoLibraryForm'),
      formError: document.getElementById('videoLibraryFormError'), url: document.getElementById('videoLibraryUrl'), urlEdit: document.getElementById('videoLibraryUrlEdit'), suggestedTags: document.getElementById('videoLibrarySuggestedTags'), title: document.getElementById('videoLibraryTitle'), editFolder: document.getElementById('videoLibraryEditFolder'),
      statusSelect: document.getElementById('videoLibraryStatusSelect'), tags: document.getElementById('videoLibraryTags'), memo: document.getElementById('videoLibraryMemo'), favorite: document.getElementById('videoLibraryFavorite'),
      legacyService: document.getElementById('videoLibraryLegacyService'), legacyId: document.getElementById('videoLibraryLegacyId'), thumbnail: document.getElementById('videoLibraryThumbnail'),
      rotateLeftStart: document.getElementById('videoLibraryRotateLeftStart'), rotateLeftEnd: document.getElementById('videoLibraryRotateLeftEnd'),
      deleteBtn: document.getElementById('videoLibraryDelete'), cancel: document.getElementById('videoLibraryCancel'), folderManager: document.getElementById('videoLibraryFolderManager'),
      newFolder: document.getElementById('videoLibraryNewFolder'), createFolder: document.getElementById('videoLibraryCreateFolder'), folderList: document.getElementById('videoLibraryFolderList'),
      legacyItems, legacyAddBtn: document.getElementById('addVideoBtn'), legacyConfirmAdd: document.getElementById('confirmVideoAddBtn'), legacyUrlInput: document.getElementById('videoUrlInput'),
      legacyTitleInput: document.getElementById('videoTitleInput'), legacyAInput: document.getElementById('videoAInput'), legacyBInput: document.getElementById('videoBInput'),
      videoPlayerTitle: document.getElementById('videoPlayerTitle'), videoPlayerIframe: document.getElementById('videoPlayerIframe'),
    });
    return true;
  }

  function fillSelect(select, options, current, blankLabel) {
    const value = current || '';
    select.replaceChildren();
    const blank = document.createElement('option'); blank.value = ''; blank.textContent = blankLabel; select.append(blank);
    options.forEach((entry) => { const option = document.createElement('option'); option.value = entry.value; option.textContent = entry.label; select.append(option); });
    select.value = value;
  }

  function thumbnailUrl(video) {
    if (video.thumbnailUrl) return video.thumbnailUrl;
    try {
      const url = new URL(video.url);
      const host = url.hostname.replace(/^www\./, '');
      let videoId = '';
      if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || '';
      if (host.endsWith('youtube.com')) videoId = url.searchParams.get('v') || (url.pathname.match(/^\/(?:shorts|embed|v)\/([^/?#]+)/) || [])[1] || '';
      if (videoId) return 'https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg';
    } catch (_) {}
    return '';
  }
  function formatDate(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(value)); }
    catch (_) { return ''; }
  }
  function progressPercent(video) {
    if (!video.durationSeconds || video.progressSeconds == null) return null;
    return Math.max(0, Math.min(100, Math.round((video.progressSeconds / video.durationSeconds) * 100)));
  }

  function createMenuButton(label, handler, className) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; if (className) button.className = className;
    button.addEventListener('click', (event) => { event.stopPropagation(); handler(); const details = button.closest('details'); if (details) details.open = false; });
    return button;
  }

  function createCard(video) {
    const card = document.createElement('article'); card.className = 'vl-card'; card.dataset.id = video.id;
    const open = document.createElement('button'); open.type = 'button'; open.className = 'vl-open'; open.setAttribute('aria-label', (video.title || '動画') + 'を開く');
    const thumb = document.createElement('div'); thumb.className = 'vl-thumb';
    const fallback = document.createElement('div'); fallback.className = 'vl-thumb-fallback'; const mark = document.createElement('b'); mark.textContent = '▶'; const service = document.createElement('span'); service.textContent = Data.deriveService(video.url, video.a) || 'VIDEO'; fallback.append(mark, service); thumb.append(fallback);
    const thumbSrc = thumbnailUrl(video);
    if (thumbSrc) { const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = thumbSrc; img.addEventListener('load', () => { fallback.hidden = true; }); img.addEventListener('error', () => { img.remove(); fallback.hidden = false; }); thumb.append(img); }
    const body = document.createElement('div'); body.className = 'vl-body';
    const title = document.createElement('div'); title.className = 'vl-title'; title.textContent = video.title || (Data.deriveService(video.url, video.a) + ' / ' + video.b);
    const meta = document.createElement('div'); meta.className = 'vl-meta';
    const serviceText = document.createElement('span'); serviceText.textContent = Data.deriveService(video.url, video.a) || video.a || 'video'; meta.append(serviceText);
    if (video.folderId && folderName(video.folderId)) { const f = document.createElement('span'); f.textContent = '· ' + folderName(video.folderId); meta.append(f); }
    if (video.watchStatus) { const s = document.createElement('span'); s.textContent = '· ' + STATUS_LABELS[video.watchStatus]; meta.append(s); }
    if (video.lastOpenedAt) { const l = document.createElement('span'); l.textContent = '· ' + formatDate(video.lastOpenedAt); meta.append(l); }
    if (video.openCount) { const c = document.createElement('span'); c.textContent = '· ' + video.openCount + '回'; meta.append(c); }
    body.append(title, meta);
    if (video.tags.length) { const tags = document.createElement('div'); tags.className = 'vl-tags'; video.tags.slice(0, 4).forEach((tag) => { const span = document.createElement('span'); span.className = 'vl-tag'; span.textContent = '#' + tag; tags.append(span); }); body.append(tags); }
    const percent = progressPercent(video); if (percent != null) { const progress = document.createElement('div'); progress.className = 'vl-progress'; const inner = document.createElement('i'); inner.style.width = percent + '%'; progress.append(inner); body.append(progress); }
    open.append(thumb, body); open.addEventListener('click', () => openVideo(video.id));

    const actions = document.createElement('div'); actions.className = 'vl-card-actions';
    const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'vl-round' + (video.favorite ? ' active' : ''); favorite.textContent = video.favorite ? '★' : '☆'; favorite.setAttribute('aria-label', 'お気に入り'); favorite.addEventListener('click', (event) => { event.stopPropagation(); updateMeta(video.id, { favorite: !video.favorite }); render(); });
    const menu = document.createElement('details'); menu.className = 'vl-menu'; const summary = document.createElement('summary'); summary.className = 'vl-round'; summary.textContent = '⋯'; summary.setAttribute('aria-label', 'その他');
    const panel = document.createElement('div'); panel.className = 'vl-menu-panel';
    panel.append(createMenuButton('編集', () => openEditor(video.id)));
    if (video.url) panel.append(createMenuButton('元ページを開く', () => window.open(video.url, '_blank', 'noopener')));
    panel.append(createMenuButton(video.watchStatus === 'later' ? '「あとで見る」を解除' : 'あとで見る', () => { updateMeta(video.id, { watchStatus: video.watchStatus === 'later' ? '' : 'later' }); render(); }));
    panel.append(createMenuButton(state.showHidden ? '表示に戻す' : '動画を非表示', () => { updateMeta(video.id, { hidden: !state.showHidden }); render(); }));
    panel.append(createMenuButton('削除', () => deleteVideoFromLibrary(video.id), 'danger'));
    menu.append(summary, panel); actions.append(favorite, menu); card.append(open, actions); return card;
  }

  function renderFilterOptions(videos) {
    const currentFolder = state.folderId, currentTag = state.tag, currentService = state.service;
    fillSelect(dom.folder, state.folders.map((folder) => ({ value: folder.id, label: folder.name })), currentFolder, '全フォルダ');
    const tags = [...new Set(videos.flatMap((video) => video.tags))].sort((a, b) => a.localeCompare(b, 'ja'));
    fillSelect(dom.tag, tags.map((tag) => ({ value: tag, label: '#' + tag })), currentTag, '全タグ');
    const services = [...new Set(videos.map((video) => Data.deriveService(video.url, video.a)).filter(Boolean))].sort();
    fillSelect(dom.service, services.map((service) => ({ value: service, label: service })), currentService, '全サービス');
    dom.sort.replaceChildren(); Object.entries(SORT_LABELS).forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; dom.sort.append(option); }); dom.sort.value = state.sort;
    fillSelect(dom.editFolder, state.folders.map((folder) => ({ value: folder.id, label: folder.name })), dom.editFolder.value, '未分類');
  }

  function render() {
    loadLibraryState();
    const all = effectiveVideos();
    const scoped = all.filter((video) => video.hidden === state.showHidden);
    renderFilterOptions(scoped);
    const filtered = Data.filterVideos(scoped, { query: state.query, quick: state.quick === 'all' ? '' : state.quick, folderId: state.folderId, tag: state.tag, service: state.service, folders: state.folders });
    const videos = Data.sortVideos(filtered, state.sort);
    dom.quick.querySelectorAll('[data-quick]').forEach((button) => button.classList.toggle('active', button.dataset.quick === state.quick));
    dom.view.textContent = state.view === 'card' ? '▤' : '▦'; dom.view.title = state.view === 'card' ? 'コンパクト表示へ' : 'カード表示へ';
    dom.hiddenBtn.textContent = state.showHidden ? '動画一覧' : '非表示 (' + all.filter((video) => video.hidden).length + ')';
    dom.hiddenBtn.setAttribute('aria-pressed', state.showHidden ? 'true' : 'false');
    dom.count.textContent = videos.length + ' / ' + scoped.length + '件';
    dom.results.replaceChildren();
    if (!videos.length) { const empty = document.createElement('div'); empty.className = 'vl-empty'; empty.innerHTML = '<strong>' + (state.showHidden ? '非表示の動画はありません' : '該当する動画がありません') + '</strong><span>検索やフィルタを変更するか、動画を追加できます。</span>'; dom.results.append(empty); return; }
    const grid = document.createElement('div'); grid.className = 'vl-grid' + (state.view === 'compact' ? ' compact' : ''); videos.forEach((video) => grid.append(createCard(video))); dom.results.append(grid);
  }

  function parseThroughLegacy(url) {
    if (!dom.legacyUrlInput || !dom.legacyAInput || !dom.legacyBInput) return null;
    const oldUrl = dom.legacyUrlInput.value, oldA = dom.legacyAInput.value, oldB = dom.legacyBInput.value;
    dom.legacyUrlInput.value = url || '';
    dom.legacyAInput.value = '';
    dom.legacyBInput.value = '';
    dom.legacyUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
    const result = { a: text(dom.legacyAInput.value), b: text(dom.legacyBInput.value) };
    dom.legacyUrlInput.value = oldUrl; dom.legacyAInput.value = oldA; dom.legacyBInput.value = oldB;
    return result.a && result.b ? result : null;
  }

  function invokeLegacyAdd({ title, a, b }) {
    if (!dom.legacyConfirmAdd || !dom.legacyTitleInput || !dom.legacyAInput || !dom.legacyBInput) throw new Error('既存の動画追加機能を利用できません。');
    const before = new Set((readJson(VIDEO_KEY, []) || []).map((video) => String(video.id)));
    dom.legacyTitleInput.value = title || '';
    dom.legacyAInput.value = a;
    dom.legacyBInput.value = b;
    dom.legacyConfirmAdd.click();
    const afterRaw = readJson(VIDEO_KEY, []);
    const after = Array.isArray(afterRaw) ? afterRaw : [];
    const created = after.find((video) => !before.has(String(video.id)));
    if (!created) throw new Error('動画を追加できませんでした。サービス名と動画IDを確認してください。');
    return created;
  }

  function legacyNodeFor(base) {
    if (!dom.legacyItems || !base) return null;
    const groups = [...dom.legacyItems.querySelectorAll('.videoGroup')];
    const candidates = [];
    groups.forEach((group) => {
      const header = group.querySelector('.videoGroupHeader');
      if (!header || text(header.textContent) !== text(base.a)) return;
      group.querySelectorAll('.videoItem').forEach((item) => {
        const idLabel = item.querySelector('.videoItemId');
        if (idLabel && text(idLabel.textContent) === 'B: ' + text(base.b)) candidates.push(item);
      });
    });
    if (candidates.length <= 1) return candidates[0] || null;
    return candidates.find((item) => text((item.querySelector('.videoItemTitle') || {}).textContent) === text(base.title)) || candidates[0];
  }

  function invokeLegacyDelete(base) {
    const node = legacyNodeFor(base); const button = node && node.querySelector('.videoDeleteBtn');
    if (!button) return false;
    button.click(); return true;
  }

  function effectiveFieldsForEditor(videoId) {
    const base = baseById(videoId); return base ? effectiveVideo(base) : null;
  }

  function fillEditorFolders(selected) {
    fillSelect(dom.editFolder, state.folders.map((folder) => ({ value: folder.id, label: folder.name })), selected || '', '未分類');
  }

  function renderSuggestedTags(selectedTags) {
    if (!dom.suggestedTags) return;
    dom.suggestedTags.replaceChildren();
    const current = new Set(Data.parseTags(selectedTags || ''));
    const tags = [...new Set(effectiveVideos().flatMap((video) => video.tags))].sort((a, b) => a.localeCompare(b, 'ja'));
    tags.forEach((tag) => {
      const suggestedTag = document.createElement('button');
      suggestedTag.type = 'button'; suggestedTag.className = 'vl-suggested-tag'; suggestedTag.textContent = '#' + tag;
      suggestedTag.setAttribute('aria-label', 'タグ「' + tag + '」を追加');
      suggestedTag.addEventListener('click', () => {
        if (current.has(tag)) return;
        current.add(tag); dom.tags.value = [...current].join(', ');
      });
      dom.suggestedTags.append(suggestedTag);
    });
  }

  function setUrlEditing(enabled) {
    if (!dom.url || !dom.urlEdit) return;
    dom.url.readOnly = !enabled;
    dom.urlEdit.textContent = enabled ? '編集中' : '編集';
    dom.urlEdit.disabled = enabled;
  }

  function setSheetVisible(visible) {
    dom.sheet.hidden = !visible; dom.sheet.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible) { state.editorId = null; state.sheetMode = null; dom.formError.textContent = ''; }
  }
  function pushSheetState() {
    const next = { ...(history.state || {}), videoLibrarySheet: true };
    history.pushState(next, '', location.href);
  }
  function closeSheet() {
    if (history.state && history.state.videoLibrarySheet) history.back(); else setSheetVisible(false);
  }

  function openEditor(videoId) {
    state.sheetMode = videoId ? 'edit' : 'add'; state.editorId = videoId || null;
    dom.folderManager.hidden = true; dom.form.hidden = false; dom.sheetTitle.textContent = videoId ? '動画を編集' : '動画を追加'; dom.deleteBtn.hidden = !videoId;
    const video = videoId ? effectiveFieldsForEditor(videoId) : Data.normalizeVideo({ id: 'draft', addedAt: Date.now() });
    const base = videoId ? baseById(videoId) : null;
    dom.url.value = videoId ? video.url : '';
    setUrlEditing(!videoId);
    dom.title.value = videoId ? video.title : '';
    fillEditorFolders(videoId ? video.folderId : '');
    dom.statusSelect.value = videoId ? video.watchStatus : '';
    dom.tags.value = videoId ? video.tags.join(', ') : '';
    renderSuggestedTags(dom.tags.value);
    dom.memo.value = videoId ? video.memo : '';
    dom.favorite.checked = videoId ? video.favorite : false;
    dom.legacyService.value = base ? text(base.a) : '';
    dom.legacyId.value = base ? text(base.b) : '';
    dom.thumbnail.value = videoId ? video.thumbnailUrl : '';
    dom.rotateLeftStart.value = videoId && video.rotateLeftStartSeconds != null ? String(video.rotateLeftStartSeconds) : '';
    dom.rotateLeftEnd.value = videoId && video.rotateLeftEndSeconds != null ? String(video.rotateLeftEndSeconds) : '';
    dom.formError.textContent = '';
    setSheetVisible(true); pushSheetState(); setTimeout(() => dom.url.focus(), 30);
  }

  function openFolderManager() {
    state.sheetMode = 'folders'; state.editorId = null; dom.form.hidden = true; dom.folderManager.hidden = false; dom.sheetTitle.textContent = '動画フォルダ'; dom.newFolder.value = ''; renderFolderManager(); setSheetVisible(true); pushSheetState(); setTimeout(() => dom.newFolder.focus(), 30);
  }

  function renderFolderManager() {
    dom.folderList.replaceChildren();
    if (!state.folders.length) { const empty = document.createElement('div'); empty.className = 'vl-empty'; empty.textContent = 'フォルダはまだありません'; dom.folderList.append(empty); return; }
    state.folders.forEach((folder) => {
      const row = document.createElement('div'); row.className = 'vl-folder-row'; const name = document.createElement('span'); name.textContent = folder.name;
      const rename = document.createElement('button'); rename.type = 'button'; rename.textContent = '名前変更'; rename.addEventListener('click', () => { const next = prompt('フォルダ名', folder.name); if (next == null || !text(next)) return; folder.name = text(next); persistAux(); renderFolderManager(); render(); });
      const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = '削除'; del.addEventListener('click', () => { if (!confirm('「' + folder.name + '」を削除しますか？動画自体は削除されません。')) return; state.folders = state.folders.filter((entry) => entry.id !== folder.id); Object.keys(state.meta).forEach((videoId) => { if (state.meta[videoId] && state.meta[videoId].folderId === folder.id) state.meta[videoId] = { ...state.meta[videoId], folderId: null, updatedAt: Date.now() }; }); persistAux(); state.folderId = state.folderId === folder.id ? '' : state.folderId; renderFolderManager(); render(); });
      row.append(name, rename, del); dom.folderList.append(row);
    });
  }

  function createFolder() {
    const name = text(dom.newFolder.value); if (!name) return;
    if (state.folders.some((folder) => folder.name.toLocaleLowerCase('ja') === name.toLocaleLowerCase('ja'))) { setStatus('同名のフォルダがあります', true); return; }
    state.folders.push({ id: id('vf'), name, createdAt: Date.now() }); dom.newFolder.value = ''; persistAux(); renderFolderManager(); render();
  }

  function saveEditor(event) {
    event.preventDefault(); dom.formError.textContent = '';
    const existingBase = state.editorId ? baseById(state.editorId) : null;
    const parsed = parseThroughLegacy(text(dom.url.value));
    const a = text(dom.legacyService.value) || (parsed && parsed.a) || (existingBase && text(existingBase.a)) || '';
    const b = text(dom.legacyId.value) || (parsed && parsed.b) || (existingBase && text(existingBase.b)) || '';
    if (!a || !/^[a-zA-Z0-9]+$/.test(a)) { dom.formError.textContent = 'サービス名を英数字で入力してください。'; return; }
    if (!b || !/^\d+$/.test(b)) { dom.formError.textContent = '動画IDを数字で入力してください。'; return; }
    const title = text(dom.title.value);
    const url = text(dom.url.value) || Data.legacyUrl(a, b);
    const rotationStartRaw = text(dom.rotateLeftStart.value);
    const rotationEndRaw = text(dom.rotateLeftEnd.value);
    let rotateLeftStartSeconds = null;
    let rotateLeftEndSeconds = null;
    if (rotationStartRaw || rotationEndRaw) {
      if (!rotationStartRaw || !rotationEndRaw) {
        dom.formError.textContent = '自動回転は開始秒と終了秒を両方入力してください。';
        return;
      }
      rotateLeftStartSeconds = Number(rotationStartRaw);
      rotateLeftEndSeconds = Number(rotationEndRaw);
      if (!Number.isFinite(rotateLeftStartSeconds) || rotateLeftStartSeconds < 0 || !Number.isFinite(rotateLeftEndSeconds) || rotateLeftEndSeconds <= rotateLeftStartSeconds) {
        dom.formError.textContent = '自動回転は「0以上の開始秒 < 終了秒」で入力してください。';
        return;
      }
    }
    const patch = {
      title, url, folderId: text(dom.editFolder.value) || null, tags: Data.parseTags(dom.tags.value), memo: text(dom.memo.value), favorite: !!dom.favorite.checked,
      watchStatus: text(dom.statusSelect.value), thumbnailUrl: text(dom.thumbnail.value),
      rotateLeftStartSeconds, rotateLeftEndSeconds,
    };
    try {
      let targetId = state.editorId;
      if (!existingBase) {
        const created = invokeLegacyAdd({ title, a, b }); targetId = created.id;
      } else if (text(existingBase.a) !== a || text(existingBase.b) !== b) {
        const created = invokeLegacyAdd({ title: title || existingBase.title, a, b });
        if (!invokeLegacyDelete(existingBase)) { invokeLegacyDelete(created); throw new Error('元の動画を置き換えられませんでした。'); }
        delete state.meta[state.editorId]; targetId = created.id;
      }
      state.meta[targetId] = { ...(state.meta[targetId] || {}), ...patch, updatedAt: Date.now() };
      persistAux(); loadLibraryState(); render(); closeSheet();
    } catch (error) { dom.formError.textContent = error && error.message ? error.message : '保存できませんでした。'; }
  }

  function deleteVideoFromLibrary(videoId) {
    const base = baseById(videoId); if (!base) return;
    const video = effectiveVideo(base); if (!confirm('「' + (video.title || 'この動画') + '」を削除しますか？')) return;
    if (!invokeLegacyDelete(base)) { setStatus('削除できませんでした。ページを再読み込みして再試行してください。', true); return; }
    delete state.meta[videoId]; persistAux(); loadLibraryState(); render();
    if (state.editorId === videoId) closeSheet();
  }

  function openVideo(videoId) {
    const base = baseById(videoId); if (!base) return; const video = effectiveVideo(base);
    updateMeta(videoId, { openCount: (video.openCount || 0) + 1, lastOpenedAt: Date.now() });
    if (base.a && base.b && dom.videoPlayerIframe && dom.videoPlayerTitle) {
      dom.videoPlayerTitle.textContent = video.title || (base.a + ' / ' + base.b);
      dom.videoPlayerIframe.src = 'https://www.' + base.a + '.com/embed/' + base.b;
      location.hash = 'screen=video-player';
    } else if (video.url) window.open(video.url, '_blank', 'noopener');
  }

  function bindEvents() {
    dom.search.addEventListener('input', () => { state.query = dom.search.value; render(); });
    dom.quick.addEventListener('click', (event) => { const button = event.target.closest('[data-quick]'); if (!button) return; state.quick = button.dataset.quick; savePrefs(); render(); });
    dom.folder.addEventListener('change', () => { state.folderId = dom.folder.value; render(); });
    dom.tag.addEventListener('change', () => { state.tag = dom.tag.value; render(); });
    dom.service.addEventListener('change', () => { state.service = dom.service.value; render(); });
    dom.sort.addEventListener('change', () => { state.sort = dom.sort.value; savePrefs(); render(); });
    dom.view.addEventListener('click', () => { state.view = state.view === 'card' ? 'compact' : 'card'; savePrefs(); render(); });
    dom.hiddenBtn.addEventListener('click', () => { state.showHidden = !state.showHidden; state.query = ''; dom.search.value = ''; state.folderId = ''; state.tag = ''; state.service = ''; render(); });
    dom.add.addEventListener('click', () => openEditor(null)); dom.foldersBtn.addEventListener('click', openFolderManager);
    dom.sheetClose.addEventListener('click', closeSheet); dom.cancel.addEventListener('click', closeSheet); dom.form.addEventListener('submit', saveEditor); dom.deleteBtn.addEventListener('click', () => state.editorId && deleteVideoFromLibrary(state.editorId));
    dom.urlEdit.addEventListener('click', () => setUrlEditing(true));
    dom.createFolder.addEventListener('click', createFolder); dom.newFolder.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); createFolder(); } });
    dom.url.addEventListener('input', () => { const parsed = parseThroughLegacy(text(dom.url.value)); if (parsed) { dom.legacyService.value = parsed.a; dom.legacyId.value = parsed.b; } });
    dom.sheet.addEventListener('click', (event) => { if (event.target === dom.sheet) closeSheet(); });
    window.addEventListener('popstate', () => { if (!(history.state && history.state.videoLibrarySheet)) setSheetVisible(false); });
    window.addEventListener('hashchange', () => { if (!location.hash.includes('screen=video-player') && dom.videoPlayerIframe) dom.videoPlayerIframe.src = ''; });
  }

  function init() {
    if (!document.getElementById('videoListSection')) return;
    injectStyles(); loadPrefs(); loadLibraryState(); if (!setupMarkup()) return; bindEvents(); dom.search.value = state.query; render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), { once: true });
  else setTimeout(init, 0);
})();
