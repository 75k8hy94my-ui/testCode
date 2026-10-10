/* Self-service conflict UI. Decrypted snapshots remain in memory only. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = {
    folders:'本棚フォルダ',items:'本棚・作品',videos:'動画',videoFolders:'動画フォルダ',
    videoMeta:'動画の詳細・編集',videoMarkers:'動画マーカー',videoShortsState:'縦スワイプ動画',
    authorCards:'作者情報',mangaInfo:'漫画情報',toc:'目次',lastPages:'閲覧位置',
    theme:'テーマ',dashboardVisibility:'ホーム表示',homeCards:'ホームの並び',
    study:'学習データ',indexSearchSettings:'検索設定',roppoState:'六法・メモ',
    statuteNotes:'法令メモ',profileAvatar:'プロフィール画像',
    driveGalleryEncrypted:'Drive連携設定',gameSave:'ゲームデータ',
    manualVpnIps:'手動VPN判定',manualNonVpnIps:'手動非VPN判定'
  };
  const stable = value => {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    return JSON.stringify(value);
  };
  const summary = value => {
    if (Array.isArray(value)) return value.length + '件';
    if (value && typeof value === 'object') return Object.keys(value).length + '項目';
    if (typeof value === 'string') return value ? '設定あり' : '設定なし';
    return value == null ? 'なし' : '設定あり';
  };
  let preview = null;
  let backedUp = false;
  let busy = false;
  let onResolved = null;
  function controls() {
    const enabled = Boolean(preview && backedUp && $('vaultConflictAcknowledge').checked && !busy);
    $('vaultConflictLocal').disabled = !enabled;
    $('vaultConflictCloud').disabled = !enabled;
    $('vaultConflictDownload').disabled = busy || !preview;
    $('vaultConflictRefresh').disabled = busy;
    $('vaultConflictClose').disabled = busy;
    $('vaultConflictAcknowledge').disabled = busy || !backedUp;
  }
  function setBusy(value) { busy = value; controls(); }
  function message(value) { $('vaultConflictStatus').textContent = value; }
  function resetPreview() {
    preview = null; backedUp = false;
    $('vaultConflictAcknowledge').checked = false;
    controls();
  }
  function showDifferences(snapshot) {
    const local = snapshot.local, cloud = snapshot.cloud;
    const keys = Object.keys(window.MangaVaultPayload.DATA_KEYS || {}).concat(['manualVpnIps','manualNonVpnIps']);
    const differing = keys.filter(key => stable(local[key]) !== stable(cloud[key]));
    $('vaultConflictRevision').textContent = 'クラウド更新番号: ' + snapshot.revision + ' ／ 差がある種類: ' + differing.length;
    const list = $('vaultConflictDifferences');
    list.replaceChildren();
    if (!differing.length) {
      const row = document.createElement('li');
      row.textContent = '端末版とクラウド版の内容は一致しています。同期状態を修復できます。';
      list.appendChild(row);
    }
    differing.forEach(key => {
      const row = document.createElement('li');
      row.textContent = (labels[key] || key) + '：端末 ' + summary(local[key]) + ' ／ クラウド ' + summary(cloud[key]);
      list.appendChild(row);
    });
  }
  async function refresh() {
    if (busy) return;
    resetPreview();
    setBusy(true);
    message('クラウドの最新データを読み込んでいます…');
    try {
      const snapshot = await window.MangaVault.inspectConflict();
      preview = snapshot;
      showDifferences(snapshot);
      message('採用する版を選択してください。選択しない側の差分は保持されません。');
    } catch (error) {
      message(error && error.message || '競合を確認できませんでした。');
    } finally { setBusy(false); }
  }
  async function download() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const backup = await window.MangaVault.createConflictBackup(preview);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'testcode-vault-conflict-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        // Delay revocation so browsers can start the download first.
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      backedUp = true;
      message('ダウンロードしたバックアップを確認し、チェックを入れてください。');
    } catch (error) {
      message(error && error.message || '暗号化バックアップを作成できませんでした。');
    } finally { setBusy(false); }
  }
  async function resolve(choice) {
    if (busy || !preview || !backedUp || !$('vaultConflictAcknowledge').checked) return;
    const warning = choice === 'local'
      ? '端末版ですべてのクラウドデータを置き換えます。実行しますか？'
      : 'クラウド版ですべての端末データを置き換えます。実行しますか？';
    if (!window.confirm(warning)) return;
    setBusy(true);
    message('最新の更新番号と端末データを確認して反映しています…');
    try {
      await window.MangaVault.resolveConflict(choice, preview);
      resetPreview();
      message('競合を解決しました。');
      $('vaultConflictDialog').close();
      if (typeof onResolved === 'function') onResolved();
    } catch (error) {
      resetPreview(); // stale preview must never be reused for a subsequent overwrite
      message((error && error.message || '競合を解決できませんでした。') + ' 最新データを再確認してください。');
    } finally { setBusy(false); }
  }
  function bind() {
    $('vaultConflictDownload').addEventListener('click', download);
    $('vaultConflictRefresh').addEventListener('click', refresh);
    $('vaultConflictAcknowledge').addEventListener('change', controls);
    $('vaultConflictLocal').addEventListener('click', () => resolve('local'));
    $('vaultConflictCloud').addEventListener('click', () => resolve('cloud'));
    $('vaultConflictClose').addEventListener('click', () => {
      if (!busy) { resetPreview(); $('vaultConflictDialog').close(); }
    });
    $('vaultConflictDialog').addEventListener('cancel', event => {
      if (busy) event.preventDefault();
      else resetPreview();
    });
  }
  // Another tab can lock the Vault while this dialog is open. Drop the
  // decrypted conflict preview immediately rather than retaining it in memory.
  window.addEventListener('manga-vault-cleared', () => {
    resetPreview();
    const dialog = $('vaultConflictDialog');
    if (dialog && dialog.open) dialog.close();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
  window.TestCodeVaultConflictUI = {
    open(callback) {
      onResolved = callback;
      const dialog = $('vaultConflictDialog');
      if (!dialog.open) dialog.showModal();
      refresh();
    }
  };
})();
