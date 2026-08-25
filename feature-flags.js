(function (root) {
  root.MangaReaderFeatures = Object.assign({
    localReader: false,
    transferBudget: false
  }, root.MangaReaderFeatures || {});

  // reader.html already loads this tiny shared bootstrap before its UI markup.
  // Add the cross-document study destination after the markup is ready so the
  // large reader document itself does not need another navigation-specific
  // code path. Pages without the reader utility menu are left untouched.
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const menu = document.getElementById('mobileUtilityMenu');
      const authorButton = document.getElementById('mobileNavAuthor');
      if (!menu || document.getElementById('mobileNavStudy')) return;

      const studyButton = document.createElement('button');
      studyButton.id = 'mobileNavStudy';
      studyButton.type = 'button';
      studyButton.setAttribute('role', 'menuitem');
      studyButton.textContent = '司法試験学習';
      studyButton.addEventListener('click', () => {
        window.location.href = 'study.html';
      });

      if (authorButton && authorButton.parentNode === menu) authorButton.insertAdjacentElement('afterend', studyButton);
      else menu.appendChild(studyButton);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
