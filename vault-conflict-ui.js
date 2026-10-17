(function () {
  'use strict';
  if (!window || !document || !window.MangaVault) return;
  let dialog = null;

  function describeConflict(conflict) {
    const parts = String(conflict.path || '').split('/').slice(1).map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    const section = parts.shift() || 'データ';
    const titles = { items: '漫画', videos: '動画', videoMeta: '動画設定', videoFolders: '動画フォルダ', videoMarkers: '動画マーカー', videoShortsState: 'ショート動画', theme: 'テーマ設定', dashboardVisibility: 'ホーム表示設定', homeCards: 'ホームカード', study: '学習データ', lastPages: '閲覧位置', statuteNotes: 'メモ' };
    if (conflict.type === 'order') return (titles[section] || section) + 'の並び順';
    const entity = ['items', 'videos', 'videoFolders', 'authorCards'].includes(section) ? parts.shift() : null;
    const fields = parts.map((part) => ({ title: 'タイトル', thumbnailUrl: 'サムネイル', favorite: 'お気に入り', updatedAt: '更新日時', savedAt: '保存日時' }[part] || part));
    return (titles[section] || section) + (entity ? '「' + entity + '」' : '') + (fields.length ? ' / ' + fields.join(' / ') : '');
  }


  const stable = value => {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
  };
  function summarize(conflict) {
    const localPresent = conflict.localPresent !== false;
    const remotePresent = conflict.remotePresent !== false;
    if (!localPresent || !remotePresent) return { recommendation: null, reason: '一方が削除されています。削除が意図的か確認してください。', localOnly: [], remoteOnly: [] };
    const a = conflict.local, b = conflict.remote;
    if (stable(a) === stable(b)) return { recommendation: 'local', reason: '両方の内容が一致しています。', localOnly: [], remoteOnly: [] };
    if (Array.isArray(a) && Array.isArray(b)) {
      const difference = (first, second) => {
        const counts = new Map();
        second.forEach(v => { const key = stable(v); counts.set(key, (counts.get(key) || 0) + 1); });
        return first.filter(v => { const key = stable(v), n = counts.get(key) || 0; if (n) { counts.set(key, n - 1); return false; } return true; });
      };
      const localOnly = difference(a, b), remoteOnly = difference(b, a);
      const recommendation = remoteOnly.length === 0 && localOnly.length ? 'local' : localOnly.length === 0 && remoteOnly.length ? 'remote' : null;
      const reason = recommendation ? '一方の内容がすべて含まれ、追加項目もあります。' : '両方に独自の内容があります。安易に片方を選ぶと失われる項目があります。';
      return { recommendation, reason, localOnly, remoteOnly, countLocal: a.length, countRemote: b.length };
    }
    return { recommendation: null, reason: '双方の値が異なります。どちらが新しいかは自動判定できません。', localOnly: [], remoteOnly: [] };
  }
  function summarizeExtra(value) {
    if (value === null) return 'null';
    if (typeof value !== 'object') return String(value);
    const label = [value.article, value.quote, value.title, value.name, value.id, value.url].filter(v => typeof v === 'string' || typeof v === 'number').map(String);
    return label.length ? label.slice(0, 3).join(' / ') : JSON.stringify(value).slice(0, 100);
  }
  function show(conflicts) {
    if (!Array.isArray(conflicts) || !conflicts.length) return;
    if (dialog) dialog.remove();
    const root = document.createElement('section');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'vaultConflictTitle');
    root.className = 'vault-conflict-dialog';
    const style = document.createElement('style');
    style.textContent = '.vault-conflict-dialog{position:fixed;inset:4dvh max(12px,4vw);z-index:2147483000;overflow:auto;padding:clamp(14px,3vw,26px);background:Canvas;color:CanvasText;border:1px solid #8888;border-radius:14px;box-shadow:0 12px 50px #0008;font:inherit}.vault-conflict-dialog h2{margin:0 0 10px;font-size:19px}.vault-conflict-dialog fieldset{min-width:0;margin:16px 0;padding:14px;border:1px solid #8887;border-radius:10px}.vault-conflict-dialog legend{font-weight:700;padding:0 6px}.vault-conflict-dialog .conflict-summary{margin:8px 0 12px;line-height:1.6;font-size:14px}.vault-conflict-dialog .conflict-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.vault-conflict-dialog .conflict-option{display:flex;gap:8px;align-items:flex-start;padding:12px;border:1px solid #8888;border-radius:9px;cursor:pointer;overflow-wrap:anywhere}.vault-conflict-dialog .conflict-option:has(input:checked){outline:2px solid #1684d8}.vault-conflict-dialog .conflict-option strong{display:block}.vault-conflict-dialog .conflict-details{margin-top:12px}.vault-conflict-dialog pre{max-height:200px;max-width:100%;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;padding:10px;background:rgba(128,128,128,.10);border-radius:6px}.vault-conflict-dialog .conflict-extras{font-size:12px;max-height:140px;overflow:auto;margin:6px 0;padding-left:20px}.vault-conflict-dialog .conflict-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;position:sticky;bottom:-26px;padding:12px 0;background:Canvas}.vault-conflict-dialog button{padding:8px 14px;border-radius:7px;border:1px solid #8888;background:Canvas;color:CanvasText;cursor:pointer}.vault-conflict-dialog button[type=submit]{background:#1769aa;color:#fff;border-color:#1769aa}.vault-conflict-dialog button:disabled{opacity:.6}@media(max-width:580px){.vault-conflict-dialog .conflict-choices{grid-template-columns:1fr}.vault-conflict-dialog{inset:8px;padding:12px}.vault-conflict-dialog .conflict-actions{bottom:-12px}}';
    root.append(style);
    const title = document.createElement('h2');
    title.id = 'vaultConflictTitle';
    title.textContent = '同期データの競合を確認';
    root.append(title);
    const description = document.createElement('p');
    description.textContent = '端末とクラウドの違いを比較してください。安全に判断できる項目には推奨を表示します。未選択のまま閉じても端末の保存内容は変更されません。';
    root.append(description);
    const form = document.createElement('form');
    const choices = {};
    conflicts.forEach((conflict, index) => {
      const info = summarize(conflict);
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = describeConflict(conflict);
      fieldset.append(legend);
      const summary = document.createElement('p');
      summary.className = 'conflict-summary';
      const safe = info.recommendation === 'local' ? 'この端末' : info.recommendation === 'remote' ? 'クラウド' : null;
      summary.textContent = (safe ? '推奨：' + safe + '（内容の包含関係に基づく）' : '要確認：自動推奨なし') + '。' + info.reason;
      fieldset.append(summary);
      if (info.countLocal !== undefined) {
        const counts = document.createElement('p');
        counts.className = 'conflict-summary';
        counts.textContent = '登録数：端末 ' + info.countLocal + '件 / クラウド ' + info.countRemote + '件。端末にのみ存在 ' + info.localOnly.length + '件 / クラウドにのみ存在 ' + info.remoteOnly.length + '件';
        fieldset.append(counts);
      }
      if (info.localOnly.length || info.remoteOnly.length) {
        const extras = document.createElement('details');
        extras.className = 'conflict-details';
        const heading = document.createElement('summary'); heading.textContent = '異なる項目を見る';
        extras.append(heading);
        for (const [label, values] of [['端末にのみ存在', info.localOnly], ['クラウドにのみ存在', info.remoteOnly]]) {
          if (!values.length) continue;
          const h = document.createElement('strong'); h.textContent = label + '（' + values.length + '件）'; extras.append(h);
          const ul = document.createElement('ul'); ul.className = 'conflict-extras';
          values.slice(0, 30).forEach(value => {const li = document.createElement('li');li.textContent = summarizeExtra(value);ul.append(li);});
          if(values.length > 30){const li=document.createElement('li');li.textContent='ほか ' + (values.length - 30) + ' 件';ul.append(li);}
          extras.append(ul);
        }
        fieldset.append(extras);
      }
      const choiceWrap = document.createElement('div');
      choiceWrap.className = 'conflict-choices';
      for (const side of ['local', 'remote']) {
        const label = document.createElement('label');
        label.className = 'conflict-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'vaultConflict' + index;
        input.value = side;
        input.required = true;
        input.addEventListener('change', () => { choices[conflict.path] = side; });
        const text = document.createElement('span');
        const heading = document.createElement('strong');
        heading.textContent = (side === 'local' ? 'この端末を残す' : 'クラウドを残す') + (info.recommendation === side ? '（推奨）' : '');
        text.append(heading);
        const count = document.createElement('small');
        const value = conflict[side];
        count.textContent = conflict[side + 'Present'] === false ? 'この側では削除されています' : Array.isArray(value) ? value.length + '件' : 'この値を採用';
        text.append(count);label.append(input,text);choiceWrap.append(label);
      }
      fieldset.append(choiceWrap);
      const details = document.createElement('details'); details.className = 'conflict-details';
      const detailHeading = document.createElement('summary');detailHeading.textContent = '元データ（詳細）を表示'; details.append(detailHeading);
      for (const side of ['local','remote']) {
        const heading = document.createElement('h3');heading.textContent=side==='local'?'この端末':'クラウド';details.append(heading);
        const pre = document.createElement('pre');
        pre.textContent = conflict[side + 'Present'] === false ? '削除' : JSON.stringify(conflict[side], null, 2);
        details.append(pre);
      }
      fieldset.append(details);
      form.append(fieldset);
    });
    const error = document.createElement('p');
    error.setAttribute('role', 'alert');
    const actions = document.createElement('div');actions.className='conflict-actions';
    const cancel = document.createElement('button');cancel.type='button';cancel.textContent='後で確認';cancel.addEventListener('click',()=>{root.remove();dialog=null;});
    const submit = document.createElement('button');
    submit.type = 'submit';submit.textContent = '選択を適用して同期';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (conflicts.some(item => !choices[item.path])) { error.textContent = '各項目の値を選択してください。'; return; }
      submit.disabled = true;cancel.disabled=true;
      error.textContent = '同期中…';
      try {
        await window.MangaVault.resolveConflicts(choices, conflicts);
        root.remove();dialog = null;
      } catch (failure) {
        error.textContent = failure && failure.message ? failure.message : '同期できませんでした。端末データは保持されています。';
        submit.disabled = false;cancel.disabled=false;
      }
    });
    actions.append(cancel,submit);form.append(error,actions);root.append(form);
    document.body.append(root); dialog=root;
  }

  window.addEventListener('manga-vault-conflict', (event) => show(event.detail && event.detail.conflicts));
  window.addEventListener('manga-vault-cleared', () => {
    if (dialog) dialog.remove();
    dialog = null;
    if (window.TestCodeGuest?.isActive()) return;
    if (location.pathname.split('/').pop() !== 'sync.html') {
      const returnTo = location.pathname.split('/').pop() + location.search + location.hash;
      document.body.textContent = '保管庫がロックされました。再解錠しています…';
      location.replace('sync.html?next=' + encodeURIComponent(returnTo));
    }
  });
  window.addEventListener('pagehide', () => { if (dialog) dialog.remove(); dialog = null; }, { once: true });
}());
