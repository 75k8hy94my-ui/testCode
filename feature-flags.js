(function (root) {
  root.MangaReaderFeatures = Object.assign({
    localReader: false,
    transferBudget: false
  }, root.MangaReaderFeatures || {});
})(typeof window !== 'undefined' ? window : globalThis);
