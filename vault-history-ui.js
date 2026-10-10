(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function mount({ vault = window.MangaVault, payload = window.MangaVaultPayload, history = window.MangaVaultHistory, access = window.MangaReaderMediaAccess, guest = window.TestCodeGuest?.isActive() === true, documentRef = document, windowRef = window } = {}) {
    const anchor = documentRef.querySelector('.profileCard a[href="sync.html"]')?.closest('.profileCard');
    if (!anchor || !anchor.parentNode) return () => {};
    const section = documentRef.createElement('section');
    section.className = 'profileCard profileVaultHistory';
    section.setAttribute('aria-labelledby', 'profileVaultHistoryTitle');
    const title = documentRef.createElement('h3');
    title.id = 'profileVaultHistoryTitle';
    title.textContent = '変更履歴';
    const lead = documentRef.createElement('p');
    lead.className = 'profileLead';
    lead.textContent = 'クラウドに保存された暗号化Vaultの復元ポイントです。';
    const status = documentRef.createElement('p');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const controls = documentRef.createElement('div');
    controls.className = 'profileVaultHistoryActions';
    const refresh = documentRef.createElement('button');
    refresh.type = 'button';
    refresh.className = 'glassBtn';
    refresh.textContent = '履歴を再読み込み';
    controls.append(refresh);
    const list = documentRef.createElement('div');
    list.id = 'profileVaultHistoryList';
    const preview = documentRef.createElement('section');
    preview.setAttribute('aria-label', '復元内容の確認');
    section.append(title, lead, controls, status, list, preview);
    anchor.insertAdjacentElement('afterend', section);

    let disposed = false;
    let generation = 0;
    let rows = [];
    let latest = null;
    let selected = null;
    const setStatus = (message, state = 'idle') => {
      status.textContent = message;
      status.dataset.state = state;
    };
    const friendlyError = (error) => {
      const message = String(error?.message || '');
      if (message.includes('vault_history_capacity_requires_unprotect')) return '保護された復元ポイントが容量を占めています。古い履歴の保護を解除してから再試行してください。';
      if (message.includes('vault_history_protected_limit_exceeded')) return '保護できる履歴は最大5件、合計32 MiBまでです。別の履歴の保護を解除してください。';
      return message || '処理に失敗しました。';
    };
    const clear = () => {
      generation++;
      rows = [];
      latest = null;
      selected = null;
      list.replaceChildren();
      preview.replaceChildren();
    };
    const canRead = () => !guest && Boolean(vault?.loadActive?.()) && Boolean(access?.canReadProtectedData?.());
    const lockedMessage = () => {
      clear();
      setStatus('保管庫を解除し、保護コンテンツへのアクセスが許可されると変更履歴を閲覧できます。');
    };
    const renderRows = () => {
      list.replaceChildren();
      if (!rows.length) {
        const empty = documentRef.createElement('p');
        empty.textContent = '復元ポイントはありません。';
        list.append(empty);
        return;
      }
      for (const row of rows) {
        const card = documentRef.createElement('article');
        card.className = 'profileVaultHistoryRow';
        const heading = documentRef.createElement('h4');
        heading.textContent = `Revision ${row.revision} · ${new Date(row.updatedAt).toLocaleString()}`;
        const summary = documentRef.createElement('p');
        const oldest = rows[rows.length - 1];
        if (row.revision === latest?.revision && row === oldest) {
          summary.textContent = '現在の保存状態で、履歴導入後の最初の復元ポイントです。導入前の履歴はありません。';
        } else if (row.revision === latest?.revision) {
          summary.textContent = '現在の保存状態です。';
        } else {
          const changes = history.diffVaultSnapshots(row.payload, latest.payload, payload.normalize);
          const counts = { add: 0, change: 0, delete: 0 };
          changes.forEach((change) => { if (Object.hasOwn(counts, change.type)) counts[change.type]++; });
          summary.textContent = `現在との差分：追加 ${counts.add}・変更 ${counts.change}・削除 ${counts.delete}${row === oldest ? '。保持中の最古の復元ポイントです。これより前の履歴は保持されていません。' : ''}`;
        }
        const actions = documentRef.createElement('div');
        actions.className = 'profileVaultHistoryActions';
        const pin = documentRef.createElement('button');
        pin.type = 'button';
        pin.className = 'glassBtn';
        pin.textContent = row.protected ? '保護を解除' : '復元ポイントを保護';
        pin.setAttribute('aria-pressed', String(row.protected));
        pin.addEventListener('click', async () => {
          pin.disabled = true;
          try {
            await vault.setVaultHistoryProtected(row.historyId, !row.protected);
            await load();
          } catch (error) {
            setStatus(friendlyError(error), 'error');
            pin.disabled = false;
          }
        });
        const restore = documentRef.createElement('button');
        restore.type = 'button';
        restore.className = 'glassBtn';
        restore.textContent = 'この状態を復元';
        restore.disabled = row.revision === latest?.revision;
        restore.addEventListener('click', () => showPreview(row));
        actions.append(pin, restore);
        card.append(heading, summary, actions);
        list.append(card);
      }
    };
    const showPreview = async (row) => {
      if (!canRead()) { lockedMessage(); return; }
      selected = row;
      preview.replaceChildren();
      setStatus('復元内容を確認しています…', 'loading');
      try {
        const result = await vault.previewVaultHistoryRestore(row.historyId);
        if (disposed || selected !== row || !canRead()) { lockedMessage(); return; }
        const heading = documentRef.createElement('h4');
        heading.textContent = `Revision ${row.revision} の復元内容`;
        const notice = documentRef.createElement('p');
        notice.textContent = '現在のRevisionを巻き戻さず、新しいRevisionとして保存します。認証情報は現在の設定を保持します。';
        const diff = documentRef.createElement('ul');
        if (!result.changes.length) {
          const item = documentRef.createElement('li');
          item.textContent = '現在の状態と同じです。';
          diff.append(item);
        }
        for (const change of result.changes) {
          const item = documentRef.createElement('li');
          item.textContent = `${change.type === 'add' ? '追加' : change.type === 'delete' ? '削除' : '変更'}：${change.path}`;
          diff.append(item);
        }
        const actions = documentRef.createElement('div');
        actions.className = 'profileVaultHistoryActions';
        const confirm = documentRef.createElement('button');
        confirm.type = 'button';
        confirm.className = 'glassBtn profileDanger';
        confirm.textContent = '確認して復元';
        confirm.addEventListener('click', async () => {
          confirm.disabled = true;
          setStatus('新しいRevisionとして復元しています…', 'loading');
          try {
            const saved = await vault.confirmVaultHistoryRestore(row.historyId, result.baseRevision);
            selected = null;
            preview.replaceChildren();
            setStatus(`Revision ${saved.revision} として復元しました。`, 'ok');
            await load();
          } catch (error) {
            selected = null;
            preview.replaceChildren();
            setStatus(friendlyError(error), 'error');
          }
        });
        const cancel = documentRef.createElement('button');
        cancel.type = 'button';
        cancel.className = 'glassBtn';
        cancel.textContent = 'キャンセル';
        cancel.addEventListener('click', () => {
          selected = null;
          preview.replaceChildren();
          setStatus('復元をキャンセルしました。');
        });
        actions.append(confirm, cancel);
        preview.append(heading, notice, diff, actions);
        setStatus('復元前の差分を確認してください。', 'preview');
      } catch (error) {
        selected = null;
        preview.replaceChildren();
        setStatus(error?.message || '復元内容を確認できませんでした。', 'error');
      }
    };
    const load = async () => {
      if (disposed) return;
      if (!canRead()) { lockedMessage(); return; }
      const current = ++generation;
      setStatus('変更履歴を読み込んでいます…', 'loading');
      try {
        const result = await vault.listVaultHistory({ limit: 50 });
        if (disposed || current !== generation) return;
        if (!canRead()) { lockedMessage(); return; }
        rows = result;
        latest = rows.reduce((best, row) => !best || row.revision > best.revision ? row : best, null);
        renderRows();
        setStatus(rows.length ? '変更履歴を読み込みました。' : '変更履歴はありません。', rows.length ? 'ok' : 'empty');
      } catch (error) {
        if (disposed || current !== generation) return;
        clear();
        setStatus(friendlyError(error), 'error');
      }
    };
    const onCleared = () => lockedMessage();
    const onActive = () => { void load(); };
    const onVpn = (event) => { if (event?.detail?.status === 'allowed') void load(); else lockedMessage(); };
    refresh.addEventListener('click', load);
    windowRef.addEventListener('manga-vault-cleared', onCleared);
    windowRef.addEventListener('manga-vault-active', onActive);
    documentRef.addEventListener('manga-reader-vpn-status', onVpn);
    if (canRead()) void load(); else lockedMessage();
    return () => {
      disposed = true;
      clear();
      windowRef.removeEventListener('manga-vault-cleared', onCleared);
      windowRef.removeEventListener('manga-vault-active', onActive);
      documentRef.removeEventListener('manga-reader-vpn-status', onVpn);
      section.remove();
    };
  }
  window.MangaVaultHistoryUI = { mount };
})();
