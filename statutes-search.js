(() => {
  'use strict';
  if (!document.documentElement.classList.contains('statutes-page')) return;
  const header = document.getElementById('appGlobalHeader');
  const main = document.getElementById('routeContent');
  if (!header || !main) return;

  const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s　]+/g, '');
  const normalizedArticle = value => {
    const text = normalize(value).replace(/^第/, '');
    return /^[0-9]+$/.test(text) ? text + '条' : text;
  };
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
  region.hidden = window.matchMedia('(max-width:899px)').matches;
  region.setAttribute('aria-label', '逐条集検索');
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'statutesSearchInput';
  input.setAttribute('aria-label', '条番号または条文の文字列');
  input.placeholder = '';
  input.autocomplete = 'off';
  const count = document.createElement('span');
  count.id = 'statutesSearchCount';
  count.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.id = 'statutesSearchResults';
  list.className = 'statutesSearchResults';
  region.append(input, list);
  header.appendChild(trigger);
  window.StatutesSearch = { open, close, toggle: () => region.hidden ? open() : close() };
  document.body.appendChild(region);
  let timer = null;
  let version = 0;
  let composing = false;
  const corpusCache = new Map();
  const corpusForSection = section => section.startsWith('civil-') ? 'civil' : section.startsWith('criminal-') ? 'criminal' : null;
  const sectionForArticle = (law, number) => {
    const n = Number(String(number).normalize('NFKC').match(/^\d+/)?.[0]);
    if (law === 'civil') return n <= 174 ? 'civil-general' : n <= 398 ? 'civil-property' : n <= 520 ? 'civil-obligations-general' : n <= 724 ? 'civil-obligations-special' : 'civil-family';
    if (law === 'criminal') return n <= 72 ? 'criminal-general' : 'criminal-special';
    return null;
  };
  const readCorpus = async law => {
    if (!corpusCache.has(law)) corpusCache.set(law, fetch('statutes-data/' + law + '.json?v=20261016-article-captions-2', { cache: 'no-cache' }).then(response => {
      if (!response.ok) throw Error('HTTP ' + response.status);
      return response.json();
    }).catch(error => { corpusCache.delete(law); throw error; }));
    return corpusCache.get(law);
  };

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
    region.style.top = 'auto';
    region.style.right = '16px';
    region.style.bottom = window.matchMedia('(min-width:900px)').matches
      ? '16px' : 'calc(82px + env(safe-area-inset-bottom))';
  }
  trigger.addEventListener('click', () => region.hidden ? open() : close());
  window.addEventListener('resize', position);
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 100); });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('keydown', async event => {
    if (event.key !== 'Enter' || event.isComposing || composing || event.keyCode === 229) return;
    event.preventDefault();
    clearTimeout(timer);
    await search();
    list.querySelector('.statutesSearchResult')?.click();
  });

  function getRows() {
    const section = new URL(location.href).searchParams.get('section') || 'civil-general';
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
  async function search() {
    const serial = ++version;
    const query = normalize(input.value);
    list.replaceChildren();
    if (!query) return;
    let rows = getRows();
    const looksLikeNumber = numberPattern.test(query);
    const targetNumber = normalizedArticle(query);
    const section = window.StatutesNavigation?.currentSection() || new URL(location.href).searchParams.get('section') || 'civil-general';
    const law = corpusForSection(section);
    if (looksLikeNumber && law) {
      try {
        const corpus = await readCorpus(law);
        if (serial !== version || region.hidden) return;
        rows = corpus.articles.map(row => ({ number: row[0], caption: row[3] || '', body: row[2] || '', section: sectionForArticle(law, row[0]) }));
      } catch (_) {
        if (serial !== version) return;
        return;
      }
    }
    const hits = rows.filter(row => {
      const num = normalizedArticle(row.number);
      if (looksLikeNumber) {
        return num === targetNumber;
      }
      return normalize(row.number).includes(query) || normalize(row.caption).includes(query) || normalize(row.body).includes(query);
    });
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
        void (async () => {
          if (row.section && row.section !== (window.StatutesNavigation?.currentSection() || section)) {
            try { await window.StatutesNavigation.selectSection(row.section); } catch (_) { return; }
          }
          const card = [...main.querySelectorAll('.statuteCard')].find(el => el.querySelector('.statuteNumber')?.textContent?.trim() === row.number);
          if (!card) return;
          card.scrollIntoView({ behavior: 'instant', block: 'center' });
          card.classList.add('statutesSearchHit');
          setTimeout(() => card.classList.remove('statutesSearchHit'), 1800);
        })();
      });
      list.appendChild(button);
    });
  }
  // The existing menu swaps the article content when the user changes laws.
  const observer = new MutationObserver(() => {
    if (region.hidden) return;
    clearTimeout(timer);
    timer = setTimeout(search, 80);
  });
  observer.observe(main, { childList: true });
  trigger.setAttribute('aria-expanded', String(!region.hidden));
  position();
})();
