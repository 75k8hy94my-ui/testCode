(async () => {
  const originEl = document.getElementById('origin');
  const register = document.getElementById('register');
  const status = document.getElementById('status');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let origin = '';
  try { const url = new URL(tab.url); if (!/^https?:$/.test(url.protocol)) throw new Error(); origin = url.origin; }
  catch (_) { originEl.textContent = 'このページは登録できません'; register.disabled = true; return; }
  originEl.textContent = origin;
  const state = await chrome.runtime.sendMessage({ type: 'GET_SITE_STATUS', origin });
  if (state.registered) { register.textContent = '登録済み'; register.disabled = true; status.textContent = 'ページ右下の「要素登録」から設定できます。'; }
  register.addEventListener('click', async () => {
    register.disabled = true; status.textContent = '権限を確認しています…';
    const granted = await chrome.permissions.request({ origins: [origin + '/*'] });
    if (!granted) { register.disabled = false; status.textContent = 'サイトへのアクセス権限が必要です。'; return; }
    const result = await chrome.runtime.sendMessage({ type: 'REGISTER_SITE', origin, tabId: tab.id });
    if (result && result.ok) { register.textContent = '登録済み'; status.textContent = '登録しました。ページ右下に操作ボタンを表示します。'; }
    else { register.disabled = false; status.textContent = '登録できませんでした。'; }
  });
})();