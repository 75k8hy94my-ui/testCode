(() => {
  'use strict';
  if (!document.documentElement.classList.contains('statutes-page')) return;

  const menus = [
    { id: 'constitution', label: '憲法' },
    { id: 'civil', label: '民法', children: [
      { id: 'civil-general', label: '民法総則' },
      { id: 'civil-property', label: '物権' },
      { id: 'civil-obligations-general', label: '債権総論' },
      { id: 'civil-obligations-special', label: '債権各論' },
      { id: 'civil-family', label: '家族法' }
    ] },
    { id: 'criminal', label: '刑法', children: [
      { id: 'criminal-general', label: '刑法総論' },
      { id: 'criminal-special', label: '刑法各論' }
    ] },
    { id: 'civil-procedure', label: '民訴' },
    { id: 'criminal-procedure', label: '刑訴' },
    { id: 'corporations', label: '会社法' },
    { id: 'administrative', label: '行政法', children: [
      { id: 'administrative-litigation', label: '行政事件訴訟法' },
      { id: 'administrative-procedure', label: '行政手続法' },
      { id: 'administrative-appeal', label: '行政不服審査法' },
      { id: 'administrative-execution', label: '行政代執行法' },
      { id: 'state-compensation', label: '国家賠償法' },
      { id: 'local-autonomy', label: '地方自治法' },
      { id: 'information-disclosure', label: '情報公開法' }
    ] },
    { id: 'labor', label: '労働法', children: [
      { id: 'labor-standards', label: '労働基準法' },
      { id: 'labor-contract', label: '労働契約法' },
      { id: 'labor-unions', label: '労働組合法' },
      { id: 'labor-relations', label: '労働関係調整法' },
      { id: 'labor-safety', label: '労働安全衛生法' },
      { id: 'labor-dispatch', label: '労働者派遣法' },
      { id: 'minimum-wage', label: '最低賃金法' },
      { id: 'equal-employment', label: '男女雇用機会均等法' },
      { id: 'childcare-leave', label: '育児・介護休業法' }
    ] }
  ];

  const header = document.getElementById('appGlobalHeader') || document.querySelector('.homeHeader');
  const brand = header?.querySelector('.globalShellBrand') || header?.firstElementChild;
  const page = document.querySelector('#routeContent.statutesMain');
  if (!header || !brand || !page) return;

  const currentSectionLabel = document.createElement('span');
  currentSectionLabel.id = 'statutesCurrentSection';
  currentSectionLabel.className = 'statutesCurrentSection';
  currentSectionLabel.setAttribute('aria-live', 'polite');

  const articleCards = Array.from(page.querySelectorAll('.statuteCard'));
  const menuBar = document.createElement('nav');
  menuBar.id = 'statutesLawMenu';
  menuBar.className = 'statutesLawMenu';
  menuBar.setAttribute('aria-label', '逐条集の科目');
  const dropdown = document.createElement('div');
  dropdown.id = 'statutesLawDropdown';
  dropdown.className = 'statutesLawDropdown';
  dropdown.setAttribute('role', 'menu');
  dropdown.setAttribute('aria-label', '下位分類');
  dropdown.hidden = true;
  document.body.appendChild(dropdown);

  const categories = new Map();
  menus.forEach(root => {
    categories.set(root.id, { root, child: null });
    root.children?.forEach(child => categories.set(child.id, { root, child }));
  });
  const DEFAULT_SECTION = 'civil-general';
  const sectionFromUrl = () => {
    const id = new URL(window.location.href).searchParams.get('section');
    return categories.has(id) ? id : DEFAULT_SECTION;
  };

  let currentRoot = 'civil';
  let currentCategory = DEFAULT_SECTION;
  let openRoot = null;
  let menuPinned = false;
  let closeTimer = null;
  const roots = new Map();

  const cancelClose = () => {
    if (closeTimer !== null) clearTimeout(closeTimer);
    closeTimer = null;
  };
  const scheduleClose = () => {
    cancelClose();
    if (menuPinned) return;
    closeTimer = setTimeout(closeDropdown, 160);
  };

  function closeDropdown() {
    cancelClose();
    dropdown.hidden = true;
    dropdown.replaceChildren();
    openRoot = null;
    menuPinned = false;
    roots.forEach(button => button.setAttribute('aria-expanded', 'false'));
  }

  function positionDropdown() {
    if (!openRoot || dropdown.hidden) return;
    const button = roots.get(openRoot.id);
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = dropdown.offsetWidth;
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const mobile = window.matchMedia('(max-width:899px)').matches;
    dropdown.style.left = x + 'px';
    if (mobile) {
      const available = Math.max(90, rect.top - 12);
      dropdown.style.maxHeight = available + 'px';
      dropdown.style.top = Math.max(8, rect.top - Math.min(dropdown.scrollHeight, available) - 6) + 'px';
    } else {
      const y = Math.min(rect.bottom, window.innerHeight - 48);
      dropdown.style.top = y + 'px';
      dropdown.style.maxHeight = Math.max(90, window.innerHeight - y - 10) + 'px';
    }
  }

  function renderCategory(id) {
    const category = categories.get(id) || categories.get(DEFAULT_SECTION);
    const { root, child } = category;
    const next = child?.id || root.id;
    if (document.documentElement.classList.contains('statutes-split-open')) {
      document.querySelector('.statutesSplitClose')?.click();
    }
    currentRoot = root.id;
    currentCategory = next;
    currentSectionLabel.textContent = child?.label || root.label;
    const loading = window.StatutesData ? window.StatutesData.load(next) : Promise.resolve();
    if (!window.StatutesData) articleCards.forEach(card => { card.hidden = next !== 'civil-general'; });
    roots.forEach((button, rootId) => {
      if (rootId === currentRoot) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    // Keep an open submenu available when its category is selected.
    if (openRoot && openRoot.id !== currentRoot) closeDropdown();
    if (!dropdown.hidden) {
      dropdown.querySelectorAll('.statutesLawMenuItem').forEach(item => {
        if (item.dataset.section === currentCategory) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
      positionDropdown();
    }
    return loading;
  }

  function selectCategory(root, child = null) {
    const id = child?.id || root.id;
    const url = new URL(window.location.href);
    // Each category gets a distinct address and its own browser history entry.
    if (url.searchParams.get('section') !== id) {
      url.searchParams.set('section', id);
      window.history.pushState({ statuteSection: id }, '', url);
    }
    renderCategory(id);
    if (child && openRoot === root && !dropdown.hidden) {
      menuPinned = true;
      cancelClose();
    }
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function openDropdown(root, focusFirst = false) {
    cancelClose();
    if (!root.children?.length) { closeDropdown(); return; }
    if (openRoot !== root) menuPinned = false;
    openRoot = root;
    dropdown.replaceChildren();
    dropdown.setAttribute('aria-label', root.label + 'の下位分類');
    root.children.forEach(child => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'statutesLawMenuItem';
      item.setAttribute('role', 'menuitem');
      item.textContent = child.label;
      item.dataset.section = child.id;
      if (currentCategory === child.id) item.setAttribute('aria-current', 'page');
      item.addEventListener('click', () => selectCategory(root, child));
      dropdown.appendChild(item);
    });
    dropdown.hidden = false;
    roots.forEach((button, id) => button.setAttribute('aria-expanded', String(id === root.id)));
    positionDropdown();
    if (focusFirst) dropdown.querySelector('button')?.focus();
  }

  menus.forEach(root => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'statutesLawRoot';
    button.textContent = root.label;
    button.dataset.lawRoot = root.id;
    if (root.id === currentRoot) button.setAttribute('aria-current', 'page');
    if (root.children?.length) {
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse') openDropdown(root);
      });
      button.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse') scheduleClose();
      });
      button.addEventListener('click', () => {
        const alreadyOpen = openRoot === root && !dropdown.hidden;
        if (alreadyOpen && (menuPinned || window.matchMedia('(hover: none)').matches)) closeDropdown();
        else openDropdown(root);
      });
      button.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          openDropdown(root, true);
        }
      });
    } else {
      button.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse') closeDropdown();
      });
      button.addEventListener('click', () => selectCategory(root));
    }
    roots.set(root.id, button);
    menuBar.appendChild(button);
  });

  window.StatutesNavigation = {
    selectSection(id) {
      if (!categories.has(id)) return Promise.reject(new Error('Unknown statute section'));
      const url = new URL(window.location.href);
      if (url.searchParams.get('section') !== id) {
        url.searchParams.set('section', id);
        window.history.pushState({ statuteSection: id }, '', url);
      }
      return renderCategory(id);
    },
    currentSection() { return currentCategory; }
  };

  brand.replaceChildren(menuBar);
  brand.after(currentSectionLabel);
  // Restore the selected category on reload, direct URL visits, Back, and Forward.
  renderCategory(sectionFromUrl());
  window.addEventListener('popstate', () => {
    renderCategory(sectionFromUrl());
  });
  dropdown.addEventListener('pointerenter', cancelClose);
  dropdown.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') scheduleClose();
  });
  dropdown.addEventListener('keydown', event => {
    const items = Array.from(dropdown.querySelectorAll('button'));
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      const target = roots.get(openRoot?.id);
      closeDropdown();
      target?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + delta + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!menuBar.contains(event.target) && !dropdown.contains(event.target)) closeDropdown();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dropdown.hidden) closeDropdown();
  });
  menuBar.addEventListener('scroll', positionDropdown, { passive: true });
  window.addEventListener('resize', positionDropdown);
  window.addEventListener('scroll', event => {
    if (!dropdown.hidden && !dropdown.contains(event.target)) positionDropdown();
  }, { passive: true, capture: true });
})();
