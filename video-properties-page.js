(function (root) {
  'use strict';
  const doc = root.document;
  const host = doc && doc.getElementById('videoPropertySettings');
  const Model = root.MangaReaderVideoCustomPropertySettingsModel;
  const Store = root.MangaReaderVideoCustomPropertyStore;
  const Property = root.MangaReaderVideoCustomProperties;
  const access = root.MangaReaderMediaAccess;
  if (!host || !Model || !Store || !Property || !access) return;

  const typeNames = { text: 'テキスト', long_text: '長文', single_select: '単一選択', multi_select: '複数選択', checkbox: 'チェックボックス', number: '数値', date: '日付' };
  let state = null;
  let busy = false;
  let deferredRefresh = false;
  const id = () => root.crypto && typeof root.crypto.randomUUID === 'function' ? root.crypto.randomUUID() : `vp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const node = (tag, text, className) => { const element = doc.createElement(tag); if (text != null) element.textContent = text; if (className) element.className = className; return element; };
  const button = (label, action, className = '') => { const element = node('button', label, `videoPropertyButton ${className}`.trim()); element.type = 'button'; element.addEventListener('click', action); return element; };
  const field = (labelText, input) => { const label = node('label', null, 'videoPropertyField'); label.append(node('span', labelText), input); return label; };
  const makeInput = (value = '', placeholder = '') => { const input = doc.createElement('input'); input.value = value; input.placeholder = placeholder; return input; };
  const vault = () => root.MangaVault;

  function announce(message, error = false) {
    const status = doc.getElementById('videoPropertyStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.error = error ? '1' : '0';
  }
  function canRead() { return access.canReadProtectedData() === true; }
  async function change(recipe) {
    if (busy || !canRead()) return;
    busy = true;
    try {
      const result = await Store.mutate({ guest: !!(root.TestCodeGuest && root.TestCodeGuest.isActive()), vault: vault(), recipe: async (current) => ({ ...current, definitions: recipe(current.definitions, current.values) }) });
      state = result.state;
      render();
      announce(result.guest ? 'この端末に保存しました（ゲストデータ）。' : result.synced ? 'この端末とVaultに保存しました。' : `この端末に保存しました。Vault同期は保留中です: ${result.syncError || ''}`);
    } catch (error) {
      announce(error && error.message ? error.message : '保存できませんでした。', true);
    } finally { busy = false; }
  }
  function appendCheckbox(parent, labelText, checked, onChange) {
    const label = node('label', null, 'videoPropertyCheck');
    const input = doc.createElement('input'); input.type = 'checkbox'; input.checked = checked;
    input.setAttribute('aria-label', labelText); input.addEventListener('change', () => onChange(input.checked));
    label.append(input, node('span', labelText)); parent.append(label);
  }
  function sortedProperties() { return Object.values(state.definitions.properties).filter((item) => item && typeof item === 'object').sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); }
  function sortedOptions(property) { return Object.values(property.options || {}).filter((item) => item && typeof item === 'object').sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); }

  function renderOptions(card, property) {
    if (!['single_select', 'multi_select'].includes(property.type)) return;
    const section = node('section', null, 'videoPropertyOptions');
    section.append(node('h4', '選択肢'));
    const add = node('form', null, 'videoPropertyOptionAdd');
    const input = makeInput('', '選択肢名'); input.required = true; input.maxLength = 120; input.setAttribute('aria-label', `${property.name}の選択肢名`);
    const submit = button('選択肢を追加', async () => {} , 'primary'); submit.type = 'submit';
    add.append(field('新しい選択肢', input), submit);
    add.addEventListener('submit', (event) => { event.preventDefault(); const name = input.value; if (!name.trim()) return; change((definitions) => Model.addOption(definitions, property.id, { id: id(), name })); });
    section.append(add);
    const list = node('div', null, 'videoPropertyOptionList');
    sortedOptions(property).forEach((option, index, all) => {
      const row = node('div', null, `videoPropertyOption${option.deleted ? ' is-deleted' : ''}`);
      const nameInput = makeInput(option.name); nameInput.maxLength = 120; nameInput.setAttribute('aria-label', `${option.name}の選択肢名`); nameInput.disabled = !!option.deleted;
      nameInput.addEventListener('change', () => change((definitions) => Model.updateOption(definitions, property.id, option.id, { name: nameInput.value })));
      const actions = node('div', null, 'videoPropertyOptionActions');
      if (!option.deleted) {
        actions.append(button('↑', () => change((definitions) => Model.reorderOption(definitions, property.id, option.id, index - 1)), ''));
        actions.append(button('↓', () => change((definitions) => Model.reorderOption(definitions, property.id, option.id, index + 1)), ''));
        actions.append(button('削除', () => {
          const count = Model.countOptionValues(state.values, property.id, option.id);
          if (root.confirm(`${count}件の動画で使用されています。選択肢を削除しますか？値は保持され、復元できます。`)) change((definitions) => Model.softDeleteOption(definitions, property.id, option.id));
        }, 'danger'));
      } else actions.append(button('復元', () => change((definitions) => Model.restoreOption(definitions, property.id, option.id))));
      if (index === 0) actions.querySelector('button')?.setAttribute('aria-label', `${option.name}を上へ`);
      row.append(nameInput, actions); list.append(row);
    });
    if (!list.childElementCount) list.append(node('p', '選択肢はありません。', 'videoPropertyEmpty'));
    section.append(list); card.append(section);
  }

  function renderProperty(property, index, all) {
    const card = node('article', null, `videoPropertyCard${property.deleted ? ' is-deleted' : ''}`);
    const header = node('div', null, 'videoPropertyCardHead');
    const nameInput = makeInput(property.name); nameInput.maxLength = 120; nameInput.setAttribute('aria-label', '項目名'); nameInput.disabled = !!property.deleted;
    nameInput.addEventListener('change', () => change((definitions) => Model.updateProperty(definitions, property.id, { name: nameInput.value })));
    const actions = node('div', null, 'videoPropertyCardActions');
    if (!property.deleted) {
      const up = button('↑', () => change((definitions) => Model.reorderProperty(definitions, property.id, index - 1))); up.disabled = index === 0; up.setAttribute('aria-label', `${property.name}を上へ`); actions.append(up);
      const down = button('↓', () => change((definitions) => Model.reorderProperty(definitions, property.id, index + 1))); down.disabled = index === all.length - 1; down.setAttribute('aria-label', `${property.name}を下へ`); actions.append(down);
      const remove = button('削除', () => { const count = Model.countPropertyValues(state.values, property.id); if (root.confirm(`${count}件の動画に値があります。項目を削除しますか？値は保持され、復元できます。`)) change((definitions) => Model.softDeleteProperty(definitions, property.id)); }, 'danger'); actions.append(remove);
    } else actions.append(button('復元', () => change((definitions) => Model.restoreProperty(definitions, property.id))));
    header.append(nameInput, actions); card.append(header);
    card.append(node('p', `種類: ${typeNames[property.type] || property.type}（作成後は変更できません）`, 'videoPropertyType'));
    if (!property.deleted) {
      const settings = node('div', null, 'videoPropertySettings');
      appendCheckbox(settings, '入力・一覧に表示', property.hidden !== true, (visible) => change((definitions) => Model.setPropertyFlag(definitions, property.id, 'hidden', !visible)));
      appendCheckbox(settings, '動画カードに表示', property.showInCard === true, (visible) => change((definitions) => Model.setPropertyFlag(definitions, property.id, 'showInCard', visible)));
      card.append(settings); renderOptions(card, property);
    }
    return card;
  }
  function render() {
    if (!state) return;
    const active = doc.activeElement;
    if (active && host.contains(active) && active.matches('input:not([type="checkbox"]):not([type="radio"]), textarea')) { deferredRefresh = true; return; }
    deferredRefresh = false;
    const head = node('div', null, 'videoPropertyHead');
    const title = node('div'); title.append(node('h2', 'プロパティ設定'), node('p', '項目名、種類、選択肢、表示順、表示・非表示とカード表示を設定できます。削除した項目や選択肢は復元できます。'));
    const back = node('a', '動画一覧へ', 'videoPropertyButton videoPropertyBack'); back.href = 'video.html'; head.append(title, back);
    const panel = node('section', null, 'videoPropertyPanel');
    const form = node('form', null, 'videoPropertyCreate');
    const name = makeInput('', '例: 視聴状況'); name.required = true; name.maxLength = 120; name.setAttribute('aria-label', '新しい項目名');
    const type = doc.createElement('select'); type.setAttribute('aria-label', '新しい項目の種類');
    Object.entries(typeNames).forEach(([value, label]) => { const option = node('option', label); option.value = value; type.append(option); });
    const submit = button('項目を追加', async () => {}, 'primary'); submit.type = 'submit';
    form.append(field('項目名', name), field('種類', type), submit);
    form.addEventListener('submit', (event) => { event.preventDefault(); if (!name.value.trim()) return; change((definitions) => Model.createProperty(definitions, { id: id(), name: name.value, type: type.value })); });
    panel.append(form);
    const list = node('div', null, 'videoPropertyList'); const properties = sortedProperties();
    if (!properties.length) list.append(node('p', 'プロパティはまだありません。', 'videoPropertyEmpty'));
    properties.forEach((property, index) => list.append(renderProperty(property, index, properties)));
    panel.append(list);
    const notice = node('p', null, 'videoPropertyNotice'); notice.id = 'videoPropertyStatus'; notice.setAttribute('role', 'status');
    host.replaceChildren(head, panel, notice);
  }
  function initialize() {
    if (!canRead()) { host.replaceChildren(node('p', '保護データへのアクセスを確認しています…', 'videoPropertyNotice')); return; }
    state = Store.read(); render(); announce('Vaultのプロパティ定義と動画ごとの値を表示しています。');
  }
  host.addEventListener('focusout', (event) => { if (!deferredRefresh || (event.relatedTarget && host.contains(event.relatedTarget))) return; deferredRefresh = false; render(); });
  doc.addEventListener('manga-reader-vpn-status', () => { if (canRead()) initialize(); else { state = null; host.replaceChildren(node('p', '保護データへのアクセスがありません。', 'videoPropertyNotice')); } });
  root.addEventListener('storage', (event) => { if (event.key === Store.DEFINITIONS_KEY || event.key === Store.VALUES_KEY) { if (canRead()) initialize(); } });
  initialize();
}(typeof window !== 'undefined' ? window : globalThis));
