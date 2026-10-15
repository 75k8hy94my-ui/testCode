(() => {
  'use strict';
  const root = document.documentElement;
  const page = document.querySelector('.statutes-page #routeContent.statutesMain');
  const host = document.getElementById('homeApp');
  if (!page || !host) return;

  const articles = new Map();
  page.querySelectorAll('.statuteCard').forEach(card => {
    const number = card.querySelector('.statuteNumber')?.textContent.trim();
    if (number) articles.set(number, card);
  });

  // Make references clickable only when the actual article exists on this page.
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
  panel.innerHTML = '<div class="statutesSplitToolbar"><div class="statutesSplitTabs" role="tablist" aria-label="参照条文タブ"></div><button class="statutesSplitClose" type="button" aria-label="参照条文を閉じる">×</button></div><div class="statutesSplitScroll" id="statutesSplitContent" role="tabpanel" aria-label="参照条文"></div>';
  host.appendChild(panel);
  panel.inert = true;

  const content = panel.querySelector('.statutesSplitScroll');
  const tabBar = panel.querySelector('.statutesSplitTabs');
  const close = panel.querySelector('.statutesSplitClose');
  const popup = document.getElementById('statuteSelectionPopup');
  const tabs = [];
  const highlighted = new Set();
  let activeTab = null;
  let originLink = null;
  let restoreWindowScroll = 0;
  let tabId = 0;

  function markLink(link) {
    if (!link) return;
    link.classList.add('is-ref-trigger');
    link.setAttribute('aria-expanded', 'true');
    highlighted.add(link);
  }

  function clearHighlights() {
    highlighted.forEach(link => {
      link.classList.remove('is-ref-trigger');
      link.removeAttribute('aria-expanded');
    });
    highlighted.clear();
  }

  function fitPanelToArticle() {
    if (!activeTab) return;
    const styles = getComputedStyle(content);
    const padding = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    const needed = Math.ceil(tabBar.parentElement.getBoundingClientRect().height +
      activeTab.node.getBoundingClientRect().height + padding + 2);
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const bottom = parseFloat(getComputedStyle(panel).bottom) || 0;
    const maxHeight = Math.max(90, Math.min(420, viewportHeight * 0.42, viewportHeight - bottom - 90));
    root.style.setProperty('--statutes-split-height', Math.max(65, Math.min(needed, maxHeight)) + 'px');
  }

  function renderTabs() {
    tabBar.replaceChildren();
    tabs.forEach(tab => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'statutesSplitTab';
      button.id = tab.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'statutesSplitContent');
      button.setAttribute('aria-selected', String(tab === activeTab));
      button.tabIndex = tab === activeTab ? 0 : -1;
      button.textContent = tab.number;
      button.addEventListener('click', () => activateTab(tab));
      tabBar.appendChild(button);
    });
  }

  function activateTab(tab, focusTab = false) {
    if (activeTab && activeTab !== tab) activeTab.scrollTop = content.scrollTop;
    activeTab = tab;
    content.replaceChildren(tab.node);
    content.scrollTop = tab.scrollTop || 0;
    renderTabs();
    fitPanelToArticle();
    if (focusTab) tabBar.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
  }

  function newTab(number, sourceLink) {
    const article = articles.get(number);
    if (!article) return;
    const existing = tabs.find(tab => tab.number === number);
    if (existing) {
      activateTab(existing);
    } else {
      const tab = {
        id: 'statutesRefTab' + (++tabId),
        number,
        node: article.cloneNode(true),
        scrollTop: 0
      };
      tabs.push(tab);
      activateTab(tab);
    }
    markLink(sourceLink);
    window.getSelection()?.removeAllRanges();
    if (popup) popup.dataset.visible = 'false';
  }

  function beginReferences(number, link) {
    const open = root.classList.contains('statutes-split-open');
    if (open && link === originLink) {
      closeReferences();
      return;
    }

    if (!open) {
      restoreWindowScroll = root.classList.contains('statutes-definition-open') ? page.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
      root.classList.add('statutes-split-open');
      panel.inert = false;
      panel.setAttribute('aria-hidden', 'false');
      window.scrollTo(0, 0);
      page.scrollTop = restoreWindowScroll;
    }

    clearHighlights();
    tabs.length = 0;
    activeTab = null;
    originLink = link;
    newTab(number, link);
  }

  function closeReferences() {
    if (!root.classList.contains('statutes-split-open')) return;
    const scroll = page.scrollTop;
    root.classList.remove('statutes-split-open');
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    content.replaceChildren();
    tabBar.replaceChildren();
    clearHighlights();
    tabs.length = 0;
    activeTab = null;
    originLink = null;
    root.style.removeProperty('--statutes-split-height');
    requestAnimationFrame(() => {
      if (root.classList.contains('statutes-definition-open')) page.scrollTop = scroll;
      else window.scrollTo(0, scroll);
    });
  }

  document.addEventListener('click', event => {
    const link = event.target.closest?.('.statuteReference');
    if (!link || (!page.contains(link) && !panel.contains(link))) return;
    event.preventDefault();
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;
    if (page.contains(link)) beginReferences(link.dataset.statuteRef, link);
    else newTab(link.dataset.statuteRef, link);
  });

  close.addEventListener('click', closeReferences);
  tabBar.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !tabs.length) return;
    event.preventDefault();
    let next = tabs.indexOf(activeTab);
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else next = (next + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    activateTab(tabs[next], true);
  });
  window.addEventListener('resize', () => {
    if (root.classList.contains('statutes-split-open')) fitPanelToArticle();
  });
  window.visualViewport?.addEventListener('resize', () => {
    if (root.classList.contains('statutes-split-open')) fitPanelToArticle();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.classList.contains('statutes-split-open')) {
      event.preventDefault();
      closeReferences();
    }
  });
})();
