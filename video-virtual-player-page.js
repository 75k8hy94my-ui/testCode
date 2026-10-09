(() => {
  'use strict';
  const page = document.getElementById('virtualVideoPlayer');
  const Edit = window.MangaReaderVideoVirtualEdit;
  const Store = window.MangaReaderVideoVirtualEditStore;
  const Playback = window.MangaReaderVideoVirtualPlayback;
  const Data = window.MangaReaderVideoData;
  const access = window.MangaReaderMediaAccess;
  if (!page || !Edit || !Store || !Playback || !Data) {
    if (page) page.textContent = '動画再生機能を初期化できませんでした。';
    return;
  }
  const projectId = new URLSearchParams(location.search).get('project') || '';
  let player = null;
  let loaded = false;
  let blocked = false;
  let refs = {};
  let segments = [];
  let scrubbing = false;
  const allowed = () => !!access && access.canReadProtectedData() === true;
  function stopPlayer() {
    if (player) player.destroy();
    player = null;
  }
  function showBlock(title, message) {
    stopPlayer();
    loaded = false;
    refs = {};
    segments = [];
    scrubbing = false;
    const section = document.createElement('section');
    section.className = 'vvpNotice vpnRouteGate';
    const heading = document.createElement('h2');
    heading.textContent = title;
    const lead = document.createElement('p');
    lead.textContent = message;
    const back = document.createElement('a');
    back.className = 'vvpLink';
    back.href = 'video-virtual-editor.html' + (projectId ? '?project=' + encodeURIComponent(projectId) : '');
    back.textContent = '編集画面へ';
    const library = document.createElement('a');
    library.className = 'vvpLink'; library.href = 'video.html'; library.textContent = '動画一覧へ';
    section.append(heading, lead);
    if (!allowed()) {
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'vvpButton';
      retry.dataset.vpnStatusButton = '1'; retry.dataset.vpnRecheckButton = '1';
      retry.textContent = 'VPNを再確認';
      section.append(retry);
    }
    section.append(back, library);
    page.replaceChildren(section);
    if (access && typeof access.syncUi === 'function') access.syncUi();
  }
  function read(key, fallback) {
    if (!allowed()) throw new Error('VPN接続の確認が必要です。');
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  }
  const format = (seconds) => {
    const whole = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const rounded = Math.floor(whole);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const secs = String(rounded % 60).padStart(2, '0');
    return hours ? hours + ':' + String(minutes).padStart(2, '0') + ':' + secs : minutes + ':' + secs;
  };
  function update(snapshot) {
    if (!allowed() || !loaded) return;
    refs.play.textContent = snapshot.requestedPlay ? '一時停止' : (snapshot.phase === 'finished' ? '最初から再生' : '再生');
    if (!scrubbing) {
      refs.seek.value = String(Math.max(0, Math.min(snapshot.totalSeconds, snapshot.virtualSeconds)));
      refs.time.textContent = format(snapshot.virtualSeconds) + ' / ' + format(snapshot.totalSeconds);
    }
    refs.status.textContent = snapshot.error || snapshot.message || (snapshot.phase === 'idle' ? '再生ボタンを押してください。' : '');
    refs.status.dataset.error = snapshot.phase === 'error' ? '1' : '0';
    segments.forEach((button, index) =>
      button.setAttribute('aria-current', String(index === snapshot.clipIndex)));
  }
  function loadPlayer() {
    if (loaded || !allowed() || blocked) return;
    if (!projectId) {
      showBlock('編集プロジェクトを指定してください', '編集画面から保存済みの編集プロジェクトを選択してください。');
      return;
    }
    const repo = Store.createRepository();
    const project = repo.get(projectId);
    if (!project) {
      showBlock('編集プロジェクトが見つかりません', '削除または移動された可能性があります。');
      return;
    }
    const diagnosis = repo.inspect(projectId);
    if (!diagnosis || !diagnosis.usable) {
      showBlock('素材が変更されています', '元のMP4の削除・URL変更・形式変更を検出しました。安全のため再生しません。');
      return;
    }
    const videos = read(Store.VIDEO_KEY, []);
    const meta = read(Store.META_KEY, {});
    if (!Array.isArray(videos) || !meta || typeof meta !== 'object' || Array.isArray(meta)) {
      throw new TypeError('動画データが不正です。');
    }
    const sources = videos.map((video) => {
      const videoMeta = meta[video.id] && typeof meta[video.id] === 'object' && !Array.isArray(meta[video.id])
        ? meta[video.id] : {};
      const normalized = Data.normalizeVideo({ ...video, ...videoMeta,
        id: video.id, a: video.a, b: video.b, addedAt: video.addedAt });
      return { id: String(video.id), url: normalized.url, title: normalized.title || String(video.id) };
    });
    // A source can change between inspect() and reading storage. Check the
    // fingerprints again against the exact URLs passed to the media element.
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    const fingerprints = new Map(project.sourceFingerprints.map((entry) => [entry.sourceVideoId, entry.fingerprint]));
    const validated = Edit.validateSources(project.edit, sources);
    validated.clips.forEach((clip) => {
      const source = sourceMap.get(clip.sourceVideoId);
      if (!source || fingerprints.get(clip.sourceVideoId) !== Store.sourceFingerprint(source.url)) {
        throw new Error('元のMP4の登録内容が変更されています。');
      }
    });
    page.innerHTML = [
      '<section class="vvpPanel"><h2 class="vvpTitle" data-title></h2>',
      '<p class="vvpFootnote">動画本体は結合せず、登録済みMP4の区間を指定順に再生します。</p></section>',
      '<section class="vvpPanel"><div class="vvpVideoBox"><video data-media playsinline preload="none" aria-label="編集済みMP4の再生"></video></div>',
      '<div class="vvpControls"><button type="button" class="vvpButton primary" data-play>再生</button>',
      '<span class="vvpTime" data-time>0:00 / 0:00</span>',
      '<input class="vvpSeek" data-seek type="range" min="0" max="0" value="0" step="0.1" aria-label="編集版の再生位置"></div>',
      '<p class="vvpStatus" role="status" aria-live="polite" data-status></p>',
      '<p class="vvpFootnote">MP4の切替時は通信・シークのため一時停止することがあります。配信元によっては途中再生ができません。</p></section>',
      '<section class="vvpPanel"><h3>再生区間</h3><div class="vvpSegments" data-segments></div></section>',
      '<nav class="vvpLinks"><a class="vvpLink" data-edit>編集画面に戻る</a>',
      '<a class="vvpLink" href="video.html">動画一覧へ</a></nav>',
    ].join('');
    const $ = (query) => page.querySelector(query);
    refs = {
      play: $('[data-play]'), seek: $('[data-seek]'), time: $('[data-time]'),
      status: $('[data-status]'), media: $('[data-media]'),
      segments: $('[data-segments]'),
    };
    $('[data-title]').textContent = project.title;
    $('[data-edit]').href = 'video-virtual-editor.html?project=' + encodeURIComponent(projectId);
    document.title = project.title + ' — 編集済み動画';
    let offset = 0;
    segments = validated.clips.map((clip, index) => {
      const start = offset;
      offset += clip.endSeconds - clip.startSeconds;
      const button = document.createElement('button');
      button.className = 'vvpSegment';
      button.type = 'button';
      button.setAttribute('aria-current', 'false');
      const label = document.createElement('span');
      label.textContent = (index + 1) + '. ' + (sourceMap.get(clip.sourceVideoId)?.title || '動画');
      const time = document.createElement('small');
      time.textContent = format(clip.startSeconds) + ' – ' + format(clip.endSeconds);
      button.append(label, time);
      button.addEventListener('click', () => {
        if (allowed() && player) player.seek(start);
      });
      refs.segments.append(button);
      return button;
    });
    refs.seek.max = String(offset);
    loaded = true;
    player = Playback.createController({
      video: refs.media, edit: validated, sources,
      onState: update,
    });
    refs.play.addEventListener('click', () => {
      if (!allowed() || !player) return;
      if (player.snapshot().requestedPlay) player.pause();
      else player.play();
    });
    refs.seek.addEventListener('input', () => {
      if (!allowed() || !player) return;
      scrubbing = true;
      refs.time.textContent = format(Number(refs.seek.value)) + ' / ' + format(player.snapshot().totalSeconds);
    });
    refs.seek.addEventListener('change', () => {
      const seconds = Number(refs.seek.value);
      scrubbing = false;
      if (allowed() && player) player.seek(seconds);
    });
  }
  function handleAccess() {
    if (!allowed()) {
      showBlock('VPN接続が必要です', 'VPN接続を確認できるまで動画情報の読み込み・再生を停止します。');
      return;
    }
    if (!loaded && !blocked) {
      try { loadPlayer(); }
      catch (error) {
        blocked = true;
        showBlock('動画を再生できません', error.message || '再生データに問題があります。');
      }
    }
  }
  document.addEventListener('manga-reader-vpn-status', handleAccess);
  window.addEventListener('storage', (event) => {
    if (!loaded || !allowed()) return;
    if (event.key === Store.VIDEO_KEY || event.key === Store.META_KEY || event.key === null) {
      blocked = true;
      showBlock('動画情報が更新されました', '別のタブで素材または編集内容が変更されました。再読み込みしてから再生してください。');
    }
  });
  window.addEventListener('pagehide', stopPlayer);
  window.addEventListener('pageshow', () => {
    if (!player) { loaded = false; blocked = false; handleAccess(); }
  });
  handleAccess();
})();
