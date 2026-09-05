(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderMediaAccess = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const IP_URL = 'https://api.ipify.org?format=json';
  const CHECK_URL = 'https://ip-api.dev/api';
  const PROTON_EXIT_IPS_URL = 'https://raw.githubusercontent.com/tn3w/ProtonVPN-IPs/master/protonvpn_ips.json';
  const PROTON_ASNS = new Set([209103, 62371]);
  const NOTICE_ID = 'vpnMediaNotice';
  const DIAGNOSTICS_BUTTON_ID = 'vpnDiagnosticsButton';
  const DIAGNOSTICS_PANEL_ID = 'vpnDiagnosticsPanel';
  let status = 'pending';
  let installed = false;
  let diagnostics = freshDiagnostics();

  function freshDiagnostics() {
    return {
      ip: '',
      generic: { status: 'pending', httpStatus: null, verdict: null },
      protonExitMatch: null,
      final: 'pending',
      checkedAt: null,
      error: null,
    };
  }

  function getDiagnostics() {
    return {
      ip: diagnostics.ip,
      generic: { ...diagnostics.generic },
      protonExitMatch: diagnostics.protonExitMatch,
      final: diagnostics.final,
      checkedAt: diagnostics.checkedAt,
      error: diagnostics.error,
    };
  }

  function currentBase() {
    return root.location && root.location.href ? root.location.href : 'https://75k8hy94my-ui.github.io/testCode/reader.html';
  }

  function isVpnVerdict(value) {
    if (!value || typeof value !== 'object') return false;
    const privacy = value.privacy && typeof value.privacy === 'object' ? value.privacy : {};
    const asn = value.asn && typeof value.asn === 'object' ? value.asn : {};
    const organization = value.organization && typeof value.organization === 'object' ? value.organization : {};
    const asnNumber = Number(asn.number || value.asn_number || 0);
    const providerText = [asn.name, organization.name, value.org, value.isp]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('en-US');
    return value.is_vpn === true || value.is_proxy === true || privacy.vpn === true || privacy.proxy === true || privacy.is_vpn === true || privacy.is_proxy === true || PROTON_ASNS.has(asnNumber) || providerText.includes('proton ag') || providerText.includes('protonvpn') || providerText.includes('proton vpn');
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

  function diagnosticText() {
    const d = diagnostics;
    const generic = d.generic.status === 'success'
      ? (d.generic.verdict ? 'VPN判定: YES' : 'VPN判定: NO')
      : d.generic.status === 'error'
        ? 'エラー' + (d.generic.httpStatus ? ' (HTTP ' + d.generic.httpStatus + ')' : '')
        : d.generic.status === 'checking' ? '確認中' : '未確認';
    const proton = d.protonExitMatch === true ? '一致' : d.protonExitMatch === false ? '不一致' : '未確認';
    const final = d.final === 'allowed' ? '許可' : d.final === 'blocked' ? 'ブロック' : d.final === 'checking' ? '確認中' : '未判定';
    return [
      '現在IP: ' + (d.ip || '取得前'),
      '一般VPN判定: ' + generic,
      'Proton出口IP: ' + proton,
      '最終判定: ' + final,
      d.error ? 'エラー詳細: ' + d.error : '',
      d.checkedAt ? '確認時刻: ' + d.checkedAt : '',
    ].filter(Boolean).join('\n');
  }

  function renderDiagnostics() {
    if (!root.document) return;
    const panel = root.document.getElementById(DIAGNOSTICS_PANEL_ID);
    if (!panel) return;
    const pre = panel.querySelector('[data-vpn-diagnostics-text]');
    if (pre) pre.textContent = diagnosticText();
  }

  function installDiagnosticsUi() {
    if (!root.document) return;
    const mount = () => {
      if (!root.document.body || root.document.getElementById(DIAGNOSTICS_BUTTON_ID)) return;
      const button = root.document.createElement('button');
      button.id = DIAGNOSTICS_BUTTON_ID;
      button.type = 'button';
      button.textContent = 'VPN診断';
      button.style.cssText = 'position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99997;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(24,28,36,.92);color:#fff;padding:7px 10px;font:12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer;backdrop-filter:blur(12px)';

      const panel = root.document.createElement('div');
      panel.id = DIAGNOSTICS_PANEL_ID;
      panel.style.cssText = 'display:none;position:fixed;right:12px;bottom:calc(52px + env(safe-area-inset-bottom));z-index:99998;width:min(92vw,390px);padding:12px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(15,18,24,.96);color:#f5f7fb;box-shadow:0 14px 42px rgba(0,0,0,.42);font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(16px)';
      const title = root.document.createElement('div');
      title.textContent = 'VPN診断';
      title.style.cssText = 'font-weight:700;margin-bottom:7px';
      const pre = root.document.createElement('pre');
      pre.dataset.vpnDiagnosticsText = '1';
      pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;margin:0 0 10px;font:inherit;color:inherit';
      const recheck = root.document.createElement('button');
      recheck.type = 'button';
      recheck.textContent = '再確認';
      recheck.style.cssText = 'border:1px solid rgba(255,255,255,.18);border-radius:9px;background:#262c38;color:#fff;padding:6px 9px;font:inherit;cursor:pointer';
      recheck.addEventListener('click', () => checkVpn());
      panel.append(title, pre, recheck);
      button.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        renderDiagnostics();
      });
      root.document.body.append(panel, button);
      renderDiagnostics();
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
    if (!response.ok) {
      const error = new Error('VPN check failed');
      error.httpStatus = Number(response.status || 0) || null;
      throw error;
    }
    return response.json();
  }

  async function isKnownProtonExitIp(ip, signal) {
    try {
      const list = await fetchJson(PROTON_EXIT_IPS_URL, signal);
      return Array.isArray(list) && list.includes(ip);
    } catch (_) {
      return false;
    }
  }

  async function genericVpnVerdict(ip, signal) {
    diagnostics.generic = { status: 'checking', httpStatus: null, verdict: null };
    renderDiagnostics();
    try {
      const payload = await fetchJson(CHECK_URL + '?q=' + encodeURIComponent(ip), signal);
      const verdict = isVpnVerdict(payload);
      diagnostics.generic = { status: 'success', httpStatus: 200, verdict };
      renderDiagnostics();
      return verdict;
    } catch (error) {
      diagnostics.generic = { status: 'error', httpStatus: error && error.httpStatus || null, verdict: false };
      diagnostics.error = '一般VPN判定APIの取得に失敗';
      renderDiagnostics();
      return false;
    }
  }

  async function checkVpn() {
    status = 'checking';
    diagnostics = freshDiagnostics();
    diagnostics.final = 'checking';
    renderDiagnostics();
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    const timer = root.setTimeout && controller ? root.setTimeout(() => controller.abort(), 5000) : null;
    try {
      if (typeof root.fetch !== 'function') throw new Error('fetch unavailable');
      const ipPayload = await fetchJson(IP_URL, controller ? controller.signal : undefined);
      const ip = String(ipPayload && ipPayload.ip || '').trim();
      if (!ip) throw new Error('public IP unavailable');
      diagnostics.ip = ip;
      renderDiagnostics();
      const signal = controller ? controller.signal : undefined;
      let allowed = await genericVpnVerdict(ip, signal);
      if (!allowed) {
        diagnostics.protonExitMatch = await isKnownProtonExitIp(ip, signal);
        allowed = diagnostics.protonExitMatch;
      }
      status = allowed ? 'allowed' : 'blocked';
      diagnostics.final = status;
      diagnostics.checkedAt = new Date().toISOString();
      renderDiagnostics();
      if (status === 'allowed') {
        removeNotice();
        restoreBlockedElements();
      } else {
        showNotice('VPNに接続すると漫画・動画を読み込めます。');
      }
      return status === 'allowed';
    } catch (error) {
      status = 'blocked';
      diagnostics.final = 'blocked';
      diagnostics.checkedAt = new Date().toISOString();
      diagnostics.error = diagnostics.error || (error && error.message ? error.message : 'VPN接続を確認できません');
      renderDiagnostics();
      showNotice('VPN接続を確認できません。接続後に「再確認」を押してください。');
      return false;
    } finally {
      if (timer && root.clearTimeout) root.clearTimeout(timer);
    }
  }

  function setAllowedForTesting(allowed) {
    status = allowed ? 'allowed' : 'blocked';
    diagnostics.final = status;
    if (allowed) restoreBlockedElements();
    renderDiagnostics();
  }

  installGuards();
  installDiagnosticsUi();
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', checkVpn, { once: true });
    else if (root.setTimeout) root.setTimeout(checkVpn, 0);
  }

  return { IP_URL, CHECK_URL, PROTON_EXIT_IPS_URL, isVpnVerdict, isProtectedMediaUrl, canLoadExternalMedia, mediaUrl, checkVpn, getDiagnostics, setAllowedForTesting, installGuards, installDiagnosticsUi };
}));
