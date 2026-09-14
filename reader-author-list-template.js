(() => {
  'use strict';
  const template = String.raw`<section id="authorCardOverlay" class="screenView modalOverlay" role="region" aria-labelledby="authorCardPanel">
  <div id="authorCardPanel" class="modalPanel">
    <div class="panel-header"><span>作者カード</span></div>
    <div class="dialog-actions" id="authorCardCreateActions" style="margin-top:8px;"><button class="primaryBtn" id="newAuthorCardBtn" type="button">作者カードを作成</button></div>
    <div id="authorCardEditor" style="display:none;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">
      <div class="panel-header" style="font-size:15px;padding-bottom:8px;"><span id="authorCardEditorTitle">作者カードを作成</span></div>
      <label class="field-label" for="authorCardNameInput">作者名</label>
      <input id="authorCardNameInput" type="text" placeholder="作者名">
      <label class="field-label" for="authorCardCircleInput">サークル名（任意）</label>
      <input id="authorCardCircleInput" type="text" placeholder="作者と同一人物のサークル名">
      <label class="field-label">リンク</label>
      <div id="authorLinksEditor"></div>
      <button class="ctrlBtn" id="addAuthorLinkBtn" type="button" style="margin-top:9px;">リンクを追加</button>
      <div class="dialog-actions" style="margin-top:14px;"><button class="ctrlBtn" id="cancelAuthorCardBtn" type="button">キャンセル</button><button class="primaryBtn" id="saveAuthorCardBtn" type="button">保存</button></div>
    </div>
    <div id="authorCardList" class="author-card-list"></div>
    <div id="authorCardEmpty" style="display:none;color:var(--sub);font-size:13px;padding:14px 0;">作者カードはまだありません</div>
  </div>
</section>

`;
  if (document.body && !document.getElementById('authorCardOverlay')) document.body.insertAdjacentHTML('beforeend', template);
})();
