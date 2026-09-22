(function (root) {
  root.MangaReaderFeatures = Object.assign({
    transferBudget: false
  }, root.MangaReaderFeatures || {});

      // reader.html already loads this tiny shared bootstrap before its UI markup.
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const readerLogout = document.getElementById('listLogoutBtn');
      if (readerLogout) {
        readerLogout.hidden = true;
        readerLogout.setAttribute('aria-hidden', 'true');
        readerLogout.tabIndex = -1;
      }

    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
