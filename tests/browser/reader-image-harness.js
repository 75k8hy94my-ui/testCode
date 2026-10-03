(() => {
  const query = new URL(location.href).searchParams;
  const delay = Math.max(0, Number(query.get('delay')) || 450);
  localStorage.setItem('mangaReaderImageEnhance', '0');
  localStorage.removeItem('mangaReaderLastPage');
  localStorage.removeItem('mangaReaderVerticalScroll');
  const item = {
    id: 'reader-image-browser-check',
    title: 'Reader Image Browser Check',
    splitSpreads: query.get('split') === '1',
    pages: Array.from({ length: 40 }, (_, index) => {
      const page = index + 1;
      const options = new URLSearchParams({ delay: page === 1 ? '0' : String(delay), cache: String(Date.now()) });
      if (page === 30) options.set('large', '1');
      return `${location.origin}/__reader-test/image/${page}.svg?${options.toString()}`;
    }),
  };
  const repository = {
    loadItem(id) { return id === item.id ? item : null; },
    saveItem() {},
    updateItem(id, patch) { if (id !== item.id) return null; Object.assign(item, patch); return item; },
    findNextVolume() { return null; },
  };
  const target = {
    consumeLaunch() { return null; },
    itemResumeKey: (id) => `item:${id}`,
    buildReaderUrl: (id) => `reader.html?item=${encodeURIComponent(id)}`,
  };
  const memoryStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const runtime = ReaderRuntimeFactory.create({ repository, target, sessionStorage: memoryStorage, location, document, window });
  const samples = { frames: 0, empty: 0, pageMismatch: 0 };
  const report = document.getElementById('testReport');
  function sample() {
    const state = runtime.getPageState();
    if (state.status !== 'loading') {
      samples.frames++;
      const stage = document.getElementById('pageStage');
      const vertical = stage.classList.contains('vertical-scroll');
      const image = vertical
        ? stage.querySelector(`.readerVerticalSlot[data-page="${state.displayedPage}"] .readerPageImage`)
        : stage.querySelector('.readerPageImage');
      if (!image) samples.empty++;
      else if (!item.splitSpreads && Number(image.alt.replace(/\D/g, '')) !== state.displayedPage) samples.pageMismatch++;
    }
    report.value = `displayed=${state.displayedPage} requested=${state.requestedPage} status=${state.status} cache=${runtime.getImageCacheSnapshot().entries.length} emptyFrames=${samples.empty} pageMismatch=${samples.pageMismatch}`;
    report.textContent = report.value;
    requestAnimationFrame(sample);
  }
  window.ReaderImageTest = Object.freeze({ runtime, item, samples });
  runtime.start(item.id).then(() => sample()).catch((error) => { report.textContent = error.message; });
})();
