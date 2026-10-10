(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderMediaAccess = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  // Guest access is only to a separately scoped local dataset. It is not a
  // VPN verdict or access to authenticated remote protected resources.
  const DIAGNOSTICS_PANEL_ID = 'vpnDiagnosticsPanel';
  if (root.TestCodeGuest?.isActive()) {
    return Object.freeze({
      getStatus: () => 'allowed',
      canReadProtectedData: () => true,
      canLoadExternalMedia: () => true,
      isProtectedMediaUrl: () => false,
      mediaUrl: (url) => String(url ?? ''),
      checkVpn: async () => true,
      syncUi() {}, installGuards() {}, installDiagnosticsUi() {},
      getDiagnostics: () => ({ final: 'guest', error: null }),
      getDiagnosticText: () => 'ゲストモードではVPN・IPの判定を行っていません。',
      openDiagnosticsPanel() {
        if (!root.document) return false;
        let panel = root.document.getElementById(DIAGNOSTICS_PANEL_ID);
        if (!panel) {
          panel = root.document.createElement('section');
          panel.id = DIAGNOSTICS_PANEL_ID;
          panel.setAttribute('role', 'dialog');
          panel.setAttribute('aria-label', 'VPN診断');
          panel.style.cssText = 'position:fixed;right:12px;bottom:calc(52px + env(safe-area-inset-bottom));z-index:99998;width:min(92vw,390px);padding:14px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(15,18,24,.96);color:#f5f7fb;box-shadow:0 14px 42px rgba(0,0,0,.42);font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
          const title = root.document.createElement('strong');
          title.textContent = 'VPN診断';
          const message = root.document.createElement('p');
          message.textContent = 'ゲストモードではVPN・IPの判定を行っていません。';
          const close = root.document.createElement('button');
          close.type = 'button';
          close.textContent = '閉じる';
          close.addEventListener('click', () => panel.remove());
          panel.append(title, message, close);
          root.document.body.append(panel);
        }
        panel.hidden = false;
        return true;
      },
      toggleDiagnosticsPanel() {
        const panel = root.document?.getElementById(DIAGNOSTICS_PANEL_ID);
        if (panel && !panel.hidden) { panel.hidden = true; return false; }
        return this.openDiagnosticsPanel();
      },
    });
  }

  const IP_URL = 'https://api.ipify.org?format=json';
  const CHECK_URL = 'https://ip-api.dev/api';
  const COUNTRY_FALLBACK_URL = 'https://api.ipapi.is';
  const PROTON_EXIT_IPS_URL = 'https://raw.githubusercontent.com/tn3w/ProtonVPN-IPs/master/protonvpn_ips.json';
  const PROTON_ASNS = new Set([209103, 62371, 208172]);
  const PROTON_OWNED_IPV4_CIDRS = [
    '159.26.96.0/20',
    '159.26.116.0/22',
    '134.82.68.0/22',
    '72.251.208.0/20',
    '205.147.17.0/24',
    '205.147.22.0/24',
  ];
  // Snapshot of publicly listed ProtonVPN exit IPs (source: tn3w/ProtonVPN-IPs,
  // checked 2026-09-16). Keep this local list as the first line of defense;
  // the remote list below remains an updateable fallback.
  const KNOWN_VPN_IPV4S = new Set([
    '2.58.241.66', '5.253.204.162', '31.171.153.98', '37.0.12.226',
    '37.19.199.129', '37.19.199.144', '37.19.199.149', '37.19.199.155',
    '37.19.200.1', '37.19.200.17', '37.19.200.22', '37.19.201.129',
    '37.19.201.130', '37.19.205.223', '37.19.221.193', '37.46.115.5',
    '45.14.71.5', '45.14.71.6', '45.14.71.7', '45.82.64.25',
    '72.251.222.1', '84.17.63.17', '84.20.16.29', '146.70.8.2',
    '146.70.14.19', '146.70.14.42', '149.22.80.1', '149.22.81.1',
    '185.28.254.2', '185.51.134.194', '185.100.233.84', '185.107.44.200',
  ]);
  const NOTICE_ID = 'vpnMediaNotice';
  const DIAGNOSTICS_BUTTON_ID = 'vpnDiagnosticsButton';
  const MANUAL_VPN_IPS_KEY = 'testCode.manualVpnIps';
  const MANUAL_NON_VPN_IPS_KEY = 'testCode.manualNonVpnIps';
  const MANUAL_VPN_APPROVAL_KEY = 'testCode.manualVpnSessionApproval';
  let status = 'pending';
  let installed = false;
  let diagnosticsUiInstalled = false;
  let diagnostics = freshDiagnostics();
  let checkGeneration = 0;
  let activeController = null;
  let checkInFlight = false;
  let lastCompletedCheckAt = 0;
  const VPN_REFRESH_MS = 120000;

  function emitStatus() {
    if (!root.document || typeof root.document.dispatchEvent !== 'function') return;
    const EventCtor = root.CustomEvent || (root.document.defaultView && root.document.defaultView.CustomEvent);
    if (typeof EventCtor !== 'function') return;
    root.document.dispatchEvent(new EventCtor('manga-reader-vpn-status', { detail: { status } }));
  }

  function freshDiagnostics() {
    return {
      ip: '',
      countryCode: '',
      countryName: '',
      countrySource: null,
      countryPolicy: 'pending',
      generic: { status: 'pending', httpStatus: null, verdict: null },
      protonOwnedNetworkMatch: null,
      protonExitMatch: null,
      manualDesignation: null,
      final: 'pending',
      checkedAt: null,
      error: null,
    };
  }

  function getDiagnostics() {
    return {
      ip: diagnostics.ip,
      countryCode: diagnostics.countryCode,
      countryName: diagnostics.countryName,
      countrySource: diagnostics.countrySource,
      countryPolicy: diagnostics.countryPolicy,
      generic: { ...diagnostics.generic },
      protonOwnedNetworkMatch: diagnostics.protonOwnedNetworkMatch,
      protonExitMatch: diagnostics.protonExitMatch,
      manualDesignation: diagnostics.manualDesignation,
      final: diagnostics.final,
      checkedAt: diagnostics.checkedAt,
      error: diagnostics.error,
    };
  }

  function currentBase() {
    return root.location && root.location.href ? root.location.href : 'https://75k8hy94my-ui.github.io/testCode/reader.html';
  }

  function storage() {
    try {
      return root.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function readIpSet(key) {
    const store = storage();
    if (!store) return new Set();
    try {
      const parsed = JSON.parse(store.getItem(key) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value || '').trim()).filter(Boolean) : []);
    } catch (_) {
      return new Set();
    }
  }

  function writeIpSet(key, values) {
    const store = storage();
    if (!store) return false;
    try {
      store.setItem(key, JSON.stringify(Array.from(values)));
      return true;
    } catch (_) {
      return false;
    }
  }

  function getManualIpDesignation(ip) {
    const value = String(ip || '').trim();
    if (!value) return null;
    if (readIpSet(MANUAL_NON_VPN_IPS_KEY).has(value)) return 'non-vpn';
    if (readIpSet(MANUAL_VPN_IPS_KEY).has(value)) return 'vpn';
    return null;
  }

  function setManualIpDesignation(ip, designation) {
    const value = String(ip || '').trim();
    if (!value || (designation !== 'vpn' && designation !== 'non-vpn')) return false;

    const nonVpnIps = readIpSet(MANUAL_NON_VPN_IPS_KEY);
    const vpnIps = readIpSet(MANUAL_VPN_IPS_KEY);

    // A non-VPN designation is intentionally irreversible from this UI.
    if (nonVpnIps.has(value)) return designation === 'non-vpn';

    if (designation === 'non-vpn') {
      vpnIps.delete(value);
      nonVpnIps.add(value);
      return writeIpSet(MANUAL_VPN_IPS_KEY, vpnIps) && writeIpSet(MANUAL_NON_VPN_IPS_KEY, nonVpnIps);
    }

    vpnIps.add(value);
    return writeIpSet(MANUAL_VPN_IPS_KEY, vpnIps);
  }

  function sessionStorage() {
    try { return root.sessionStorage || null; } catch (_) { return null; }
  }

  function hasManualVpnApproval(ip) {
    const store = sessionStorage();
    if (!store || !ip) return false;
    try { return store.getItem(MANUAL_VPN_APPROVAL_KEY) === String(ip); } catch (_) { return false; }
  }

  function rememberManualVpnApproval(ip) {
    const store = sessionStorage();
    if (!store || !ip) return false;
    try { store.setItem(MANUAL_VPN_APPROVAL_KEY, String(ip)); return true; } catch (_) { return false; }
  }

  function clearManualVpnApproval(ip) {
    const store = sessionStorage();
    if (!store) return;
    try { if (!ip || store.getItem(MANUAL_VPN_APPROVAL_KEY) === String(ip)) store.removeItem(MANUAL_VPN_APPROVAL_KEY); } catch (_) {}
  }

  function clearManualVpnDesignation(ip) {
    const value = String(ip || '').trim();
    if (!value) return false;
    const vpnIps = readIpSet(MANUAL_VPN_IPS_KEY);
    if (!vpnIps.delete(value)) return true;
    clearManualVpnApproval(value);
    return writeIpSet(MANUAL_VPN_IPS_KEY, vpnIps);
  }

  function ipv4ToInt(ip) {
    const parts = String(ip || '').trim().split('.');
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part)) return null;
      const octet = Number(part);
      if (octet < 0 || octet > 255) return null;
      value = (value * 256) + octet;
    }
    return value >>> 0;
  }

  function ipv4InCidr(ip, cidr) {
    const [networkText, prefixText] = String(cidr || '').split('/');
    const ipInt = ipv4ToInt(ip);
    const networkInt = ipv4ToInt(networkText);
    const prefix = Number(prefixText);
    if (ipInt == null || networkInt == null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    if (prefix === 0) return true;
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (ipInt & mask) === (networkInt & mask);
  }

  function isKnownProtonOwnedIp(ip) {
    return PROTON_OWNED_IPV4_CIDRS.some((cidr) => ipv4InCidr(ip, cidr));
  }

  function isKnownVpnIp(ip) {
    const value = String(ip || '').trim();
    return KNOWN_VPN_IPV4S.has(value) || isKnownProtonOwnedIp(value);
  }

  function ipv424(ip) {
    const parts = String(ip || '').trim().split('.');
    return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
      ? parts.slice(0, 3).join('.')
      : '';
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

  function canReadProtectedData() {
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
    const update = () => {
      root.document.querySelectorAll('[data-vpn-status-button]').forEach((button) => {
        button.textContent = button.hasAttribute('data-vpn-recheck-button') ? 'VPN未接続（再確認）' : 'VPN未接続';
        button.title = message || 'VPNに接続すると漫画・動画を読み込めます。';
        button.dataset.vpnState = 'blocked';
      });
    };
    if (root.document.body) update();
    else root.document.addEventListener('DOMContentLoaded', update, { once: true });
  }

  function diagnosticText() {
    const d = diagnostics;
    const generic = d.generic.status === 'success'
      ? (d.generic.verdict ? 'VPN判定: YES' : 'VPN判定: NO')
      : d.generic.status === 'country-only'
        ? '国判定のみ実施'
        : d.generic.status === 'country-fallback'
          ? '国判定のみ実施（予備API）'
        : d.generic.status === 'unavailable'
          ? '判定不能' + (d.generic.httpStatus ? ' (HTTP ' + d.generic.httpStatus + ')' : '')
          : d.generic.status === 'error'
            ? 'エラー' + (d.generic.httpStatus ? ' (HTTP ' + d.generic.httpStatus + ')' : '')
          : d.generic.status === 'checking' ? '確認中' : '未確認';
    const owned = d.protonOwnedNetworkMatch === true ? '一致' : d.protonOwnedNetworkMatch === false ? '不一致' : '未確認';
    const proton = d.protonExitMatch === true ? '一致' : d.protonExitMatch === false ? '不一致' : '未確認';
    const manual = d.manualDesignation === 'vpn' ? 'VPNとして手動指定' : d.manualDesignation === 'non-vpn' ? 'VPNではないと固定' : 'なし';
    const country = d.countryCode
      ? (d.countryName ? d.countryCode + ' (' + d.countryName + ')' : d.countryCode)
      : d.countryName || '未確認';
    const countryPolicy = d.countryPolicy === 'non-jp-vpn'
      ? '日本国外IPのためVPNとして扱う'
      : d.countryPolicy === 'jp'
        ? '日本IPのため国判定だけではVPN扱いしない'
        : d.countryPolicy === 'unavailable'
          ? '国判定不能'
          : '未判定';
    const final = d.final === 'allowed' ? '許可' : d.final === 'blocked' ? 'ブロック' : d.final === 'checking' ? '確認中' : '未判定';
    return [
      '現在IP: ' + (d.ip || '取得前'),
      '国判定: ' + country,
      d.countrySource === 'fallback' ? '国情報の取得元: 予備API' : '',
      '国判定結果: ' + countryPolicy,
      '手動指定: ' + manual,
      'Proton保有ネットワーク: ' + owned,
      '一般VPN判定: ' + generic,
      'Proton出口IP: ' + proton,
      '最終判定: ' + final,
      d.error ? 'エラー詳細: ' + d.error : '',
      d.checkedAt ? '確認時刻: ' + d.checkedAt : '',
    ].filter(Boolean).join('\n');
  }

  function renderManualControls() {
    if (!root.document) return;
    const panel = root.document.getElementById(DIAGNOSTICS_PANEL_ID);
    if (!panel) return;
    const vpnButton = panel.querySelector('[data-vpn-mark-vpn]');
    const nonVpnButton = panel.querySelector('[data-vpn-mark-non-vpn]');
    const clearVpnButton = panel.querySelector('[data-vpn-clear-vpn]');
    if (!vpnButton || !nonVpnButton) return;

    const ip = diagnostics.ip;
    const designation = ip ? getManualIpDesignation(ip) : null;
    diagnostics.manualDesignation = designation;

    vpnButton.disabled = !ip || designation === 'vpn' || designation === 'non-vpn';
    nonVpnButton.disabled = !ip || designation === 'non-vpn';
    vpnButton.textContent = designation === 'vpn'
      ? 'VPN例外指定済み'
      : designation === 'non-vpn'
        ? 'VPN例外指定不可'
        : 'このIPはVPN';
    nonVpnButton.textContent = designation === 'non-vpn'
      ? 'VPNではないと固定済み'
      : 'このIPはVPNではない';
    vpnButton.title = designation === 'non-vpn' ? 'このIPは「VPNではない」と固定済みのため変更できません。' : '';
    nonVpnButton.title = designation === 'non-vpn' ? 'この指定はこの画面から解除できません。' : '';
    if (clearVpnButton) clearVpnButton.hidden = designation !== 'vpn';
  }

  function renderDiagnostics() {
    if (!root.document) return;
    const panel = root.document.getElementById(DIAGNOSTICS_PANEL_ID);
    if (panel) {
      renderManualControls();
      const pre = panel.querySelector('[data-vpn-diagnostics-text]');
      if (pre) pre.textContent = diagnosticText();
    }
    const EventCtor = root.CustomEvent || (root.document.defaultView && root.document.defaultView.CustomEvent);
    if (typeof EventCtor === 'function') root.document.dispatchEvent(new EventCtor('manga-reader-vpn-diagnostics', { detail: {} }));
  }

  function openDiagnosticsPanel() {
    installDiagnosticsUi();
    const panel = root.document && root.document.getElementById(DIAGNOSTICS_PANEL_ID);
    if (!panel) return false;
    panel.style.display = 'block';
    renderDiagnostics();
    return true;
  }

  function toggleDiagnosticsPanel() {
    const panel = root.document && root.document.getElementById(DIAGNOSTICS_PANEL_ID);
    if (panel && panel.style.display !== 'none') {
      panel.style.display = 'none';
      return false;
    }
    return openDiagnosticsPanel();
  }

  function hideDiagnosticsPanel() {
    if (!root.document) return;
    const panel = root.document.getElementById(DIAGNOSTICS_PANEL_ID);
    if (panel) panel.style.display = 'none';
  }

  function installDiagnosticsUi() {
    if (!root.document) return;
    const mount = () => {
      if (!root.document.body || diagnosticsUiInstalled) return;
      diagnosticsUiInstalled = true;

      const panel = root.document.createElement('div');
      panel.id = DIAGNOSTICS_PANEL_ID;
      panel.style.cssText = 'display:none;position:fixed;right:12px;bottom:calc(52px + env(safe-area-inset-bottom));z-index:99998;width:min(92vw,390px);padding:12px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(15,18,24,.96);color:#f5f7fb;box-shadow:0 14px 42px rgba(0,0,0,.42);font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(16px)';
      const title = root.document.createElement('div');
      title.textContent = 'VPN診断';
      title.style.cssText = 'font-weight:700;margin-bottom:7px';
      const pre = root.document.createElement('pre');
      pre.dataset.vpnDiagnosticsText = '1';
      pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;margin:0 0 10px;font:inherit;color:inherit';
      const controls = root.document.createElement('div');
      controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px';
      const buttonStyle = 'border:1px solid rgba(255,255,255,.18);border-radius:9px;background:#262c38;color:#fff;padding:6px 9px;font:inherit;cursor:pointer';
      const recheck = root.document.createElement('button');
      recheck.type = 'button';
      recheck.textContent = '再確認';
      recheck.style.cssText = buttonStyle;
      recheck.addEventListener('click', () => checkVpn({ external: true }));
      const markVpn = root.document.createElement('button');
      markVpn.type = 'button';
      markVpn.dataset.vpnMarkVpn = '1';
      markVpn.textContent = 'このIPはVPN';
      markVpn.style.cssText = buttonStyle;
      markVpn.addEventListener('click', async () => {
        const ip = diagnostics.ip;
        if (!ip || getManualIpDesignation(ip) === 'non-vpn') return;
        if (setManualIpDesignation(ip, 'vpn')) await checkVpn({ external: false });
      });
      const markNonVpn = root.document.createElement('button');
      markNonVpn.type = 'button';
      markNonVpn.dataset.vpnMarkNonVpn = '1';
      markNonVpn.textContent = 'このIPはVPNではない';
      markNonVpn.style.cssText = buttonStyle;
      markNonVpn.addEventListener('click', async () => {
        const ip = diagnostics.ip;
        if (!ip || getManualIpDesignation(ip) === 'non-vpn') return;
        const message = 'このIPを「VPNではない」と固定します。\nこの画面からは解除できず、あとからVPN例外にも変更できません。\nよろしいですか？';
        if (typeof root.confirm === 'function' && !root.confirm(message)) return;
        if (setManualIpDesignation(ip, 'non-vpn')) await checkVpn({ external: false });
      });
      const clearVpn = root.document.createElement('button');
      clearVpn.type = 'button';
      clearVpn.dataset.vpnClearVpn = '1';
      clearVpn.textContent = 'このIPの手動指定を解除する';
      clearVpn.style.cssText = buttonStyle;
      clearVpn.hidden = true;
      clearVpn.addEventListener('click', async () => {
        const ip = diagnostics.ip;
        if (clearManualVpnDesignation(ip)) await checkVpn({ external: false });
      });
      controls.append(recheck, markVpn, markNonVpn, clearVpn);
      panel.append(title, pre, controls);
      root.document.body.append(panel);
      root.document.addEventListener('click', (event) => {
        const recheckButton = event.target && event.target.closest ? event.target.closest('[data-vpn-recheck-button]') : null;
        if (recheckButton) {
          checkVpn({ external: true });
          return;
        }
        const diagnosticsButton = event.target && event.target.closest ? event.target.closest('[data-vpn-diagnostics-button]') : null;
        if (diagnosticsButton) {
          panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
          renderDiagnostics();
          return;
        }
        const statusButton = event.target && event.target.closest ? event.target.closest('[data-vpn-status-button]') : null;
        if (statusButton) checkVpn({ external: false });
      });
      root.document.addEventListener('home-profile-routechange', () => {
        hideDiagnosticsPanel();
      });
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

  function blockExistingExternalMedia() {
    if (!root.document) return;
    root.document.querySelectorAll('img,video,audio,iframe,source').forEach((element) => {
      const value = element.currentSrc || element.getAttribute('src') || element.src || '';
      if (!isProtectedMediaUrl(value, currentBase())) return;
      markBlocked(element, value);
      element.removeAttribute('src');
      if (element.tagName === 'VIDEO' || element.tagName === 'AUDIO') {
        try { element.load(); } catch (_) {}
      }
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

  function patchSrcAttribute() {
    const proto = root.Element && root.Element.prototype;
    if (!proto || typeof proto.setAttribute !== 'function' || proto.setAttribute.__vpnMediaGuard) return;
    const originalSetAttribute = proto.setAttribute;
    const guardedSetAttribute = function (name, value) {
      if (String(name).toLowerCase() === 'src' && this && /^(IMG|VIDEO|AUDIO|IFRAME|SOURCE)$/.test(this.tagName || '') && isProtectedMediaUrl(value, currentBase()) && !canLoadExternalMedia()) {
        markBlocked(this, value);
        return;
      }
      return originalSetAttribute.call(this, name, value);
    };
    guardedSetAttribute.__vpnMediaGuard = true;
    proto.setAttribute = guardedSetAttribute;
  }

  function installGuards() {
    if (installed) return;
    installed = true;
    patchSrcProperty(root.HTMLImageElement);
    patchSrcProperty(root.HTMLMediaElement);
    patchSrcProperty(root.HTMLIFrameElement);
    patchSrcProperty(root.HTMLSourceElement);
    patchSrcAttribute();
    if (root.document && typeof root.document.addEventListener === 'function') {
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
      if (!Array.isArray(list)) return false;
      if (list.includes(ip)) return true;
      const block = ipv424(ip);
      return !!block && list.some((candidate) => ipv424(candidate) === block);
    } catch (_) {
      return false;
    }
  }

  function countryInfoFromPayload(payload) {
    const location = payload && payload.location && typeof payload.location === 'object' ? payload.location : {};
    const countryCode = String(location.country_code || payload && payload.country_code || '').trim().toUpperCase();
    const countryName = String(location.country || payload && payload.country || '').trim();
    return { countryCode, countryName };
  }

  function countryPolicyFor(country) {
    if (country.countryCode) return country.countryCode === 'JP' ? 'jp' : 'non-jp-vpn';
    if (country.countryName) return /^japan$/i.test(country.countryName) ? 'jp' : 'non-jp-vpn';
    return 'unavailable';
  }

  async function lookupIpAssessment(ip, signal, includeVpnVerdict, result = diagnostics, notify = renderDiagnostics) {
    result.generic = { status: 'checking', httpStatus: null, verdict: null };
    notify();
    try {
      const payload = await fetchJson(CHECK_URL + '?q=' + encodeURIComponent(ip) + '&format=json', signal);
      const country = countryInfoFromPayload(payload);
      result.countryCode = country.countryCode;
      result.countryName = country.countryName;
      result.countrySource = 'primary';
      result.countryPolicy = countryPolicyFor(country);
      const verdict = includeVpnVerdict ? isVpnVerdict(payload) : null;
      result.generic = {
        status: includeVpnVerdict ? 'success' : 'country-only',
        httpStatus: 200,
        verdict,
      };
      notify();
      return {
        countryCode: country.countryCode,
        countryName: country.countryName,
        nonJapanVpn: result.countryPolicy === 'non-jp-vpn',
        vpnVerdict: verdict === true,
      };
    } catch (error) {
      try {
        const fallbackPayload = await fetchJson(COUNTRY_FALLBACK_URL + '?q=' + encodeURIComponent(ip), signal);
        const country = countryInfoFromPayload(fallbackPayload);
        const fallbackPolicy = countryPolicyFor(country);
        if (fallbackPolicy === 'unavailable') throw new Error('Country fallback returned no country');
        result.countryCode = country.countryCode;
        result.countryName = country.countryName;
        result.countrySource = 'fallback';
        result.countryPolicy = fallbackPolicy;
        result.generic = {
          status: includeVpnVerdict ? 'unavailable' : 'country-fallback',
          httpStatus: error && error.httpStatus || null,
          verdict: null,
        };
        result.error = includeVpnVerdict
          ? '一般VPN判定APIを利用できません' + (error && error.httpStatus ? ' (HTTP ' + error.httpStatus + ')' : '') + '。国情報は予備APIから取得しました'
          : null;
        notify();
        return {
          countryCode: country.countryCode,
          countryName: country.countryName,
          nonJapanVpn: result.countryPolicy === 'non-jp-vpn',
          vpnVerdict: false,
        };
      } catch (_) {
        result.countryPolicy = 'unavailable';
        result.generic = { status: 'unavailable', httpStatus: error && error.httpStatus || null, verdict: null };
        result.error = 'IP国・一般VPN判定APIを利用できません' + (error && error.httpStatus ? ' (HTTP ' + error.httpStatus + ')' : '');
        notify();
        return { countryCode: '', countryName: '', nonJapanVpn: false, vpnVerdict: false };
      }
    }
  }

  async function genericVpnVerdict(ip, signal) {
    const assessment = await lookupIpAssessment(ip, signal, true);
    return assessment.vpnVerdict;
  }

  function applyFinalStatus(allowed) {
    status = allowed ? 'allowed' : 'blocked';
    emitStatus();
    updateStatusButtons(status);
    if (status === 'allowed') diagnostics.error = null;
    diagnostics.final = status;
    diagnostics.checkedAt = new Date().toISOString();
    lastCompletedCheckAt = Date.now();
    renderDiagnostics();
    if (status === 'allowed') {
      removeNotice();
      restoreBlockedElements();
    } else {
      blockExistingExternalMedia();
      showNotice('VPNに接続すると漫画・動画を読み込めます。');
    }
    return status === 'allowed';
  }

  function confirmManualVpnOverride() {
    const message = 'Protonおよび一般VPN判定ではVPNと確認できませんでした。\n手動指定IPで接続しますがよろしいですか？';
    return typeof root.confirm !== 'function' || root.confirm(message);
  }

  function allowManualVpn(ip) {
    if (hasManualVpnApproval(ip)) return true;
    if (!confirmManualVpnOverride()) return false;
    rememberManualVpnApproval(ip);
    return true;
  }

  async function checkVpn(options = {}) {
    const useExternalApi = options.external !== false;
    const ownGeneration = ++checkGeneration;
    activeController?.abort();
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    activeController = controller;
    checkInFlight = true;
    const isCurrent = () => ownGeneration === checkGeneration;
    const background = options.background === true && status === 'allowed';
    if (!background) {
      status = 'checking';
      emitStatus();
      updateStatusButtons(status);
    }
    const result = freshDiagnostics();
    result.final = 'checking';
    diagnostics = result;
    const notify = () => { if (isCurrent()) renderDiagnostics(); };
    notify();
    const timer = root.setTimeout && controller ? root.setTimeout(() => controller.abort(), 15000) : null;
    try {
      if (typeof root.fetch !== 'function') throw new Error('fetch unavailable');
      const ipPayload = await fetchJson(IP_URL, controller ? controller.signal : undefined);
      if (!isCurrent()) return false;
      const ip = String(ipPayload && ipPayload.ip || '').trim();
      if (!ip) throw new Error('public IP unavailable');
      result.ip = ip;

      const manualDesignation = getManualIpDesignation(ip);
      result.manualDesignation = manualDesignation;
      if (manualDesignation === 'non-vpn') return applyFinalStatus(false);

      result.protonOwnedNetworkMatch = isKnownProtonOwnedIp(ip);
      notify();
      const signal = controller ? controller.signal : undefined;
      let allowed = isKnownVpnIp(ip);
      if (allowed) {
        result.generic = { status: 'skipped-known-ip', httpStatus: null, verdict: true };
        notify();
      } else {
        const [assessment, protonExitMatch] = await Promise.all([
          lookupIpAssessment(ip, signal, useExternalApi, result, notify),
          isKnownProtonExitIp(ip, signal),
        ]);
        if (!isCurrent()) return false;
        result.protonExitMatch = protonExitMatch;
        if (assessment.nonJapanVpn) allowed = true;
        else if (useExternalApi) allowed = assessment.vpnVerdict;
        if (!allowed) allowed = protonExitMatch;
      }
      if (!isCurrent()) return false;
      if (!allowed && manualDesignation === 'vpn') {
        if (allowManualVpn(ip)) return applyFinalStatus(true);
        result.error = 'VPNと確認できなかったため手動指定を適用しませんでした';
      }
      return applyFinalStatus(allowed);
    } catch (error) {
      if (!isCurrent()) return false;
      if (result.manualDesignation === 'vpn' || getManualIpDesignation(result.ip) === 'vpn') {
        if (allowManualVpn(result.ip)) return applyFinalStatus(true);
        result.error = 'VPNを確認できなかったため手動指定を適用しませんでした';
      }
      status = 'blocked';
      emitStatus();
      updateStatusButtons(status);
      result.final = 'blocked';
      result.checkedAt = new Date().toISOString();
      lastCompletedCheckAt = Date.now();
      result.error = result.error || (error && error.message ? error.message : 'VPN接続を確認できません');
      notify();
      showNotice('VPN接続を確認できません。接続後に「再確認」を押してください。');
      return false;
    } finally {
      if (isCurrent()) { activeController = null; checkInFlight = false; }
      if (timer && root.clearTimeout) root.clearTimeout(timer);
    }
  }

  function setAllowedForTesting(allowed) {
    checkGeneration++;
    activeController?.abort();
    activeController = null;
    checkInFlight = false;
    status = allowed ? 'allowed' : 'blocked';
    emitStatus();
    updateStatusButtons(status);
    diagnostics.final = status;
    if (allowed) restoreBlockedElements();
    renderDiagnostics();
  }

  function updateStatusButtons(nextStatus) {
    if (!root.document) return;
    const labels = { allowed: 'VPN接続済み', blocked: 'VPN未接続', checking: 'VPN確認中', pending: 'VPN確認中' };
    root.document.querySelectorAll('[data-vpn-status-button]').forEach((button) => {
      const label = labels[nextStatus] || labels.pending;
      button.textContent = button.hasAttribute('data-vpn-recheck-button') && nextStatus !== 'checking' && nextStatus !== 'pending'
        ? label + '（再確認）'
        : label;
      button.dataset.vpnState = nextStatus || 'pending';
    });
  }

  function refreshVpn() {
    if (checkInFlight || status === 'checking') return;
    if (root.document?.visibilityState === 'hidden') return;
    return checkVpn({ external: true, background: true });
  }

  installGuards();
  installDiagnosticsUi();
  updateStatusButtons(status);
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => checkVpn({ external: false }), { once: true });
    else if (root.setTimeout) root.setTimeout(() => checkVpn({ external: false }), 0);
    if (typeof root.setInterval === 'function') root.setInterval(refreshVpn, VPN_REFRESH_MS);
    root.document.addEventListener?.('visibilitychange', () => {
      if (root.document.visibilityState === 'visible' && Date.now() - lastCompletedCheckAt >= VPN_REFRESH_MS) refreshVpn();
    });
  }
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('online', refreshVpn);
    root.addEventListener('offline', () => {
      checkGeneration++;
      activeController?.abort();
      activeController = null;
      checkInFlight = false;
      status = 'blocked';
      diagnostics.final = 'blocked';
      diagnostics.error = 'ネットワーク接続が切断されました';
      emitStatus();
      updateStatusButtons(status);
      blockExistingExternalMedia();
      showNotice('VPN接続を確認できません。');
      renderDiagnostics();
    });
  }

  return {
    IP_URL,
    CHECK_URL,
    COUNTRY_FALLBACK_URL,
    PROTON_EXIT_IPS_URL,
    PROTON_OWNED_IPV4_CIDRS,
    KNOWN_VPN_IPV4S,
    MANUAL_VPN_IPS_KEY,
    MANUAL_NON_VPN_IPS_KEY,
    VPN_REFRESH_MS,
    isVpnVerdict,
    countryInfoFromPayload,
    isKnownProtonOwnedIp,
    isKnownVpnIp,
    isProtectedMediaUrl,
    canLoadExternalMedia,
    canReadProtectedData,
    mediaUrl,
    getStatus: () => status,
    checkVpn,
    getDiagnostics,
    getDiagnosticText: diagnosticText,
    openDiagnosticsPanel,
    toggleDiagnosticsPanel,
    getManualIpDesignation,
    setManualIpDesignation,
    clearManualVpnDesignation,
    setAllowedForTesting,
    syncUi: () => updateStatusButtons(status),
    installGuards,
    installDiagnosticsUi,
  };
}));
