(() => {
  'use strict';
  const store = window.StatutesDefinitionStore;
  const manualStore = window.ManualStudyCards;
  const main = document.getElementById('definitionCardsRoot');
  if (!store || !manualStore || !main) return;
  const study = document.getElementById('definitionCardsStudy');
  const empty = document.getElementById('definitionCardsEmpty');
  const count = document.getElementById('definitionCardsCount');
  const term = document.getElementById('definitionCardsTerm');
  const source = document.getElementById('definitionCardsSource');
  const answer = document.getElementById('definitionCardsAnswer');
  const flip = document.getElementById('definitionCardsFlip');
  const prev = document.getElementById('definitionCardsPrev');
  const next = document.getElementById('definitionCardsNext');
  const rating = document.getElementById('definitionCardsRating');
  const summary = document.getElementById('definitionCardsSummary');
  const allToggle = document.getElementById('definitionCardsAll');
  const progressKey = 'testCode.statutes.definitionReviews.v1';
  const calibrationFlag = 'testCode.statutes.fsrsPendingSync.v1';
  const exportButton = document.getElementById('definitionCardsExport');
  const retentionKey = 'testCode.statutes.definitionRetention.v1';
  const weightsKey = 'testCode.statutes.definitionFSRSWeights.v1';
  const optimizeButton = document.getElementById('definitionCardsOptimize');
  const optimizeStatus = document.getElementById('definitionCardsOptimizeStatus');
  const customWeights = () => {try { const value=JSON.parse(localStorage.getItem(weightsKey)||'null');return window.DefinitionFSRS.validWeights(value)?value:null;}catch(_){return null;}};
  const retentionSelect = document.getElementById('definitionCardsRetention');
  const desiredRetention = () => { const x=Number(localStorage.getItem(retentionKey)); return x>=0.7&&x<=0.97?x:0.9; };
  if (retentionSelect) retentionSelect.value=String(desiredRetention());
  const cardId = entry => entry.manualId ? manualStore.reviewId(entry.manualId) : [entry.subject, entry.article, entry.part, entry.start, entry.end].join(':');
  const asStudyCard = entry => ({manualId:entry.id, quote:entry.front, definition:entry.back, source:entry.category || '手動カード'});
  let cards = [], queue = [], index = 0, history = {}, nextDueTimer = null;

  function loadHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(progressKey) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }
  function saveHistory() {
    try { localStorage.setItem(progressKey, JSON.stringify(history)); return true; }
    catch (_) { return false; }
  }
  const schedule = (previous, grade, now = Date.now()) => window.DefinitionFSRS.schedule(previous, grade, now, {retention: desiredRetention(),weights: customWeights()});
  function isDue(entry) {
    const due = Number(history[cardId(entry)]?.due);
    return !Number.isFinite(due) || due <= Date.now();
  }
  function rebuild(keepId) {
    cards = [...store.loadDefinitions().filter(entry => entry.definition.trim()), ...manualStore.load().map(asStudyCard)];
    history = loadHistory();
    const active = allToggle.checked ? cards : cards.filter(isDue);
    queue = active.sort((a, b) => {
      const da = Number(history[cardId(a)]?.due) || 0, db = Number(history[cardId(b)]?.due) || 0;
      return da - db;
    });
    const found = keepId ? queue.findIndex(e => cardId(e) === keepId) : -1;
    index = found >= 0 ? found : Math.min(index, Math.max(0, queue.length - 1));
    render();
    renderManualList();
  }
  function render() {
    if(nextDueTimer!==null){clearTimeout(nextDueTimer);nextDueTimer=null;}
    const entry = queue[index];
    const dueCount = cards.filter(isDue).length;
    summary.textContent = '復習待ち ' + dueCount + '枚 / 全' + cards.length + '枚';
    count.textContent = entry ? (index + 1) + ' / ' + queue.length : '0 / 0';
    study.hidden = !entry;
    empty.hidden = !!entry;
    empty.textContent = cards.length ? '今日の復習は完了しました。' : 'カードはまだありません。「カードを追加・管理」から作成するか、逐条集で定義を登録してください。';
    if (!entry) {
      const now=Date.now();
      const due=cards.map(e=>Number(history[cardId(e)]?.due)).filter(t=>Number.isFinite(t)&&t>now).sort((a,b)=>a-b)[0];
      if(due && !allToggle.checked){
        const mins=Math.max(1,Math.ceil((due-now)/60000));
        empty.textContent=mins<60?'次の復習まで約'+mins+'分です。':'今日の復習は完了しました。次回：'+new Date(due).toLocaleString('ja-JP');
        nextDueTimer=setTimeout(refresh,Math.max(1000,Math.min(60000,due-now+50)));
      }
      return;
    }
    term.textContent = entry.quote;
    source.textContent = entry.source + (entry.definitionKind === 'statute' ? ' ・ 条文による定義' : '');
    answer.textContent = entry.definition;
    answer.hidden = true;
    flip.textContent = '答えを見る';
    rating.hidden = true;
    const ready=window.DefinitionFSRS.isReady();
    flip.disabled=!ready;
    if(!ready)summary.textContent+=' ・ 公式FSRSの読込待ち';
    prev.disabled = index === 0;
    next.disabled = index === queue.length - 1;
  }
  function refresh() { rebuild(queue[index] && cardId(queue[index])); }
  flip.addEventListener('click', () => {
    answer.hidden = !answer.hidden;
    flip.textContent = answer.hidden ? '答えを見る' : '答えを隠す';
    rating.hidden = answer.hidden;
  });
  rating.addEventListener('click', event => {
    const button = event.target.closest('button[data-grade]');
    if (!button || !queue[index] || answer.hidden) return;
    const grade = Number(button.dataset.grade);
    if (!Number.isInteger(grade) || grade < 0 || grade > 3) return;
    const id = cardId(queue[index]);
    const old = history[id];
    try { history[id] = schedule(old, grade); }
    catch(error) { alert(error.message || 'FSRSの計算に失敗しました。'); return; }
    if (!saveHistory()) { history[id] = old; alert('学習履歴を保存できませんでした。'); return; }
    if (!window.TestCodeGuest?.isActive()) {
      try { window.StatutesVault?.changed?.(); } catch (_) { /* retry on next Vault sync */ }
    }
    if (allToggle.checked) {
      const nextId = queue[index + 1] && cardId(queue[index + 1]);
      rebuild(nextId);
      if (!nextId && queue.length) index = queue.length - 1;
      render();
    } else {
      index = 0;
      rebuild();
    }
  });
  prev.addEventListener('click', () => { if (index > 0) { index--; render(); } });
  next.addEventListener('click', () => { if (index < queue.length - 1) { index++; render(); } });
  allToggle.addEventListener('change', () => { index = 0; rebuild(); });
  retentionSelect?.addEventListener('change', () => {
    const value=Number(retentionSelect.value);
    if (value<0.7||value>0.97) return;
    try {
      localStorage.setItem(retentionKey,String(value));
      history=loadHistory();
      for (const [id, record] of Object.entries(history)) history[id]=window.DefinitionFSRS.reschedule(record,value,customWeights());
      if (!saveHistory()) throw Error('save failed');
      if (!window.TestCodeGuest?.isActive()) { window.StatutesVault?.changed?.(); }
      rebuild();
    } catch (_) { alert('復習設定を保存できませんでした。'); }
  });
  // Export immutable review events, preserving timestamps and four-grade values.
  // Do not claim that the former local coordinate-descent fit is Anki-equivalent.
  optimizeButton?.addEventListener('click', () => { location.href='fsrs-trainer/index.html'; });
  exportButton?.addEventListener('click', () => {
    const entries=Object.entries(loadHistory()).flatMap(([cardId,record]) => (
      Array.isArray(record?.reviews) ? record.reviews.filter(e=>Number.isFinite(e.at)&&Number.isInteger(e.grade)&&e.grade>=0&&e.grade<=3).map(e=>({
        card_id:cardId,review_time:new Date(e.at).toISOString(),rating:e.grade+1
      })) : []
    ));
    if(!entries.length){optimizeStatus.textContent='出力できる復習履歴がありません。';return;}
    const header='card_id,review_time,rating';
    const csv=[header,...entries.map(e=>[e.card_id,e.review_time,e.rating].map(x=>'"'+String(x).replaceAll('"','""')+'"').join(','))].join('\\n');
    const blob=new Blob(['\\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download='definition-fsrs-reviews.csv';
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    optimizeStatus.textContent=entries.length+'件の復習記録をCSVで出力しました。公式最適化には形式変換が必要です。';
  });

  function applyPendingCalibration() {
    if(!localStorage.getItem(calibrationFlag))return false;
    if(!window.DefinitionFSRS.isReady())throw Error('公式FSRSスケジューラーを読み込めませんでした。');
    const current=loadHistory(),weights=customWeights();
    for(const [id,record] of Object.entries(current))current[id]=window.DefinitionFSRS.reschedule(record,desiredRetention(),weights);
    localStorage.setItem(progressKey,JSON.stringify(current));
    refresh();
    return true;
  }

  const manageToggle = document.getElementById('definitionCardsManageToggle');
  const managerPanel = document.getElementById('definitionCardsManager');
  const manualForm = document.getElementById('definitionCardsManualForm');
  const frontField = document.getElementById('definitionCardsManualFront');
  const backField = document.getElementById('definitionCardsManualBack');
  const categoryField = document.getElementById('definitionCardsManualCategory');
  const manualStatus = document.getElementById('definitionCardsManualStatus');
  const manualSave = document.getElementById('definitionCardsManualSave');
  const manualNew = document.getElementById('definitionCardsManualNew');
  const formHeading = document.getElementById('definitionCardsFormHeading');
  const manualList = document.getElementById('definitionCardsManualList');
  const manualTotal = document.getElementById('definitionCardsManualTotal');
  let editingManualId = null;
  function showManager(visible) {
    managerPanel.hidden = !visible;
    manageToggle.setAttribute('aria-expanded',String(visible));
    if (visible) frontField.focus();
  }
  function resetManualForm() {
    editingManualId = null;
    manualForm.reset();
    formHeading.textContent = '新しいカードを作成';
    manualSave.textContent = 'カードを保存';
  }
  function editManualCard(card) {
    editingManualId = card.id;
    frontField.value = card.front;
    backField.value = card.back;
    categoryField.value = card.category;
    formHeading.textContent = '手動カードを編集';
    manualSave.textContent = '変更を保存';
    manualStatus.textContent = '';
    showManager(true);
  }
  function renderManualList() {
    if (!manualList) return;
    const manual = manualStore.load();
    manualTotal.textContent = '(' + manual.length + '枚)';
    manualList.replaceChildren();
    for (const card of manual) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'definitionCardsManualTitle';
      label.textContent = card.front;
      if (card.category) {
        const cat = document.createElement('small');
        cat.textContent = card.category;
        label.appendChild(cat);
      }
      const actions = document.createElement('div');
      actions.className = 'definitionCardsManualActions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = '編集';
      edit.setAttribute('aria-label',card.front+'を編集');
      edit.addEventListener('click',() => editManualCard(card));
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '削除';
      del.setAttribute('aria-label',card.front+'を削除');
      del.addEventListener('click',() => {
        if (!confirm('このカードと学習履歴を削除します。元に戻せません。よろしいですか？')) return;
        const savedCards = localStorage.getItem(manualStore.STORAGE_KEY);
        const savedReviews = localStorage.getItem(progressKey);
        try {
          manualStore.remove(card.id);
          const reviewData = loadHistory();
          delete reviewData[manualStore.reviewId(card.id)];
          localStorage.setItem(progressKey,JSON.stringify(reviewData));
          if (editingManualId === card.id) resetManualForm();
          manualStatus.textContent = 'カードを削除しました。';
          notifyManualChange();
          refresh();
        } catch(error) {
          try {
            if (savedCards === null) localStorage.removeItem(manualStore.STORAGE_KEY);
            else localStorage.setItem(manualStore.STORAGE_KEY,savedCards);
            if (savedReviews === null) localStorage.removeItem(progressKey);
            else localStorage.setItem(progressKey,savedReviews);
          } catch (_) {}
          manualStatus.textContent = '削除に失敗しました：' + (error.message || error);
        }
      });
      actions.append(edit,del);
      li.append(label,actions);
      manualList.appendChild(li);
    }
  }
  function notifyManualChange() {
    if (!window.TestCodeGuest?.isActive()) window.StatutesVault?.changed?.();
  }
  manageToggle?.addEventListener('click',() => {
    const opening = managerPanel.hidden;
    if (opening) resetManualForm();
    showManager(opening);
  });
  manualNew?.addEventListener('click',() => {
    resetManualForm();
    manualStatus.textContent = '';
    frontField.focus();
  });
  manualForm?.addEventListener('submit',event => {
    event.preventDefault();
    const input={front:frontField.value,back:backField.value,category:categoryField.value};
    try {
      const entry=editingManualId
        ? manualStore.update(editingManualId,input)
        : manualStore.insert(input);
      manualStatus.textContent = editingManualId ? '変更を保存しました。学習履歴は維持されます。' : '新しいカードを保存しました。すぐに復習できます。';
      resetManualForm();
      notifyManualChange();
      index=0;
      rebuild(manualStore.reviewId(entry.id));
    } catch(error) {
      manualStatus.textContent = '保存できませんでした：' + (error.message || error);
    }
  });

  window.addEventListener('storage', event => {
    if (event.key === store.STORAGE_KEY || event.key === manualStore.STORAGE_KEY || event.key === progressKey) refresh();
  });
  document.addEventListener('manga-vault-payload-applied', refresh);
  window.addEventListener('focus',()=>{if(!queue.length)refresh();});
  window.DefinitionCards = { refresh, schedule, progressKey, applyPendingCalibration, calibrationFlag };
  refresh();
})();
