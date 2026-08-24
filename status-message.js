(() => {
  'use strict';
  function statusMessageDuration(kind) {
    return kind === 'cloud-sync-error' ? 10000 : 1500;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { statusMessageDuration };
  if (typeof window !== 'undefined') window.MangaReaderStatus = { statusMessageDuration };
})();
