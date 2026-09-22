(() => {
  'use strict';
  const template = String.raw`<section id="savedListOverlay" class="screenView modalOverlay" role="region" aria-labelledby="savedListPanel">
    <div id="savedListPanel" class="modalPanel">
    <div class="panel-header">
      <div class="listHeaderControls" data-vpn-header="saved-list" aria-label="VPN状態">
        <button class="ctrlBtn vpnStatusButton" type="button" data-vpn-status-button data-vpn-diagnostics-button>VPN確認中</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="ctrlBtn" id="listThemeBtn" type="button" title="テーマ切替" aria-label="テーマ切替"></button>
        <button class="ctrlBtn" id="closeListBtn">閉じる</button>
      </div>
    </div>
    <div id="listTabRow">
    </div>
    ${MangaListTemplate.createMarkup()}
    <div id="videoListSection" style="display:none;">
    <div id="videoListToolbar" hidden>
      <button class="ctrlBtn" id="addVideoBtn" type="button">+ 動画を追加</button>
    </div>
      <div id="videoListItems" hidden></div>
      <div id="videoListEmpty" hidden>動画はまだ追加されていません</div>
    </div>
  </div>
</section>

`;
  if (document.body && !document.getElementById('savedListOverlay')) document.body.insertAdjacentHTML('beforeend', template);
})();
