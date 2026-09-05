(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderMediaAccess = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const IP_URL = 'https://api.ipify.org?format=json';
  const CHECK_URL = 'https://ip-api.dev/api';
  const NOTICE_ID = 'vpnMediaNotice';
  let status = 'pending';
  let installed = false;

  function currentBase() {
    return root.location && root.location.href ? root.location.href : 'https://75k8hy94my-ui.github.io/testCode/reader.html';
  }

  function isVpnVerdict(value) {
    if (!value || typeof value !== 'object') return false;
    const privacy = value.privacy && typeof value.privacy === 'object' ? value.privacy : {};
    return value.is_vpn === true || value.is_proxy === true || privacy.vpn === true || privacy.proxy === true || privacy.is_vpn === true || privacy.is_proxy === true;
  }

  function isProtectedMediaUrl(value, baseUrl) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return false;
    try {
      const base = new URL(baseUrl || currentBase());
      const parsed = new URL(raw, base);
      if (!/^https?:$/.test(parsed.protocol)) return false;
      return parsed.origin !== base.origin;
    } catch (_) {
      return false;
    }
  }

  function canLoadExternalMedia() {
    return status === 'allowed';
  }

  function mediaUrl(value, baseUrl) {
    const raw = String(value == null ? '' : value);
    return isProtectedMediaUrl(raw, baseUrl) && !canLoadExternalMedia() ? '' : raw;
  }

  function removeNotice() {
    if (!root.document) return;
    const notice = root.document.getElementById(NOTICE_ID);
    if (notice) notice.remove();
  }

  function showNotice(message) {
    if (!root.document) return;
    const mount = () => {
      if (!root.document.body) return;
      let notice = root.document.getElementById(NOTICE_ID);
      if (!notice) {
        notice = root.document.createElement('div');
        notice.id = NOTICE_ID;
        notice.setAttribute('role', 'status');
        notice.style.cssText = 'position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:99999;max-width:min(92vw,520px);display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(15,18,24,.94);color:#f5f7fb;box-shadow:0 12px 38px rgba(0,0,0,.42);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(16px)';
        const text = root.document.createElement('span');
        text.dataset.vpnMediaMessage = '1';
        text.style.flex = '1';
        const button = root.document.createElement('button');
        button.type = 'button';
        button.textContent = '再確認';
        button.style.cssText = 'border:1px solid rgba(255,255,255,.18);border-radius:10px;background:#262c38;color:#fff;padding:7px 10px;font:inherit;cursor:pointer';
        button.addEventListener('click', () => checkVpn());
        notice.append(text, button);
        root.document.body.appendChild(notice);
      }
      const text = notice.querySelector('[data-vpn-media-message]');
      if (text) text.textContent = message || 'VPNに接続すると漫画・動画を読み込めます。';
    };
    if (root.document.body) mount();
    else root.document.addEventListener('DOMContentLoaded', mount, { once: true });
  }

  function markBlocked(element, value) {
    if (!element || !value) return;
    try { element.dataset.vpnBlockedSrc = String(value); } catch (_) {}
    showNotice('VPNに接続すると漫画・動画を読み込めます。');
  }

  function restoreBlockedElements() {
    if (!root.document || !canLoadExternalMedia()) return;
    root.document.querySelectorAll('[data-vpn-blocked-src]').forEach((element) => {
      const value = element.dataset.vpnBlockedSrc;
      delete element.dataset.vpnBlockedSrc;
      if (value) element.src = value;
    });
  }

  function patchSrcProperty(ctor) {
    if (!ctor || !ctor.prototype) return;
    const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, 'src');
    if (!descriptor || typeof descriptor.set !== 'function' || typeof descriptor.get !== 'function' || descriptor.set.__vpnMediaGuard) return;
    const originalSet = descriptor.set;
    const guardedSet = function (value) {
      if (isProtectedMediaUrl(value, currentBase()) && !canLoadExternalMedia()) {
        markBlocked(this, value);
        return;
      }
      try { if (this.dataset && this.dataset.vpnBlockedSrc) delete this.dataset.vpnBlockedSrc; } catch (_) {}
      return originalSet.call(this, value);
    };
    guardedSet.__vpnMediaGuard = true;
    Object.defineProperty(ctor.prototype, 'src', { ...descriptor, set: guardedSet });
  }

  function installGuards() {
    if (installed) return;
    installed = true;
    patchSrcProperty(root.HTMLImageElement);
    patchSrcProperty(root.HTMLMediaElement);
    patchSrcProperty(root.HTMLIFrameElement);
    patchSrcProperty(root.HTMLSourceElement);
    if (root.document && typeof root.document.addEventListener === 'function') {
      root.document.addEventListener('click', (event) => {
        if (canLoadExternalMedia() || !event.target || typeof event.target.closest !== 'function') return;
        const openButton = event.target.closest('.vl-open');
        if (!openButton) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        showNotice('VPNに接続してから動画を開いてください。');
      }, true);
    }
  }

  async function fetchJson(url, signal) {
    const response = await root.fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
    if (!response.ok) throw new Error('VPN check failed');
    return response.json();
  }

  async function checkVpn() {
    status = 'checking';
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    const timer = root.setTimeout && controller ? root.setTimeout(() => controller.abort(), 5000) : null;
    try {
      if (typeof root.fetch !== 'function') throw new Error('fetch unavailable');
      const ipPayload = await fetchJson(IP_URL, controller ? controller.signal : undefined);
      const ip = String(ipPayload && ipPayload.ip || '').trim();
      if (!ip) throw new Error('public IP unavailable');
      const payload = await fetchJson(CHECK_URL + '?q=' + encodeURIComponent(ip), controller ? controller.signal : undefined);
      status = isVpnVerdict(payload) ? 'allowed' : 'blocked';
      if (status === 'allowed') {
        removeNotice();
        restoreBlockedElements();
      } else {
        showNotice('VPNに接続すると漫画・動画を読み込めます。');
      }
      return status === 'allowed';
    } catch (_) {
      status = 'blocked';
      showNotice('VPN接続を確認できません。接続後に「再確認」を押してください。');
      return false;
    } finally {
      if (timer && root.clearTimeout) root.clearTimeout(timer);
    }
  }

  function setAllowedForTesting(allowed) {
    status = allowed ? 'allowed' : 'blocked';
    if (allowed) restoreBlockedElements();
  }

  installGuards();
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', checkVpn, { once: true });
    else if (root.setTimeout) root.setTimeout(checkVpn, 0);
  }

  return { IP_URL, CHECK_URL, isVpnVerdict, isProtectedMediaUrl, canLoadExternalMedia, mediaUrl, checkVpn, setAllowedForTesting, installGuards };
}));
