(() => {
  'use strict';
  const template = String.raw`<section id="tocOverlay" class="screenView modalOverlay" role="region" aria-labelledby="tocPanel">
  <div id="tocPanel" class="modalPanel">
    <div class="panel-header"><span>目次</span><button class="ctrlBtn" id="closeTocBtn">閉じる</button></div>
    <div id="tocListItems"></div>
    <div id="tocListEmpty" style="display:none;">目次はまだ追加されていません</div>
  </div>
</section>`;
  if (document.body && !document.getElementById('tocOverlay')) document.body.insertAdjacentHTML('beforeend', template);
})();
