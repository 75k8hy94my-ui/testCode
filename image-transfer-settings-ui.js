(function (root) {
  'use strict';
  if (!root || !root.document) return;

  const STYLE_ID = 'imageTransferSettingsStyle';
  const CARD_ID = 'profileImageTransferCard';
  let mountedCard = null;

  function settingsApi() {
    return root.ImageTransferSettings || null;
  }

  function ensureStyle() {
    if (root.document.getElementById(STYLE_ID)) return;
    const link = root.document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = 'image-transfer-settings.css?v=20260925-image-sync-ui';
    root.document.head.appendChild(link);
  }

  function profileContent() {
    return root.document.querySelector('.profileContent');
  }

  function modeMarkup() {
    return [
      ['data-saver', 'データ節約'],
      ['standard', '標準'],
      ['quality', '高画質優先'],
    ].map(([value, title]) =>
      '<label class="imageTransferMode">' +
        '<input type="radio" name="imageTransferMode" value="' + value + '">' +
        '<span><strong>' + title + '</strong></span>' +
      '</label>'
    ).join('');
  }

  function limitMarkup(api) {
    return api.DAILY_LIMIT_OPTIONS.map((bytes) => {
      const mb = Math.round(bytes / (1024 * 1024));
      return '<option value="' + bytes + '">' + mb + ' MB / 日</option>';
    }).join('');
  }

  function createCard(api) {
    const section = root.document.createElement('section');
    section.className = 'profileCard imageTransferCard';
    section.id = CARD_ID;
    section.innerHTML =
      '<div class="imageTransferHeading">' +
        '<h3>画像通信</h3>' +
        '<span class="imageTransferLocalBadge">この端末のみ</span>' +
      '</div>' +
      '<label class="profileThemeRow imageTransferToggleRow">' +
        '<span><strong>VPN接続時のみクラウド画像を読み込む</strong></span>' +
        '<span class="iosSwitch"><input id="profileImageVpnRequired" type="checkbox" role="switch" aria-label="VPN接続時のみクラウド画像を読み込む"><span class="iosSwitchTrack" aria-hidden="true"></span></span>' +
      '</label>' +
      '<div class="imageTransferDivider"></div>' +
      '<fieldset class="imageTransferModes"><legend>通信モード</legend>' + modeMarkup() + '</fieldset>' +
      '<label class="imageTransferLimit"><span><strong>1日の画像通信上限</strong></span><select id="profileImageDailyLimit" aria-label="1日の画像通信上限">' + limitMarkup(api) + '</select></label>' +
      '<button class="imageTransferUsage" id="profileImageUsageButton" type="button" aria-haspopup="dialog" aria-controls="profileImageUsageDialog">' +
        '<div class="imageTransferUsageTop"><span>推定使用量</span><strong id="profileImageUsageTotal">—</strong></div>' +
        '<div class="imageTransferUsageBar" aria-hidden="true"><span id="profileImageUsageFill"></span></div>' +
      '</button>' +
      '<div class="imageTransferDialogBackdrop" id="profileImageUsageDialog" role="dialog" aria-modal="true" aria-labelledby="profileImageUsageDialogTitle" hidden>' +
        '<div class="imageTransferDialog" role="document">' +
          '<div class="imageTransferDialogHeader"><h4 id="profileImageUsageDialogTitle">推定使用量</h4><button class="imageTransferDialogClose" type="button" data-image-transfer-dialog-close aria-label="閉じる">×</button></div>' +
          '<dl class="imageTransferStats">' +
            '<div><dt>推計転送量</dt><dd id="profileImageEstimatedBytes">—</dd></div>' +
            '<div><dt>受信オブジェクト量</dt><dd id="profileImageObservedBytes">—</dd></div>' +
            '<div><dt>プレビュー</dt><dd id="profileImagePreviewBytes">—</dd></div>' +
            '<div><dt>高画質タイル</dt><dd id="profileImageZoomBytes">—</dd></div>' +
            '<div><dt>キャッシュで節約</dt><dd id="profileImageCacheSavedBytes">—</dd></div>' +
            '<div><dt>部分読込で節約</dt><dd id="profileImagePartialSavedBytes">—</dd></div>' +
            '<div><dt>Provider実測</dt><dd id="profileImageProviderBytes">未取得</dd></div>' +
          '</dl>' +
        '</div>' +
      '</div>';
    return section;
  }

  function findSessionCard(content) {
    return Array.from(content.querySelectorAll(':scope > .profileCard')).find((card) => {
      const heading = card.querySelector('h3');
      return heading && heading.textContent.trim() === 'セッション';
    }) || null;
  }

  function formatOrDash(api, bytes) {
    return Number(bytes) > 0 ? api.formatBytes(bytes) : '—';
  }

  function render() {
    const api = settingsApi();
    if (!api || !mountedCard || !mountedCard.isConnected) return;
    const state = api.load();
    const vpn = mountedCard.querySelector('#profileImageVpnRequired');
    if (vpn) vpn.checked = state.vpnRequired;
    mountedCard.querySelectorAll('input[name="imageTransferMode"]').forEach((radio) => {
      radio.checked = radio.value === state.networkMode;
    });
    const limit = mountedCard.querySelector('#profileImageDailyLimit');
    if (limit) limit.value = String(state.dailyLimitBytes);

    const used = Math.max(0, Number(state.limitUsageBytes) || 0);
    const max = Math.max(1, Number(state.dailyLimitBytes) || api.DEFAULT_DAILY_LIMIT_BYTES);
    const total = mountedCard.querySelector('#profileImageUsageTotal');
    if (total) total.textContent = api.formatBytes(used) + ' / ' + api.formatBytes(max);
    const fill = mountedCard.querySelector('#profileImageUsageFill');
    if (fill) fill.style.width = Math.min(100, (used / max) * 100).toFixed(1) + '%';

    const stats = state.stats || {};
    const estimated = Number(stats.estimatedBytes) > 0 ? stats.estimatedBytes : used;
    const values = {
      profileImageEstimatedBytes: formatOrDash(api, estimated),
      profileImageObservedBytes: formatOrDash(api, stats.observedBytes),
      profileImagePreviewBytes: formatOrDash(api, stats.previewBytes),
      profileImageZoomBytes: formatOrDash(api, stats.zoomBytes),
      profileImageCacheSavedBytes: formatOrDash(api, stats.cacheSavedBytes),
      profileImagePartialSavedBytes: formatOrDash(api, stats.partialSavedBytes),
      profileImageProviderBytes: stats.providerReportedBytes == null ? '未取得' : api.formatBytes(stats.providerReportedBytes),
    };
    Object.entries(values).forEach(([id, value]) => {
      const node = mountedCard.querySelector('#' + id);
      if (node) node.textContent = value;
    });
  }

  function bind(card, api) {
    const vpn = card.querySelector('#profileImageVpnRequired');
    if (vpn) vpn.addEventListener('change', () => api.setVpnRequired(vpn.checked));

    card.querySelectorAll('input[name="imageTransferMode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.checked) api.setNetworkMode(radio.value);
      });
    });

    const limit = card.querySelector('#profileImageDailyLimit');
    if (limit) limit.addEventListener('change', () => api.setDailyLimitBytes(Number(limit.value)));

    const usageButton = card.querySelector('#profileImageUsageButton');
    const dialog = card.querySelector('#profileImageUsageDialog');
    const closeButton = card.querySelector('[data-image-transfer-dialog-close]');
    const closeDialog = () => {
      if (!dialog || dialog.hidden) return;
      dialog.hidden = true;
      if (usageButton) usageButton.focus();
    };
    if (usageButton && dialog) usageButton.addEventListener('click', () => {
      dialog.hidden = false;
      if (closeButton) closeButton.focus();
    });
    if (closeButton) closeButton.addEventListener('click', closeDialog);
    if (dialog) dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dialog && !dialog.hidden) closeDialog();
    });
  }

  function mount() {
    const api = settingsApi();
    const content = profileContent();
    if (!api || !content) return false;
    ensureStyle();
    const existing = root.document.getElementById(CARD_ID);
    if (existing) {
      mountedCard = existing;
      render();
      return true;
    }
    const card = createCard(api);
    const sessionCard = findSessionCard(content);
    if (sessionCard) content.insertBefore(card, sessionCard);
    else content.appendChild(card);
    mountedCard = card;
    bind(card, api);
    render();
    return true;
  }

  function scheduleMount() {
    if (root.queueMicrotask) root.queueMicrotask(mount);
    else root.setTimeout(mount, 0);
  }

  root.document.addEventListener('home-profile-routechange', (event) => {
    if (event && event.detail && event.detail.route === 'profile') scheduleMount();
  });
  root.document.addEventListener('manga-reader-image-transfer-settings-changed', render);
  const statsEventName = settingsApi() && settingsApi().STATS_EVENT_NAME || 'manga-reader-image-transfer-stats-changed';
  root.document.addEventListener(statsEventName, render);

  root.ImageTransferSettingsUI = Object.freeze({ mount, render, STATS_EVENT_NAME: statsEventName });
  scheduleMount();
})(typeof window !== 'undefined' ? window : globalThis);
