(function () {
  'use strict';
  if (!window || !document || !window.MangaVault) return;
  let dialog = null;

  function show(conflicts) {
    if (!Array.isArray(conflicts) || !conflicts.length) return;
    if (dialog) dialog.remove();
    const root = document.createElement('section');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'vaultConflictTitle');
    root.className = 'vault-conflict-dialog';
    const title = document.createElement('h2');
    title.id = 'vaultConflictTitle';
    title.textContent = '同期データの競合を確認';
    root.append(title);
    const description = document.createElement('p');
    description.textContent = '同じ項目が端末とクラウドの両方で変更されています。各項目で残す値を選んでください。';
    root.append(description);
    const form = document.createElement('form');
    const choices = {};
    conflicts.forEach((conflict, index) => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = conflict.path;
      fieldset.append(legend);
      for (const side of ['local', 'remote']) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'vaultConflict' + index;
        input.value = side;
        input.required = true;
        input.addEventListener('change', () => { choices[conflict.path] = side; });
        const value = document.createElement('pre');
        const present = conflict[side + 'Present'] !== false;
        value.textContent = side === 'local' ? 'この端末: ' : 'クラウド: ';
        value.textContent += present ? JSON.stringify(conflict[side], null, 2) : '削除';
        label.append(input, value);
        fieldset.append(label);
      }
      form.append(fieldset);
    });
    const error = document.createElement('p');
    error.setAttribute('role', 'alert');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '選択を適用して同期';
    submit.addEventListener('click', async (event) => {
      event.preventDefault();
      if (conflicts.some((item) => !choices[item.path])) { error.textContent = '各項目の値を選択してください。'; return; }
      submit.disabled = true;
      error.textContent = '同期中…';
      try {
        await window.MangaVault.resolveConflicts(choices);
        root.remove();
        dialog = null;
      } catch (failure) {
        error.textContent = failure && failure.message ? failure.message : '同期できませんでした。端末データは保持されています。';
        submit.disabled = false;
      }
    });
    form.append(error, submit);
    root.append(form);
    Object.assign(root.style, { position: 'fixed', inset: '5vh 5vw', zIndex: '2147483000', overflow: 'auto', padding: '1.25rem', background: 'Canvas', color: 'CanvasText', border: '2px solid currentColor', borderRadius: '.75rem', boxShadow: '0 12px 50px #0008' });
    document.body.append(root);
    dialog = root;
    submit.focus();
  }

  window.addEventListener('manga-vault-conflict', (event) => show(event.detail && event.detail.conflicts));
  window.addEventListener('manga-vault-cleared', () => {
    if (dialog) dialog.remove();
    dialog = null;
    if (window.TestCodeGuest?.isActive()) return;
    if (location.pathname.split('/').pop() !== 'sync.html') {
      const returnTo = location.pathname.split('/').pop() + location.search + location.hash;
      document.body.textContent = '保管庫がロックされました。再解錠しています…';
      location.replace('sync.html?next=' + encodeURIComponent(returnTo));
    }
  });
  window.addEventListener('pagehide', () => { if (dialog) dialog.remove(); dialog = null; }, { once: true });
}());
