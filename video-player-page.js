(() => {
  'use strict';
  const page = document.getElementById('videoPlayerPage');
  const id = new URLSearchParams(location.search).get('id') || '';
  const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; } catch (_) { return fallback; } };
  const base = read('mangaReaderVideos', []).find((item) => String(item.id) === id);
  const allMeta = read('mangaReaderVideoMeta', {});
  if (!base) { page.innerHTML = '<section class="profileContent"><h2>動画が見つかりません</h2><a class="glassBtn" href="video.html">動画一覧へ戻る</a></section>'; return; }
  const meta = allMeta[id] || {};
  const title = meta.title || base.title || [base.a, base.b].filter(Boolean).join(' / ') || '動画';
  const tags = Array.isArray(meta.tags) ? meta.tags : (Array.isArray(base.tags) ? base.tags : []);
  const words = new Set(title.toLocaleLowerCase('ja').split(/[\s/・、,._-]+/).filter((word) => word.length >= 2));
  const related = read('mangaReaderVideos', []).filter((item) => String(item.id) !== id).map((item) => { const itemMeta = allMeta[item.id] || {}; const itemTitle = itemMeta.title || item.title || [item.a, item.b].filter(Boolean).join(' / ') || '動画'; const itemTags = Array.isArray(itemMeta.tags) ? itemMeta.tags : (Array.isArray(item.tags) ? item.tags : []); const sharedTags = itemTags.filter((tag) => tags.includes(tag)).length; const sharedWords = [...words].filter((word) => itemTitle.toLocaleLowerCase('ja').includes(word)).length; return { item, itemTitle, itemTags, score: sharedTags * 100 + sharedWords }; }).sort((a, b) => b.score - a.score).slice(0, 12);
  const heading = document.createElement('h2'); heading.textContent = title;
  const info = document.createElement('div'); info.className = 'videoPlayerInfo'; info.textContent = [base.a, base.b].filter(Boolean).join(' / ') || '動画';
  if (tags.length) { const tagLine = document.createElement('div'); tagLine.className = 'videoPlayerTags'; tagLine.textContent = tags.map((tag) => '#' + tag).join(' '); info.append(tagLine); }
  const frame = document.createElement('div'); frame.className = 'videoPlayerFrame';
  if (base.a && base.b) { const iframe = document.createElement('iframe'); iframe.src = 'https://www.' + base.a + '.com/embed/' + base.b; iframe.title = title; iframe.allowFullscreen = true; frame.append(iframe); } else { const link = document.createElement('a'); link.className = 'glassBtn'; link.href = base.url || '#'; link.target = '_blank'; link.rel = 'noopener'; link.textContent = '元ページを開く'; frame.append(link); }
  const back = document.createElement('a'); back.className = 'glassBtn videoBack'; back.href = 'video.html'; back.textContent = '動画一覧へ戻る';
  const relatedBox = document.createElement('aside'); relatedBox.className = 'videoRelated'; const relatedHeading = document.createElement('h3'); relatedHeading.textContent = '関連動画'; relatedBox.append(relatedHeading);
  related.forEach(({ item, itemTitle, itemTags }) => { const link = document.createElement('a'); link.className = 'videoRelatedItem'; link.href = 'video-player.html?id=' + encodeURIComponent(item.id); const thumb = document.createElement('span'); thumb.className = 'videoRelatedThumb'; thumb.textContent = '▶'; const text = document.createElement('span'); text.className = 'videoRelatedText'; text.textContent = itemTitle; const tagsText = document.createElement('small'); tagsText.textContent = itemTags.slice(0, 3).map((tag) => '#' + tag).join(' '); text.append(tagsText); link.append(thumb, text); relatedBox.append(link); });
  const main = document.createElement('section'); main.className = 'videoPlayerMain'; main.append(heading, info, frame, back); const layout = document.createElement('div'); layout.className = 'videoPlayerLayout'; layout.append(main, relatedBox); page.replaceChildren(layout);
})();
