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
  const DAY = 86400000;
  const MINUTE = 60000;
  const cardId = entry => [entry.subject, entry.article, entry.part, entry.start, entry.end].join(':');
  let cards = [], queue = [], index = 0, history = {};

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
  const schedule = (previous, grade, now = Date.now()) => window.DefinitionFSRS.schedule(previous, grade, now);
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
    const entry = queue[index];
    const dueCount = cards.filter(isDue).length;
    summary.textContent = '復習待ち ' + dueCount + '枚 / 全' + cards.length + '枚';
    count.textContent = entry ? (index + 1) + ' / ' + queue.length : '0 / 0';
    study.hidden = !entry;
    empty.hidden = !!entry;
    empty.textContent = cards.length ? '今日の復習は完了しました。' : '定義はまだ登録されていません。逐条集で定義を登録してください。';
    if (!entry) return;
    term.textContent = entry.quote;
    source.textContent = entry.source + (entry.definitionKind === 'statute' ? ' ・ 条文による定義' : '');
    answer.textContent = entry.definition;
    answer.hidden = true;
    flip.textContent = '答えを見る';
    rating.hidden = true;
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
    history[id] = schedule(old, grade);
    if (!saveHistory()) { history[id] = old; alert('学習履歴を保存できませんでした。'); return; }
    if (!window.TestCodeGuest?.isActive()) {
      try { window.MangaVault?.markLocalChangesPending?.(); window.MangaVault?.saveLocalChanges?.(); } catch (_) { /* retry on next Vault sync */ }
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
  window.addEventListener('storage', event => {
    if (event.key === store.STORAGE_KEY || event.key === progressKey) refresh();
  });
  document.addEventListener('manga-vault-payload-applied', refresh);
  window.DefinitionCards = { refresh, schedule, progressKey };
  refresh();
})();
