(()=>{
'use strict';

if (typeof window === 'undefined' || typeof document === 'undefined') return;

const required = [
  'MangaReaderBackup', 'MangaVaultPayload', 'MangaVault', 'LegalIndexSchema',
  'EncryptedChunkCrypto', 'EncryptedChunkCache', 'IndexSearchPage'
];
if (required.some((name) => !window[name])) return;

function makeButton(id, label) {
  const button = document.createElement('button');
  button.id = id;
  button.className = 'glassBtn';
  button.type = 'button';
  button.textContent = label;
  return button;
}

function portableBooksForBackup() {
  return IndexSearchPage.getBooks().map((book) => MangaReaderBackup.normalizePortableIndexBook(book));
}

function triggerDownload(payload) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `testCode-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportCompleteBackup() {
  const payload = MangaReaderBackup.createBackup(
    MangaVaultPayload.buildFromLocalStorage(),
    new Date().toISOString(),
    portableBooksForBackup()
  );
  triggerDownload(payload);
}

function validateRestoreBooks(packageData) {
  const validated = [];
  for (let index = 0; index < packageData.indexBooks.length; index += 1) {
    const book = packageData.indexBooks[index];
    const result = LegalIndexSchema.validateBookFile(book, { fileName: `backup:indexBooks[${index}]` });
    if (!result.ok) throw new Error(result.error || `indexBooks[${index}] を検証できません。`);
    validated.push(result.book);
  }
  return validated;
}

async function restoreCacheSnapshot(cache, previousCacheRecords) {
  await cache.clear();
  for (const record of previousCacheRecords) await cache.put(record);
}

async function stageReplacementCorpus(cache, restoredBooks, rawKey) {
  const current = await cache.list();
  for (const record of current) {
    if (record.deletedAt || record.pendingAction === 'delete') continue;
    if (record.revision === 0) await cache.remove(record.chunkId);
    else await cache.put({ ...record, pendingAction: 'delete' });
  }

  for (const portableBook of restoredBooks) {
    const bookId = crypto.randomUUID();
    const chunkId = crypto.randomUUID();
    const chunk = LegalIndexSchema.createIndexBookChunk(portableBook, { bookId, chunkId });
    const payload = await EncryptedChunkCrypto.encryptChunk(rawKey, chunkId, chunk);
    await cache.put({
      chunkId,
      revision: 0,
      updatedAt: null,
      deletedAt: null,
      payload,
      pendingAction: 'upsert'
    });
  }
}

async function restoreCompleteBackup(file) {
  if (!navigator.onLine) throw new Error('完全バックアップの復元にはオンライン接続が必要です。');
  const session = MangaVault.loadSession();
  const active = MangaVault.loadActive();
  if (!session || !session.user || !session.user.id) throw new Error('ログイン状態を確認できません。');
  if (!active || !active.rawKey) throw new Error('保管庫を開いてから復元してください。');

  let parsed;
  try { parsed = JSON.parse(await file.text()); }
  catch (error) { throw new Error(`バックアップJSONを解析できません: ${error && error.message ? error.message : '形式エラー'}`); }

  const packageData = MangaReaderBackup.migrateBackupPackage(parsed);
  const restoredBooks = validateRestoreBooks(packageData);
  const accepted = confirm(`バックアップを復元します。\n現在のアプリデータと索引${IndexSearchPage.getBooks().length}冊を、バックアップ内の索引${restoredBooks.length}冊で置き換えます。\n続行しますか？`);
  if (!accepted) return { cancelled: true };

  await IndexSearchPage.sync();
  await IndexSearchPage.reload();

  const cache = await EncryptedChunkCache.createCache({ dbName: IndexSearchPage.cacheDbNameForUser(session.user.id) });
  const previousVaultPayload = MangaVaultPayload.buildFromLocalStorage();
  const previousCacheRecords = await cache.list();
  if (previousCacheRecords.some((record) => record.pendingAction)) {
    cache.close();
    throw new Error('未同期の索引変更があります。同期完了後にもう一度復元してください。');
  }

  let vaultChanged = false;
  try {
    await MangaVault.savePayload(packageData.data);
    vaultChanged = true;
    await stageReplacementCorpus(cache, restoredBooks, active.rawKey);
    MangaVaultPayload.applyToLocalStorage(packageData.data);
    await IndexSearchPage.reload();
    await IndexSearchPage.sync();
    return { cancelled: false, restoredBooks: restoredBooks.length };
  } catch (error) {
    try { await restoreCacheSnapshot(cache, previousCacheRecords); } catch (_) {}
    try { MangaVaultPayload.applyToLocalStorage(previousVaultPayload); } catch (_) {}
    if (vaultChanged) {
      try { await MangaVault.savePayload(previousVaultPayload); } catch (_) {}
    }
    try { await IndexSearchPage.reload(); } catch (_) {}
    throw error;
  } finally {
    cache.close();
  }
}

function installBackupActions() {
  const actions = document.querySelector('.actions');
  if (!actions || document.getElementById('indexBackupExportBtn')) return;
  const exportButton = makeButton('indexBackupExportBtn', '完全バックアップ');
  const restoreButton = makeButton('indexBackupRestoreBtn', 'バックアップ復元');
  const fileInput = document.createElement('input');
  fileInput.id = 'indexBackupFileInput';
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;

  exportButton.addEventListener('click', () => {
    if (!confirm('完全バックアップには復号済みの索引内容が含まれます。安全な場所で保管してください。\nバックアップを書き出しますか？')) return;
    try { exportCompleteBackup(); }
    catch (error) { alert(error && error.message ? error.message : 'バックアップを書き出せませんでした。'); }
  });
  restoreButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    restoreButton.disabled = true;
    try {
      const result = await restoreCompleteBackup(file);
      if (result && !result.cancelled) {
        alert(`バックアップを復元しました。索引 ${result.restoredBooks}冊を再暗号化しました。画面を再読込します。`);
        window.location.reload();
      }
    } catch (error) {
      alert(error && error.message ? error.message : 'バックアップを復元できませんでした。');
    } finally {
      restoreButton.disabled = false;
    }
  });

  actions.append(exportButton, restoreButton, fileInput);
}

window.IndexSearchBackup = {
  exportCompleteBackup,
  restoreCompleteBackup,
  validateRestoreBooks,
  restoreCacheSnapshot,
  stageReplacementCorpus
};

installBackupActions();
})();
