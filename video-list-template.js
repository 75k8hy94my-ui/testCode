(function (root) {
  'use strict';

  const template = String.raw`<section id="videoListSection" class="videoRouteSection" aria-label="動画一覧">
  <div id="videoListToolbar" hidden></div>
  <div id="videoListItems" hidden></div>
  <div id="videoListEmpty" hidden>動画はまだ追加されていません</div>
</section>`;

  root.MangaReaderVideoTemplate = Object.freeze({
    createMarkup() { return template; },
  });
}(typeof window !== 'undefined' ? window : globalThis));
