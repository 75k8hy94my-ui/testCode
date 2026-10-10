(() => {
  'use strict';

  let runtime = null;
  let initialized = false;
  let ready = false;
  let saving = false;
  let queued = false;
  let savePromise = null;

  const localHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const freshDebugRun = localHost && new URL(location.href).searchParams.has('freshGame');
  const saveKey = () => window.MangaVaultPayload?.DATA_KEYS?.gameSave || 'mangaReaderCityDaysSave';

  function setStatus(message, state = 'info') {
    const node = document.getElementById('cloudSaveStatus');
    if (node) {
      node.textContent = message;
      node.dataset.state = state;
    }
    const link = document.getElementById('cloudSaveOpenVault');
    if (link) link.hidden = state !== 'locked';
  }

  function onVaultCleared() {
    ready = false;
    setStatus('クラウド保存: Vaultロック中', 'locked');
  }

  function onVaultActive() {
    if (!ready && window.MangaVault?.loadSession()) {
      setStatus('クラウド保存: Vaultを開きました。進行復元には再読み込みしてください', 'locked');
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') void flush();
  }

  async function initialize(gameRuntime) {
    runtime = gameRuntime;
    if (freshDebugRun) {
      setStatus('開発用の初期状態（クラウド同期なし）', 'debug');
      return false;
    }
    const vault = window.MangaVault;
    const payloadApi = window.MangaVaultPayload;
    if (!vault || !payloadApi || !vault.loadSession()) {
      setStatus('クラウド保存: ログインしてVaultを開くと有効になります', 'locked');
      return false;
    }

    try {
      let active = vault.loadActive();
      if (!active && typeof vault.waitForActive === 'function') active = await vault.waitForActive(2500);
      if (!active) {
        setStatus('クラウド保存: Vaultロック中（Vaultを開いてから再読み込み）', 'locked');
        return false;
      }

      const payload = await vault.loadPayload();
      const snapshot = payload && payload.gameSave;
      if (snapshot) {
        if (typeof runtime.restore !== 'function' || runtime.restore(snapshot) !== true) {
          throw new Error('ゲームの保存データを復元できませんでした');
        }
        window.localStorage.setItem(saveKey(), JSON.stringify(snapshot));
      } else {
        window.localStorage.removeItem(saveKey());
      }
      initialized = true;
      ready = true;
      window.addEventListener('manga-vault-cleared', onVaultCleared);
      window.addEventListener('manga-vault-active', onVaultActive);
      setStatus('クラウド保存: 有効', 'ready');
      await flush();
      return true;
    } catch (error) {
      setStatus('クラウド保存: ' + (error?.message || '読み込みに失敗しました'), 'error');
      return false;
    }
  }

  async function flush() {
    if (!ready || !runtime || !window.MangaVault?.loadActive()) return false;
    if (saving) {
      queued = true;
      return savePromise;
    }
    saving = true;
    savePromise = (async () => {
      try {
        const snapshot = runtime.capture();
        window.localStorage.setItem(saveKey(), JSON.stringify(snapshot));
        const payload = window.MangaVaultPayload.buildFromLocalStorage();
        payload.gameSave = snapshot;
        setStatus('クラウド保存中…', 'saving');
        await window.MangaVault.savePayload(payload);
        setStatus('クラウド保存済み', 'ready');
        return true;
      } catch (error) {
        setStatus('クラウド保存に失敗: ' + (error?.message || '通信エラー'), 'error');
        return false;
      } finally {
        saving = false;
        savePromise = null;
        if (queued) {
          queued = false;
          void flush();
        }
      }
    })();
    return savePromise;
  }

  function destroy() {
    ready = false;
    if (initialized) {
      window.removeEventListener('manga-vault-cleared', onVaultCleared);
      window.removeEventListener('manga-vault-active', onVaultActive);
    }
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    initialized = false;
    runtime = null;
  }

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.CityDaysCloudSave = { initialize, flush, destroy };
})();
