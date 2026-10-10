(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderProfileShortsReset = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  function waitForSync(eventTarget, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        eventTarget.removeEventListener('manga-video-shorts-sync', onSync);
        resolve(result);
      };
      const onSync = (event) => finish(event && event.detail || { status: 'pending' });
      const timer = root.setTimeout(() => finish({ status: 'timeout' }), timeoutMs);
      eventTarget.addEventListener('manga-video-shorts-sync', onSync);
    });
  }

  function createHandler(options = {}) {
    const button = options.button;
    const status = options.status;
    const eventTarget = options.eventTarget || root;
    const getAccess = typeof options.getAccess === 'function' ? options.getAccess : () => null;
    const getState = typeof options.getState === 'function' ? options.getState : () => null;
    const isGuestMode = typeof options.isGuestMode === 'function' ? options.isGuestMode : () => false;
    const yieldToPaint = typeof options.yieldToPaint === 'function'
      ? options.yieldToPaint
      : () => new Promise((resolve) => {
        if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(resolve);
        else root.setTimeout(resolve, 0);
      });
    const waitForSyncResult = typeof options.waitForSync === 'function'
      ? options.waitForSync
      : (timeoutMs) => waitForSync(eventTarget, timeoutMs);
    const syncTimeoutMs = Number.isFinite(options.syncTimeoutMs) ? options.syncTimeoutMs : 15000;
    let inProgress = false;

    const canRead = () => {
      const access = getAccess();
      try { return !!access && typeof access.canReadProtectedData === 'function' && access.canReadProtectedData() === true; }
      catch (_) { return false; }
    };
    const setStatus = (message, stateName) => {
      if (!status) return;
      status.textContent = message;
      if (stateName) status.dataset.state = stateName;
    };

    return async function handleShortsReset() {
      if (inProgress) return;
      if (!canRead()) {
        setStatus('VPN接続を確認できるまで実行できません。', 'error');
        return;
      }

      inProgress = true;
      if (button) {
        button.disabled = true;
        button.textContent = 'リセット中…';
        if (button.dataset) button.dataset.resetBusy = '1';
      }
      setStatus('再生順をリセットしています…', 'pending');

      let capturedSaveEvent = null;
      let savedLocally = false;
      const onStateSaved = (event) => { capturedSaveEvent = event && event.detail || null; };
      if (eventTarget) eventTarget.addEventListener('manga-video-shorts-state-saved', onStateSaved);
      try {
        await yieldToPaint();
        const state = getState();
        if (!state || typeof state.reset !== 'function') {
          setStatus('リセット機能を読み込めませんでした。ページを再読み込みしてください。', 'error');
          return;
        }
        const saved = state.reset();
        if (!saved) {
          setStatus('再生順をリセットできませんでした。端末への保存状態を確認してください。', 'error');
          return;
        }
        savedLocally = true;

        if (isGuestMode() || !capturedSaveEvent || capturedSaveEvent.pending !== true) {
          setStatus('再生順をリセットしました。次回の再生開始時に順序を再生成します。', 'ok');
          return;
        }

        setStatus('端末に保存しました。クラウドに保存中…', 'pending');
        const syncResult = await waitForSyncResult(syncTimeoutMs);
        if (syncResult && syncResult.status === 'saved') {
          setStatus('再生順をリセットし、クラウドにも保存しました。', 'ok');
        } else if (syncResult && syncResult.status === 'pending') {
          setStatus('端末には保存済みですが、クラウド同期は完了しませんでした。' + (syncResult.message ? ` ${syncResult.message}` : ''), 'error');
        } else if (syncResult && syncResult.status === 'error') {
          setStatus('端末には保存済みですが、クラウド同期中にエラーが発生しました。' + (syncResult.message ? ` ${syncResult.message}` : ''), 'error');
        } else {
          setStatus('端末には保存済みです。クラウド同期の完了を確認できませんでした。', 'error');
        }
      } catch (error) {
        if (savedLocally) setStatus('端末には保存済みですが、クラウド同期状況を確認できませんでした。', 'error');
        else setStatus(error && error.message ? `再生順をリセットできませんでした。${error.message}` : '再生順をリセットできませんでした。', 'error');
      } finally {
        if (eventTarget) eventTarget.removeEventListener('manga-video-shorts-state-saved', onStateSaved);
        inProgress = false;
        if (button) {
          button.textContent = '再生順をリセット';
          if (button.dataset) delete button.dataset.resetBusy;
          button.disabled = !canRead();
        }
      }
    };
  }

  function refreshAccess(options = {}) {
    const button = options.button;
    const status = options.status;
    const access = options.access;
    const resetAvailable = options.resetAvailable === true;
    let accessStatus = 'pending';
    let allowed = false;
    try {
      accessStatus = access && typeof access.getStatus === 'function' ? access.getStatus() : 'pending';
      allowed = !!access && typeof access.canReadProtectedData === 'function' && access.canReadProtectedData() === true;
    } catch (_) { allowed = false; }

    const checking = accessStatus === 'pending' || accessStatus === 'checking';
    if (button) button.disabled = !resetAvailable || !allowed || checking || button.dataset?.resetBusy === '1';
    if (!status) return allowed && resetAvailable;
    if (!resetAvailable) {
      status.textContent = 'リセット機能を読み込めませんでした。ページを再読み込みしてください。';
      status.dataset.state = 'error';
    } else if (!access || checking) {
      status.textContent = 'VPN接続を確認中です。確認完了後にリセットできます。';
      status.dataset.state = 'access';
    } else if (!allowed) {
      status.textContent = 'VPNアクセスが許可されるとリセットできます。プロフィールのVPN診断を確認してください。';
      status.dataset.state = 'access';
    } else if (status.dataset.state === 'access') {
      status.textContent = '';
      delete status.dataset.state;
    }
    return allowed && resetAvailable && !checking;
  }

  return Object.freeze({ createHandler, refreshAccess });
}));
