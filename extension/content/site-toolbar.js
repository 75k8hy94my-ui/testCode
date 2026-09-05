(() => {
  'use strict';
  if (window.__testcodeMangaToolbarMounted) return;
  window.__testcodeMangaToolbarMounted = true;

  const RuleLocator = window.MangaExtensionRuleLocator;
  const Extractor = window.MangaExtensionExtractor;
  const PickerApi = window.MangaExtensionElementPicker;
  if (!RuleLocator || !Extractor || !PickerApi || typeof chrome === 'undefined' || !chrome.runtime) return;

  const fieldLabels = {
    title: 'タイトルを登録', author: '作者を登録', series: 'シリーズを登録',
    volume: '巻・話数を登録', tags: 'タグを登録', firstPageImage: '第1ページ画像を登録',
    allPageImages: '全ページ画像を登録', source: 'ソース名を登録'
  };

  const host = document.createElement('div');
  host.setAttribute('data-testcode-manga-extension-host', '1');
  Object.assign(host.style, { position:'fixed', right:'18px', bottom:'18px', zIndex:'2147483647' });
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host{all:initial}.wrap{font:13px/1.4 system-ui,-apple-system,sans-serif;color:#111;display:flex;gap:8px;align-items:flex-end;flex-direction:column}
      .bar,.panel{background:rgba(250,250,252,.96);backdrop-filter:blur(14px);border:1px solid rgba(0,0,0,.12);box-shadow:0 8px 30px rgba(0,0,0,.18);border-radius:14px;padding:8px}
      .bar{display:flex;gap:8px}.panel{display:none;width:280px;max-height:60vh;overflow:auto}.panel.show{display:block}
      button,input{font:inherit}.bar button,.panel button{border:0;border-radius:9px;padding:8px 11px;background:#111;color:#fff;cursor:pointer}.bar button.secondary,.panel button.secondary{background:#e9e9ee;color:#111}
      .panel button{display:block;width:100%;margin-top:6px;text-align:left}.status{max-width:280px;background:#111;color:#fff;border-radius:9px;padding:7px 10px;display:none}.status.show{display:block}
      label{display:block;font-size:11px;color:#666;margin-top:4px}.pattern{width:100%;box-sizing:border-box;border:1px solid #ccc;border-radius:8px;padding:7px;margin:4px 0 8px}
      .preview{font-size:11px;color:#555;max-height:120px;overflow:auto;word-break:break-all}.heading{font-weight:700;margin-bottom:4px}
    </style>
    <div class="wrap">
      <div id="status" class="status"></div>
      <div id="panel" class="panel"></div>
      <div class="bar"><button id="add">追加</button><button id="pick" class="secondary">要素登録</button></div>
    </div>`;

  const statusEl = shadow.getElementById('status');
  const panel = shadow.getElementById('panel');
  const picker = new PickerApi.ElementPicker(document);
  let statusTimer = 0;

  function status(message) {
    statusEl.textContent = message; statusEl.classList.add('show');
    clearTimeout(statusTimer); statusTimer = setTimeout(() => statusEl.classList.remove('show'), 4500);
  }

  function defaultPattern() {
    const segments = location.pathname.split('/').filter(Boolean).map((part) => {
      if (/^\d+$/.test(part) || /^[0-9a-f]{8,}$/i.test(part)) return '*';
      return part;
    });
    return '/' + segments.join('/') + (location.pathname.endsWith('/') ? '/' : '');
  }

  async function getRules() {
    const response = await chrome.runtime.sendMessage({ type:'GET_RULES' });
    return response && response.ok ? response.rules : [];
  }

  function ruleId(origin, pattern) { return 'r_' + btoa(unescape(encodeURIComponent(origin + '|' + pattern))).replace(/=+$/,''); }

  async function saveMapping(field, selected, collection) {
    const all = await getRules();
    const current = RuleLocator.selectBestRule(all, location.href);
    const input = panel.querySelector('#patternInput');
    const pattern = RuleLocator.normalizePathPattern(input ? input.value : (current && current.urlPattern) || defaultPattern());
    const rule = current && current.origin === location.origin ? JSON.parse(JSON.stringify(current)) : { id: ruleId(location.origin, pattern), origin: location.origin, urlPattern: pattern, fields:{} };
    if (rule.urlPattern !== pattern) { rule.urlPattern = pattern; rule.id = ruleId(location.origin, pattern); }
    rule.fields = rule.fields || {};
    if (field === 'allPageImages') rule.fields[field] = { selector: collection.selector, containerCandidates: collection.containerCandidates || [] };
    else rule.fields[field] = { candidates: RuleLocator.generateLocatorCandidates(selected) };
    const response = await chrome.runtime.sendMessage({ type:'SAVE_RULE', rule });
    if (!response || !response.ok) throw new Error('ルール保存に失敗しました。');
    panel.classList.remove('show'); status(fieldLabels[field].replace('を登録','') + 'を登録しました');
  }

  async function showMapping(selected) {
    const all = await getRules().catch(() => []);
    const matched = RuleLocator.selectBestRule(all, location.href);
    const currentPattern = matched ? matched.urlPattern : defaultPattern();
    panel.innerHTML = `<div class="heading">この要素を何として登録しますか？</div><label>URLパターン</label><input id="patternInput" class="pattern" value="${currentPattern.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"><div id="fieldButtons"></div>`;
    const buttons = panel.querySelector('#fieldButtons');
    Object.entries(fieldLabels).forEach(([field, label]) => {
      const button = document.createElement('button'); button.textContent = label;
      button.addEventListener('click', async () => {
        try {
          if (field === 'allPageImages') {
            const inferred = Extractor.inferImageCollection(selected);
            panel.innerHTML = `<div class="heading">全ページ画像: ${inferred.count}枚検出</div><div class="preview">${inferred.urls.slice(0,10).map((u,i)=>`${i+1}. ${u}`).join('<br>') || '画像を検出できませんでした'}</div><button id="confirmAll">この範囲を登録</button><button id="back" class="secondary">戻る</button>`;
            panel.querySelector('#confirmAll').disabled = inferred.count === 0;
            panel.querySelector('#confirmAll').addEventListener('click', () => saveMapping(field, selected, inferred).catch((e)=>status(e.message)));
            panel.querySelector('#back').addEventListener('click', () => showMapping(selected));
            return;
          }
          await saveMapping(field, selected, null);
        } catch (error) { status(error.message || String(error)); }
      });
      buttons.appendChild(button);
    });
    panel.classList.add('show');
  }

  shadow.getElementById('pick').addEventListener('click', () => {
    panel.classList.remove('show');
    if (!picker.start(showMapping)) status('要素選択はすでに開始しています');
    else status('登録したい要素をクリックしてください（Escで取消）');
  });

  shadow.getElementById('add').addEventListener('click', async () => {
    try {
      const rules = await getRules(); const rule = RuleLocator.selectBestRule(rules, location.href);
      if (!rule) throw new Error('このURLに一致する抽出ルールがありません。');
      const draft = Extractor.extractDraft(rule, document, location.href);
      const response = await chrome.runtime.sendMessage({ type:'QUEUE_DRAFT', draft });
      if (!response || !response.ok) throw new Error('追加キューへの保存に失敗しました。');
      status(response.delivered ? 'testCodeに追加しました' : 'testCode待機中です。次回開いたとき自動追加します');
    } catch (error) { status(error.message || String(error)); }
  });
})();