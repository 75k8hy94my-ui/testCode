(() => {
  'use strict';
  if (!document.documentElement.classList.contains('statutes-page')) return;
  const KEY = 'testCode.statutes.lastEdit.v1';
  const page = document.getElementById('routeContent');
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'statutesReturnLastEdit';
  button.hidden = true;
  button.setAttribute('aria-label','最後に編集した条文へ戻る');
  const css = document.createElement('style');
  css.textContent = '#statutesReturnLastEdit{position:fixed;right:18px;bottom:24px;z-index:1100;max-width:min(250px,calc(100vw - 35px));padding:9px 13px;border:1px solid var(--line,#aaa);border-radius:24px;box-shadow:0 3px 14px #0003;background:var(--bg,#fff);color:var(--text,#222);font:inherit;font-size:12px;cursor:pointer}#statutesReturnLastEdit[hidden]{display:none}@media(max-width:899px){#statutesReturnLastEdit{right:10px;bottom:calc(88px + env(safe-area-inset-bottom))}}';
  document.head.appendChild(css);
  document.body.appendChild(button);
  function lastEdit() {
    try {const data=JSON.parse(localStorage.getItem(KEY)||'null');return data && typeof data.section==='string' && typeof data.article==='string' ? data : null;} catch (_) {return null;}
  }
  function update() {
    const last=lastEdit();
    button.hidden=!last;
    if (last) button.textContent='最後の編集：'+last.article+'へ戻る';
  }
  document.addEventListener('statutes-last-edit',event => {
    const data=event.detail;
    if (!data?.section || !data?.article) return;
    try {localStorage.setItem(KEY,JSON.stringify({section:data.section,article:data.article,at:Date.now()}));} catch (_) {}
    update();
  });
  button.addEventListener('click',async () => {
    const data=lastEdit();
    if (!data) return;
    button.disabled=true;
    try {
      await window.StatutesNavigation?.selectSection(data.section);
      // Data loader refreshes cards asynchronously; let the new DOM settle.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const cards=page.querySelectorAll('.statuteCard');
      const card=Array.from(cards).find(node=>node.querySelector('.statuteNumber')?.textContent?.trim()===data.article);
      if (!card) return;
      card.scrollIntoView({behavior:'smooth',block:'center'});
      card.classList.add('statutesLastEditFlash');
      setTimeout(()=>card.classList.remove('statutesLastEditFlash'),1800);
    } finally {button.disabled=false;}
  });
  const highlight=document.createElement('style');
  highlight.textContent='.statutesLastEditFlash{outline:2px solid var(--accent,#1769aa);outline-offset:4px;border-radius:4px}';
  document.head.append(highlight);
  window.addEventListener('storage',event=>{if(event.key===KEY)update();});
  update();
})();