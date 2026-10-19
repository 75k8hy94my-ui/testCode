(() => {
  'use strict';
  const store = window.StatutesDefinitionStore;
  const main = document.getElementById('definitionCardsRoot');
  if (!store || !main) return;
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
  const cardId = entry => [entry.subject, entry.article, entry.part, entry.start, entry.end].join(':');
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
    cards = store.loadDefinitions().filter(entry => entry.definition.trim());
    history = loadHistory();
    const active = allToggle.checked ? cards : cards.filter(isDue);
    queue = active.sort((a, b) => {
      const da = Number(history[cardId(a)]?.due) || 0, db = Number(history[cardId(b)]?.due) || 0;
      return da - db;
    });
    const found = keepId ? queue.findIndex(e => cardId(e) === keepId) : -1;
    index = found >= 0 ? found : Math.min(index, Math.max(0, queue.length - 1));
    render();
  }
  function render() {
    if(nextDueTimer!==null){clearTimeout(nextDueTimer);nextDueTimer=null;}
    const entry = queue[index];
    const dueCount = cards.filter(isDue).length;
    summary.textContent = '復習待ち ' + dueCount + '枚 / 全' + cards.length + '枚';
    count.textContent = entry ? (index + 1) + ' / ' + queue.length : '0 / 0';
    study.hidden = !entry;
    empty.hidden = !!entry;
    empty.textContent = cards.length ? '今日の復習は完了しました。' : '定義はまだ登録されていません。逐条集で定義を登録してください。';
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
  window.addEventListener('storage', event => {
    if (event.key === store.STORAGE_KEY || event.key === progressKey) refresh();
  });
  document.addEventListener('manga-vault-payload-applied', refresh);
  window.addEventListener('focus',()=>{if(!queue.length)refresh();});
  window.DefinitionCards = { refresh, schedule, progressKey, applyPendingCalibration, calibrationFlag };
  refresh();
})();
