(() => {
  'use strict';
  const template = String.raw`<nav id="mobileBottomNav" aria-label="よく使うメニュー">
  <button class="mobileBottomNavBtn active" id="mobileNavManga" type="button" aria-label="漫画"><svg class="mobileNavGlyph mobileNavGlyphManga" viewBox="0 0 200 200" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="10" d="M24 58c36-20 72-16 100 8v108c-25-20-62-24-100-8z"></path><path fill="none" stroke="currentColor" stroke-width="10" d="M176 58c-36-20-72-16-100 8v108c25-20 62-24 100-8z"></path><path fill="none" stroke="currentColor" stroke-width="10" d="M100 66v108"></path></svg><span>漫画</span></button>
  <button class="mobileBottomNavBtn" id="mobileNavVideo" type="button" aria-label="動画"><svg class="mobileNavGlyph mobileNavGlyphVideo" viewBox="0 0 200 200" aria-hidden="true"><rect fill="none" stroke="currentColor" stroke-width="10" x="26" y="48" width="148" height="106" rx="22"></rect><path fill="none" stroke="currentColor" stroke-width="10" d="m84 78 42 23-42 23z"></path></svg><span>動画</span></button>
  <button class="mobileBottomNavBtn" id="mobileNavMore" type="button" aria-label="その他" aria-haspopup="menu" aria-expanded="false"><svg class="mobileNavGlyph mobileNavGlyphMore" viewBox="0 0 200 200" aria-hidden="true"><circle fill="currentColor" cx="55" cy="100" r="9"></circle><circle fill="currentColor" cx="100" cy="100" r="9"></circle><circle fill="currentColor" cx="145" cy="100" r="9"></circle></svg><span>その他</span></button>
</nav>
<div id="mobileUtilityMenu" role="menu" aria-label="その他の操作" hidden>
  <button id="mobileNavAuthor" type="button" role="menuitem">作者カード</button>
  <button id="mobileNavBackup" type="button" role="menuitem">バックアップ</button>
  <button id="mobileNavSettings" type="button" role="menuitem">設定</button>
</div>`;
  const existingBottomNav = document.getElementById('mobileBottomNav');
  const hasReaderControls = document.getElementById('mobileNavMore') && document.getElementById('mobileUtilityMenu');
  if (document.body && !hasReaderControls) {
    if (existingBottomNav) existingBottomNav.remove();
    document.body.insertAdjacentHTML('beforeend', template);
  }
})();
