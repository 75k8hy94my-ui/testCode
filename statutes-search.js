(() => {
  'use strict';
  if (!document.documentElement.classList.contains('statutes-page')) return;
  const header = document.getElementById('appGlobalHeader');
  const main = document.getElementById('routeContent');
  if (!header || !main) return;

  const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s　]+/g, '');
  const normalizedArticle = value => normalize(value).replace(/^第/, '').replace(/条$/, '').replace(/条/, '条');
  const numberPattern = /^(?:第)?[0-9]+(?:条(?:の[0-9]+)*)?$/;
  const trigger = document.createElement('button');
  trigger.id = 'statutesSearchToggle';
  trigger.className = 'statutesEditToggle';
  trigger.type = 'button';
  trigger.setAttribute('aria-label', '条文を検索');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.title = '条番号・条文の文字列を検索';
  trigger.textContent = '⌕ 検索';
  const region = document.createElement('section');
  region.id = 'statutesSearchPanel';
  region.className = 'statutesSearchPanel';
  region.hidden = true;
  region.setAttribute('aria-label', '逐条集検索');
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'statutesSearchInput';
  input.setAttribute('aria-label', '条番号または条文の文字列');
  input.placeholder = '条番号・条文の文字列を検索';
  input.autocomplete = 'off';
  const count = document.createElement('span');
  count.id = 'statutesSearchCount';
  count.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.id = 'statutesSearchResults';
  list.className = 'statutesSearchResults';
  region.append(input, count, list);
  header.appendChild(trigger);
  document.body.appendChild(region);
  let timer = null;
  let version = 0;
  let activeSection = '';
  const indexed = new Map();

  function open() {
    region.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    position();
    input.focus();
    search();
  }
  function close() {
    region.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  }
  function position() {
    const rect = trigger.getBoundingClientRect();
    region.style.top = Math.min(window.innerHeight - 80, rect.bottom + 7) + 'px';
    region.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
  }
  trigger.addEventListener('click', () => region.hidden ? open() : close());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !region.hidden) { event.preventDefault(); close(); }
  });
  document.addEventListener('pointerdown', event => {
    if (!region.hidden && !region.contains(event.target) && !trigger.contains(event.target)) close();
  });
  window.addEventListener('resize', position);
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 100); });

  function getRows() {
    const section = new URL(location.href).searchParams.get('section') || 'civil-general';
    if (indexed.has(section)) return indexed.get(section);
    // The dataset is checked into the repository, not fetched from an external API.
    const cards = [...main.querySelectorAll('.statuteCard')];
    return cards.map(card => ({
      number: card.querySelector('.statuteNumber')?.textContent?.trim() || '',
      caption: card.querySelector('.statuteHeading')?.textContent?.trim() || '',
      body: card.querySelector('.statuteText')?.textContent || '',
    })).filter(item => item.number);
  }
  function snippet(body, term) {
    const n = normalize(body);
    const idx = n.indexOf(term);
    // Keep excerpt legible even when whitespace was normalized for matching.
    return body.slice(0, 100).replace(/\s+/g, ' ').trim() + (body.length > 100 ? '…' : '');
  }
  function search() {
    const query = normalize(input.value);
    list.replaceChildren();
    if (!query) { count.textContent = '現在の法令から検索します'; return; }
    const rows = getRows();
    const looksLikeNumber = numberPattern.test(query);
    const targetNumber = normalizedArticle(query);
    const hits = rows.filter(row => {
      const num = normalizedArticle(row.number);
      if (looksLikeNumber) {
        const requested = targetNumber.endsWith('条') ? targetNumber : targetNumber + '条';
        return num === requested;
      }
      return normalize(row.number).includes(query) || normalize(row.caption).includes(query) || normalize(row.body).includes(query);
    });
    count.textContent = hits.length + '件見つかりました';
    hits.slice(0, 100).forEach(row => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'statutesSearchResult';
      const heading = document.createElement('strong');
      heading.textContent = row.number + (row.caption ? '　' + row.caption : '');
      const excerpt = document.createElement('span');
      excerpt.textContent = snippet(row.body, query);
      button.append(heading, excerpt);
      button.addEventListener('click', () => {
        const card = [...main.querySelectorAll('.statuteCard')].find(el => el.querySelector('.statuteNumber')?.textContent?.trim() === row.number);
        if (!card) return;
        region.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('statutesSearchHit');
        setTimeout(() => card.classList.remove('statutesSearchHit'), 1800);
      });
      list.appendChild(button);
    });
    if (hits.length > 100) count.textContent += '（先頭100件を表示）';
  }
  // The existing menu swaps the article content when the user changes laws.
  const observer = new MutationObserver(() => {
    if (region.hidden) return;
    clearTimeout(timer);
    timer = setTimeout(search, 80);
  });
  observer.observe(main, { childList: true });
})();
