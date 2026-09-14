(() => {
  'use strict';
  const route = document.body.dataset.readerEntry || 'saved-list';
  const load = (source) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    if (source.src) { script.src = new URL(source.getAttribute('src'), location.href).href; script.onload = resolve; script.onerror = reject; }
    else { script.textContent = source.textContent; resolve(); }
    document.body.appendChild(script);
  });
  function pruneEntrySurface() {
    const remove = (selector) => document.querySelectorAll(selector).forEach((node) => node.remove());
    if (route === 'saved-list') {
      remove('#videoAddOverlay,#videoPlayerOverlay,#settingsOverlay,#backupOverlay,#authorCardOverlay,#tocOverlay');
      return;
    }
    if (route === 'video-list') {
      remove('#mangaListSection,#saveItemOverlay,#customAddOverlay,#editItemOverlay,#bulkEditOverlay,#bulkDetectOverlay,#authorCardOverlay,#tocOverlay,#settingsOverlay,#backupOverlay');
      return;
    }
    remove('#savedListOverlay,#videoAddOverlay,#videoPlayerOverlay,#settingsOverlay,#backupOverlay,#authorCardOverlay,#tocOverlay');
  }
  fetch('reader.html').then((response) => { if (!response.ok) throw new Error('reader load failed'); return response.text(); })
    .then(async (text) => {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      doc.head.querySelectorAll('link[rel="stylesheet"],style').forEach((node) => document.head.appendChild(node.cloneNode(true)));
      document.getElementById('readerEntryMount').replaceChildren(...[...doc.body.children].filter((node) => node.tagName !== 'SCRIPT'));
      for (const source of [...doc.querySelectorAll('script')]) await load(source);
      pruneEntrySurface();
      if (window.ReaderShell) window.ReaderShell.setScreen(route, true);
    })
    .catch(() => { document.getElementById('readerEntryStatus').textContent = '読み込みに失敗しました。再読み込みしてください。'; });
})();
