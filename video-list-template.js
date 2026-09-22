(function (root) {
  'use strict';

  const template = String.raw`<section id="videoListSection" class="videoRouteSection" aria-label="動画一覧">
  <div class="videoRouteHeader">
    <div class="listHeaderControls" data-vpn-header="video-list" aria-label="VPN状態">
      <button class="ctrlBtn vpnStatusButton" type="button" data-vpn-status-button data-vpn-diagnostics-button>VPN確認中</button>
    </div>
  </div>
  <div id="videoListToolbar" hidden><button class="ctrlBtn" id="addVideoBtn" type="button">+ 動画を追加</button></div>
  <div id="videoListItems" hidden></div>
  <div id="videoListEmpty" hidden>動画はまだ追加されていません</div>
</section>`;

  root.MangaReaderVideoTemplate = Object.freeze({
    createMarkup() { return template; },
  });
}(typeof window !== 'undefined' ? window : globalThis));
