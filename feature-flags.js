(function (root) {
  root.MangaReaderFeatures = Object.assign({
    localReader: false,
    transferBudget: false
  }, root.MangaReaderFeatures || {});

  // reader.html already loads this tiny shared bootstrap before its UI markup.
  // Add cross-document study destinations once the reader chrome exists. Pages
  // without the reader navigation elements are left untouched.
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const goStudy = () => { window.location.href = 'study.html'; };

      const menu = document.getElementById('mobileUtilityMenu');
      const authorButton = document.getElementById('mobileNavAuthor');
      if (menu && !document.getElementById('mobileNavStudy')) {
        const studyButton = document.createElement('button');
        studyButton.id = 'mobileNavStudy';
        studyButton.type = 'button';
        studyButton.setAttribute('role', 'menuitem');
        studyButton.textContent = '司法試験学習';
        studyButton.addEventListener('click', goStudy);
        if (authorButton && authorButton.parentNode === menu) authorButton.insertAdjacentElement('afterend', studyButton);
        else menu.appendChild(studyButton);
      }

      const syncDesktopLocalReader = () => {
        const desktopLocalReader = document.getElementById('desktopNavLocalReader');
        if (!desktopLocalReader) return;
        desktopLocalReader.hidden = !root.MangaReaderFeatures.localReader;
        if (root.MangaReaderFeatures.localReader && desktopLocalReader.dataset.featureWired !== '1') {
          desktopLocalReader.dataset.featureWired = '1';
          desktopLocalReader.addEventListener('click', () => { window.location.href = 'local-reader.html'; });
        }
      };
      syncDesktopLocalReader();
      document.addEventListener('manga-reader-desktop-nav-ready', syncDesktopLocalReader);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
