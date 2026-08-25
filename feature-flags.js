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

      const listTabRow = document.getElementById('listTabRow');
      const localReaderButton = document.getElementById('localReaderBtn');
      if (listTabRow && !document.getElementById('desktopStudyBtn')) {
        const desktopStudyButton = document.createElement('button');
        desktopStudyButton.id = 'desktopStudyBtn';
        desktopStudyButton.type = 'button';
        desktopStudyButton.className = 'listTab';
        desktopStudyButton.textContent = '司法試験学習';
        desktopStudyButton.addEventListener('click', goStudy);
        if (localReaderButton && localReaderButton.parentNode === listTabRow) localReaderButton.insertAdjacentElement('afterend', desktopStudyButton);
        else listTabRow.appendChild(desktopStudyButton);
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
