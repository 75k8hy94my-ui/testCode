(() => {
  'use strict';
  const template = String.raw`<!-- Video add dialog -->
<section id="videoAddOverlay" class="screenView modalOverlay" role="region" aria-labelledby="videoAddPanel">
  <div id="videoAddPanel" class="modalPanel">
    <div class="panel-header">
      <span>動画を追加</span>
      <button class="ctrlBtn" id="cancelVideoAddBtn" type="button">キャンセル</button>
    </div>
    <label class="field-label" for="videoUrlInput">URLから自動入力（任意）</label>
    <input id="videoUrlInput" type="url" placeholder="https://www.example.com/v/0000/...">
    <label class="field-label" for="videoTitleInput">タイトル（省略可）</label>
    <input id="videoTitleInput" type="text" placeholder="タイトル">
    <label class="field-label" for="videoAInput">A（サービス名・英数字）</label>
    <input id="videoAInput" type="text" placeholder="例: youtube">
    <label class="field-label" for="videoBInput">B（動画ID・数字）</label>
    <input id="videoBInput" type="text" inputmode="numeric" placeholder="例: 12345678">
    <div id="videoPreviewUrl"></div>
    <div id="videoAddActions">
      <button class="primaryBtn" id="confirmVideoAddBtn" type="button">追加</button>
    </div>
  </div>
</section>

<!-- Video player overlay -->
<section id="videoPlayerOverlay" class="screenView modalOverlay" role="region" aria-labelledby="videoPlayerPanel">
  <div id="videoPlayerPanel">
    <div id="videoPlayerHeader">
      <span id="videoPlayerTitle"></span>
      <div class="vpnHeaderControls" data-vpn-header="video-player" aria-label="VPN状態">
        <button class="ctrlBtn vpnStatusButton" type="button" data-vpn-status-button>VPN確認中</button>
        <button class="ctrlBtn" type="button" data-vpn-diagnostics-button>VPN診断</button>
      </div>
      <button class="ctrlBtn" id="closeVideoPlayerBtn" type="button">閉じる</button>
    </div>
    <div id="videoPlayerFrame">
      <iframe id="videoPlayerIframe" frameborder="0" allowfullscreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
      </iframe>
    </div>
  </div>
</section>

<section id="settingsOverlay" class="screenView" role="region" aria-labelledby="settingsPanel">
  <div id="settingsPanel" class="modalPanel settingsPanel">
    <div class="panel-header"><span>設定</span><button class="ctrlBtn" id="closeSettingsBtn" type="button">戻る</button></div>
    <div class="settingsSection">
      <h2>本棚の表示</h2>
      <p class="settingsHint">本棚に表示する補助セクションを選択できます。</p>
      <label class="settingsToggle"><input type="checkbox" data-dashboard-setting="continue" checked><span>続きから読む</span></label>
      <label class="settingsToggle"><input type="checkbox" data-dashboard-setting="recent-added" checked><span>最近追加</span></label>
      <label class="settingsToggle"><input type="checkbox" data-dashboard-setting="recent-read" checked><span>最近読んだ</span></label>
      <label class="settingsToggle"><input type="checkbox" data-dashboard-setting="unread" checked><span>未読</span></label>
      <label class="settingsToggle"><input type="checkbox" data-dashboard-setting="random" checked><span>ランダム</span></label>
      <label class="settingsToggle"><input type="checkbox" data-dashboard-setting="favorites" checked><span>お気に入り</span></label>
    </div>
  </div>
</section>

<section id="backupOverlay" class="screenView" role="region" aria-labelledby="backupPanel">
  <div id="backupPanel" class="modalPanel settingsPanel">
    <div class="panel-header"><span>バックアップ</span><button class="ctrlBtn" id="closeBackupBtn" type="button">戻る</button></div>
    <div class="settingsSection">
      <p class="settingsHint">保存したデータをファイルに書き出したり、以前のバックアップを読み込んだりできます。</p>
      <div class="backupActions">
        <button class="primaryBtn" id="backupExportBtn" type="button">バックアップ保存</button>
        <button class="ctrlBtn" id="backupImportBtn" type="button">バックアップ読込</button>
        <input id="backupFileInput" type="file" accept="application/json,.json" style="display:none;">
      </div>
    </div>
  </div>
</section>
`;
  if (document.body && !document.getElementById('videoAddOverlay')) document.body.insertAdjacentHTML('beforeend', template);
})();
