(() => {
  'use strict';
  const page = document.querySelector('.statutes-page #routeContent.statutesMain');
  if (!page) return;

  const articles = new Map();
  page.querySelectorAll('.statuteCard').forEach(card => {
    const number = card.querySelector('.statuteNumber')?.textContent.trim();
    if (number) articles.set(number, card);
  });

  // Only references with a locally available article are made interactive.
  const pattern = /第[０-９]+条(?:の[０-９]+)?/g;
  page.querySelectorAll('.statuteSelectable').forEach(span => {
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const source = node.textContent || '';
      pattern.lastIndex = 0;
      let match, end = 0, changed = false;
      const fragment = document.createDocumentFragment();
      while ((match = pattern.exec(source))) {
        const target = match[0].slice(1);
        if (!articles.has(target)) continue;
        changed = true;
        fragment.append(document.createTextNode(source.slice(end, match.index)));
        const link = document.createElement('a');
        link.className = 'statuteReference';
        link.href = '#';
        link.dataset.statuteRef = target;
        link.setAttribute('aria-label', match[0] + 'を下部に表示');
        link.textContent = match[0];
        fragment.append(link);
        end = match.index + match[0].length;
      }
      if (changed) {
        fragment.append(document.createTextNode(source.slice(end)));
        node.replaceWith(fragment);
      }
    });
  });

  const panel = document.createElement('section');
  panel.id = 'statutesSplitPanel';
  panel.className = 'statutesSplitPanel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', '参照条文');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = '<button class="statutesSplitClose" type="button" aria-label="参照条文を閉じる">×</button><div class="statutesSplitScroll"></div>';
  document.getElementById('homeApp').appendChild(panel);
  panel.inert = true;

  const root = document.documentElement;
  const content = panel.querySelector('.statutesSplitScroll');
  const close = panel.querySelector('.statutesSplitClose');
  const popup = document.getElementById('statuteSelectionPopup');
  let previousFocus = null;

  function fitPanelToArticle() {
    const card = content.firstElementChild;
    if (!card) return;
    const styles = getComputedStyle(content);
    const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const needed = Math.ceil(card.getBoundingClientRect().height + padding + 1);
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const maxHeight = Math.min(420, viewportHeight * 0.42);
    root.style.setProperty('--statutes-split-height', Math.ceil(Math.min(needed, maxHeight)) + 'px');
  }

  function showArticle(number, trigger) {
    const article = articles.get(number);
    if (!article) return;
    const alreadyOpen = root.classList.contains('statutes-split-open');
    const oldScroll = window.scrollY || document.documentElement.scrollTop || 0;
    if (!alreadyOpen) previousFocus = trigger;

    content.replaceChildren(article.cloneNode(true));
    fitPanelToArticle();
    content.scrollTop = 0;
    window.getSelection()?.removeAllRanges();
    if (popup) popup.dataset.visible = 'false';

    if (!alreadyOpen) {
      root.classList.add('statutes-split-open');
      panel.inert = false;
      panel.setAttribute('aria-hidden', 'false');
      window.scrollTo(0, 0);
      page.scrollTop = oldScroll;
    }
    close.focus({ preventScroll: true });
  }

  function closeArticle() {
    if (!root.classList.contains('statutes-split-open')) return;
    const restoreScroll = page.scrollTop;
    root.classList.remove('statutes-split-open');
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    content.replaceChildren();
    root.style.removeProperty('--statutes-split-height');
    const focus = previousFocus;
    previousFocus = null;
    requestAnimationFrame(() => {
      window.scrollTo(0, restoreScroll);
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    });
  }

  document.addEventListener('click', event => {
    const link = event.target.closest?.('.statuteReference');
    if (!link || (!page.contains(link) && !panel.contains(link))) return;
    event.preventDefault();
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;
    showArticle(link.dataset.statuteRef, link);
  });

  close.addEventListener('click', closeArticle);
  window.addEventListener('resize', () => {
    if (root.classList.contains('statutes-split-open')) fitPanelToArticle();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.classList.contains('statutes-split-open')) {
      event.preventDefault();
      closeArticle();
    }
  });
})();
