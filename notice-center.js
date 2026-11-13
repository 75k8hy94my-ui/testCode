(() => {
  'use strict';
  if (window.TestCodeNotices) return;
  const doc = document;
  const notices = new Map();
  const mediaFailures = new Set();
  let panelOpen = false;
  let lastSyncState = '';
  const guest = () => window.TestCodeGuest?.isActive() === true;
  const access = () => window.MangaReaderMediaAccess;
  const allowed = () => guest() || access()?.canReadProtectedData?.() === true;
  const authenticated = () => guest() || Boolean(window.MangaVault?.loadSession?.()?.user && window.MangaVault?.loadActive?.());
  const node = (tag, cls, value) => {
    const element = doc.createElement(tag);
    if (cls) element.className = cls;
    if (value != null) element.textContent = value;
    return element;
  };
  function setNotice(id, title, body, href, severity = 'warning') {
    notices.set(id, { id, title, body, href, severity });
    render();
  }
  function removeNotice(id) { if (notices.delete(id)) render(); }
  function refresh() {
    if (!authenticated()) {
      notices.clear();
      mediaFailures.clear();
      panelOpen = false;
      render();
      return;
    }
    if (!guest()) {
      const gate = access();
      const state = gate?.getStatus?.();
      if (state === 'blocked') setNotice('vpn', 'VPN接続を確認できません', '保護された漫画・動画を閲覧するにはVPN判定を確認してください。', 'profile.html');
      else removeNotice('vpn');
      if (window.MangaVault?.hasPendingLocalChanges?.()) {
        setNotice('sync-pending', '未同期の変更があります', '端末上に変更が保存されていますが、クラウドへの反映が完了していません。', 'sync.html');
      } else removeNotice('sync-pending');
    } else {
      removeNotice('vpn');
      removeNotice('sync-pending');
      removeNotice('sync-error');
    }
    if (!allowed()) {
      mediaFailures.clear();
      [...notices.keys()].filter(id => id.startsWith('media:')).forEach(id => notices.delete(id));
    }
    render();
  }
  function render() {
    const button = doc.getElementById('testCodeNoticeTrigger');
    const panel = doc.getElementById('testCodeNoticePanel');
    if (!button || !panel) return;
    const visible = authenticated();
    button.hidden = !visible;
    if (!visible) { panel.hidden = true; return; }
    const entries = [...notices.values()];
    button.setAttribute('aria-label', '通知' + (entries.length ? ' ' + entries.length + '件' : ''));
    button.setAttribute('aria-expanded', String(panelOpen));
    const count = button.querySelector('.tcNoticeCount');
    count.textContent = entries.length > 99 ? '99+' : String(entries.length);
    count.hidden = entries.length === 0;
    panel.hidden = !panelOpen;
    panel.replaceChildren();
    const heading = node('div', 'tcNoticeHeading');
    heading.append(node('strong', '', 'お知らせ'));
    const close = node('button', 'tcNoticeClose', '閉じる');
    close.type = 'button';
    close.addEventListener('click', () => { panelOpen = false; render(); button.focus(); });
    heading.append(close);
    panel.append(heading);
    if (!entries.length) { panel.append(node('p', 'tcNoticeEmpty', '現在、お知らせはありません。')); return; }
    entries.forEach(item => {
      const section = node('section', 'tcNoticeItem');
      section.dataset.severity = item.severity;
      section.append(node('strong', '', item.title), node('p', '', item.body));
      if (item.href) {
        const link = node('a', '', '確認する');
        link.href = item.href;
        section.append(link);
      }
      panel.append(section);
    });
  }
  function install() {
    if (doc.getElementById('testCodeNoticeTrigger')) return;
    const button = node('button', 'tcNoticeTrigger');
    button.id = 'testCodeNoticeTrigger';
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'testCodeNoticePanel');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>';
    button.append(node('span', 'tcNoticeCount'));
    button.addEventListener('click', () => { panelOpen = !panelOpen; refresh(); });
    const panel = node('aside', 'tcNoticePanel');
    panel.id = 'testCodeNoticePanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'お知らせ一覧');
    panel.hidden = true;
    doc.body.append(button, panel);
    refresh();
  }
  doc.addEventListener('manga-reader-vpn-status', () => { refresh(); });
  doc.addEventListener('manga-vault-sync-state', (event) => {
    if (!authenticated() || guest()) return;
    const detail = event.detail || {};
    lastSyncState = detail.state || '';
    if (lastSyncState === 'error' || lastSyncState === 'conflict') {
      setNotice('sync-error', lastSyncState === 'conflict' ? '同期データが競合しています' : 'クラウド同期に失敗しました',
        lastSyncState === 'conflict' ? '変更内容を確認し、競合を解決してください。' : '端末の変更は保持されています。同期画面で状態を確認してください。', 'sync.html', 'error');
    } else if (lastSyncState === 'success') removeNotice('sync-error');
    refresh();
  });
  doc.addEventListener('error', event => {
    const target = event.target;
    if (!target || !['IMG', 'VIDEO', 'SOURCE'].includes(target.tagName)) return;
    if (!authenticated() || !allowed()) return;
    const route = location.pathname.split('/').pop();
    if (!['manga.html','video.html','reader.html','video-player.html'].includes(route)) return;
    const url = target.currentSrc || target.src || target.getAttribute('src') || '';
    if (!/^https?:\/\//i.test(url)) return;
    const type = route.includes('video') ? '動画' : '漫画';
    const key = 'media:' + type;
    if (mediaFailures.has(type + ':' + url)) return;
    mediaFailures.add(type + ':' + url);
    setNotice(key, type + 'のURLを読み込めませんでした', 'リンク切れの可能性があります。通信状態、アクセス権限、配信元の制限も考えられます。該当ページで確認してください。', route, 'warning');
  }, true);
  doc.addEventListener('click', event => {
    if (!panelOpen || event.target.closest('#testCodeNoticePanel,#testCodeNoticeTrigger')) return;
    panelOpen = false; render();
  });
  doc.addEventListener('keydown', event => { if (event.key === 'Escape' && panelOpen) { panelOpen = false; render(); } });
  window.addEventListener('manga-vault-cleared', refresh);
  window.addEventListener('manga-vault-active', refresh);
  window.addEventListener('pageshow', refresh);
  window.TestCodeNotices = Object.freeze({ refresh, report: (id, title, body, href) => {
    if (authenticated() && allowed()) setNotice('external:' + String(id), String(title), String(body), href || null);
  }, clear: id => removeNotice('external:' + String(id)) });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  window.setInterval(refresh, 15000);
})();
