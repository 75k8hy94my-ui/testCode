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
  let cards = [];
  let index = 0;

  function render() {
    const entry = cards[index];
    study.hidden = !entry;
    empty.hidden = !!entry;
    count.textContent = entry ? (index + 1) + ' / ' + cards.length : '0 / 0';
    if (!entry) return;
    term.textContent = entry.quote;
    source.textContent = entry.source;
    answer.textContent = entry.definition;
    answer.hidden = true;
    flip.textContent = '答えを見る';
    prev.disabled = index === 0;
    next.disabled = index === cards.length - 1;
  }
  function refresh() {
    const selected = cards[index];
    const selectedId = selected && [selected.subject, selected.article, selected.part, selected.start, selected.end].join(':');
    cards = store.loadDefinitions().filter(entry => entry.definition.trim());
    const found = selectedId && cards.findIndex(entry =>
      [entry.subject, entry.article, entry.part, entry.start, entry.end].join(':') === selectedId);
    index = Math.max(0, Math.min(cards.length - 1, found >= 0 ? found : index));
    render();
  }
  flip.addEventListener('click', () => {
    answer.hidden = !answer.hidden;
    flip.textContent = answer.hidden ? '答えを見る' : '答えを隠す';
  });
  prev.addEventListener('click', () => { if (index > 0) { index--; render(); } });
  next.addEventListener('click', () => { if (index < cards.length - 1) { index++; render(); } });
  window.addEventListener('storage', event => { if (event.key === store.STORAGE_KEY) refresh(); });
  document.addEventListener('manga-vault-payload-applied', refresh);
  window.DefinitionCards = { refresh };
  refresh();
})();
