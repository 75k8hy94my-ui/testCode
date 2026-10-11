(function (root) {
  'use strict';

  let activeMenuClose = null;

  function formatDuration(value) {
    const seconds = Math.floor(Number(value));
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours
      ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0')
      : minutes + ':' + String(remainder).padStart(2, '0');
  }

  function addMenu(card, titleRow, video, options, doc) {
    const wrap = doc.createElement('div'); wrap.className = 'videoCardMenuWrap';
    const trigger = doc.createElement('button'); trigger.type = 'button'; trigger.className = 'videoCardMenuButton';
    trigger.textContent = '⋮'; trigger.setAttribute('aria-label', 'その他の操作'); trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
    const menu = doc.createElement('div'); menu.className = 'videoCardMenu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
    wrap.append(trigger, menu);

    const close = () => {
      menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); wrap.className = 'videoCardMenuWrap'; titleRow.className = 'videoCardTitleRow';
      if (doc.removeEventListener) {
        doc.removeEventListener('pointerdown', closeOutside, true);
        doc.removeEventListener('keydown', closeOnEscape, true);
      }
      if (activeMenuClose === close) activeMenuClose = null;
    };
    const closeOutside = (event) => { if (!wrap.contains(event.target)) close(); };
    const closeOnEscape = (event) => { if (event.key === 'Escape') { close(); trigger.focus(); } };
    const appendAction = (action) => {
      if (action.href) {
        const link = doc.createElement('a'); link.className = 'videoCardMenuEdit'; link.href = action.href;
        link.textContent = action.label; link.setAttribute('role', 'menuitem');
        link.addEventListener('click', close); menu.append(link); return;
      }
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'videoCardMenuAction';
      button.textContent = action.label; button.setAttribute('role', 'menuitem');
      button.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation(); close();
        if (typeof action.onSelect === 'function') action.onSelect(video);
      });
      menu.append(button);
    };
    (options.menuActions || []).forEach(appendAction);
    if (options.editHref) appendAction({ href: options.editHref, label: '詳細を編集' });
    trigger.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      if (!menu.hidden) { close(); return; }
      if (activeMenuClose) activeMenuClose();
      menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); wrap.className = 'videoCardMenuWrap videoCardMenuWrap--open'; titleRow.className = 'videoCardTitleRow videoCardTitleRow--menu-open'; activeMenuClose = close;
      if (doc.addEventListener) {
        doc.addEventListener('pointerdown', closeOutside, true);
        doc.addEventListener('keydown', closeOnEscape, true);
      }
      const firstAction = menu.children[0]; if (firstAction && typeof firstAction.focus === 'function') firstAction.focus();
    });
    titleRow.append(wrap);
    return card;
  }

  function create(video, options) {
    if (!options || !options.documentRef) throw new TypeError('documentRef is required');
    const doc = options.documentRef;
    const record = video || {};
    const layout = options.layout === 'related' ? 'related' : options.layout === 'compact' ? 'compact' : 'grid';
    const card = doc.createElement('article'); card.className = 'videoCard videoCard--' + layout;
    if (record.id != null) card.dataset.id = String(record.id);

    const thumbTarget = options.openHref ? doc.createElement('a') : doc.createElement('button');
    if (options.openHref) thumbTarget.href = options.openHref;
    else {
      thumbTarget.type = 'button';
      thumbTarget.addEventListener('click', (event) => { if (typeof options.onOpen === 'function') options.onOpen(event, record); });
    }
    thumbTarget.className = 'videoCardThumbOpen videoCardOpen' + (options.openClass ? ' ' + options.openClass : '');
    thumbTarget.setAttribute('aria-label', (options.title || record.title || '動画') + 'を開く');
    const thumb = doc.createElement('div'); thumb.className = 'videoCardThumb';
    const duration = doc.createElement('span'); duration.className = 'videoCardDuration'; duration.hidden = true;
    const showDuration = (value) => {
      const label = formatDuration(value);
      if (!label) return;
      duration.textContent = label; duration.hidden = false;
    };
    showDuration(options.durationSeconds == null ? record.durationSeconds : options.durationSeconds);
    const renderer = options.thumbnailRenderer;
    if (renderer && typeof renderer.render === 'function') {
      renderer.render(thumb, record, {
        ...(options.thumbnailOptions || {}),
        onDuration(seconds) { showDuration(seconds); if (options.thumbnailOptions && options.thumbnailOptions.onDuration) options.thumbnailOptions.onDuration(seconds); },
      });
    } else {
      const fallback = doc.createElement('span'); fallback.className = 'videoThumbnailFallback';
      const mark = doc.createElement('b'); mark.textContent = '▶';
      const service = doc.createElement('span'); service.textContent = options.serviceLabel || (options.thumbnailOptions && options.thumbnailOptions.serviceLabel) || record.service || record.a || 'VIDEO';
      fallback.append(mark, service); thumb.append(fallback);
    }
    thumb.append(duration); thumbTarget.append(thumb); card.append(thumbTarget);

    const body = doc.createElement('div'); body.className = 'videoCardBody';
    const info = doc.createElement('div'); info.className = 'videoCardInfo';
    const icon = doc.createElement('span'); icon.className = 'videoCardSourceIcon'; icon.setAttribute('aria-hidden', 'true');
    const sourceName = String(options.serviceLabel || record.service || record.a || 'VIDEO');
    icon.textContent = sourceName.slice(0, 1).toUpperCase();
    info.append(icon);
    const details = doc.createElement('div'); details.className = 'videoCardDetails';
    const titleRow = doc.createElement('div'); titleRow.className = 'videoCardTitleRow';
    const titleTarget = options.openHref ? doc.createElement('a') : doc.createElement('button');
    if (options.openHref) titleTarget.href = options.openHref;
    else {
      titleTarget.type = 'button';
      titleTarget.addEventListener('click', (event) => { if (typeof options.onOpen === 'function') options.onOpen(event, record); });
    }
    titleTarget.className = 'videoCardTitle videoCardOpen' + (options.openClass ? ' ' + options.openClass : ''); titleTarget.textContent = options.title || record.title || '動画';
    titleTarget.setAttribute('aria-label', titleTarget.textContent + 'を開く');
    titleRow.append(titleTarget);
    addMenu(card, titleRow, record, options, doc);
    details.append(titleRow);

    const metadata = (options.metadata || []).map((value) => String(value == null ? '' : value).trim()).filter(Boolean);
    const tags = (options.tags || []).map((value) => String(value == null ? '' : value).trim()).filter(Boolean);
    if (metadata.length || tags.length) {
      const meta = doc.createElement('div'); meta.className = 'videoCardMeta'; meta.textContent = metadata.concat(tags.map((tag) => '#' + tag)).join(' · ');
      details.append(meta);
    }
    if (options.progressPercent != null && Number.isFinite(Number(options.progressPercent))) {
      const progress = doc.createElement('div'); progress.className = 'videoCardProgress';
      const inner = doc.createElement('i'); inner.style.width = Math.max(0, Math.min(100, Number(options.progressPercent))) + '%'; progress.append(inner); body.append(progress);
    }
    info.append(details); body.append(info); card.append(body);
    return card;
  }

  const api = Object.freeze({ create, formatDuration });
  root.MangaReaderVideoCard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
