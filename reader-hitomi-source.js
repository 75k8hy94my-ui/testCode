/* Transient, browser-only page discovery for Hitomi gallery/reader URLs.
 * Third-party JavaScript is evaluated ONLY inside an opaque-origin sandboxed
 * srcdoc iframe. No downloaded pages or derived CDN URLs are persisted.
 */
(() => {
  'use strict';
  const DOMAIN = 'gold-usergeneratedcontent.net';
  const MAX_PAGES = 2000;
  const IMAGE_URL = /^https:\/\/[wa]\d+\.gold-usergeneratedcontent\.net\/\d{8,12}\/\d{1,5}\/[0-9a-f]{64}\.(?:webp|avif)$/;

  function galleryIdFromUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (url.protocol !== 'https:' || !['hitomi.la', 'www.hitomi.la'].includes(url.hostname) ||
          url.port || url.username || url.password) return '';
      // Explicit #1 works remain on the established hash-iframe path.
      if (url.hash) return '';
      const match = /^\/(?:reader|galleries)\/(\d{1,12})\.html$/.exec(url.pathname) ||
        /^\/imageset\/[^/]+-(\d{1,12})\.html$/.exec(url.pathname);
      return match && Number(match[1]) > 0 ? match[1] : '';
    } catch (_) { return ''; }
  }

  function validateUrls(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PAGES) {
      throw new Error('外部サイトのページ一覧が不正です。');
    }
    if (value.some(url => typeof url !== 'string' || !IMAGE_URL.test(url)) ||
        new Set(value).size !== value.length) {
      throw new Error('外部サイトの画像URLが不正です。');
    }
    return value.slice();
  }

  // Intentionally uses script tags rather than fetch: upstream galleryinfo and
  // gg.js are JavaScript resources and may not advertise CORS for fetch().
  // The scripts cannot access testCode's origin, storage, cookies or Vault.
  function isolatedPageLookup(id, { documentRef, windowRef, signal, timeoutMs = 9000 }) {
    if (signal?.aborted) return Promise.reject(Object.assign(new Error('中止しました。'), { name: 'AbortError' }));
    if (!documentRef?.createElement || !windowRef?.addEventListener) {
      return Promise.reject(new Error('ブラウザの外部画像取得機能が利用できません。'));
    }
    const nonce = String(Date.now()) + '-' + String(Math.random()).slice(2);
    // The only interpolated values are a validated numeric ID and nonce.
    const script = [
      '(function () {',
      '  "use strict";',
      '  var nonce = ' + JSON.stringify(nonce) + ';',
      '  var id = ' + JSON.stringify(id) + ';',
      '  function respond(ok, data) { parent.postMessage({ channel:"testcode-remote-gallery-v1", nonce:nonce, ok:ok, data:data }, "*"); }',
      '  function load(path) { return new Promise(function(resolve, reject) {',
      '    var s = document.createElement("script");',
      '    s.src = "https://ltn.' + DOMAIN + '/" + path;',
      '    s.onload = resolve;',
      '    s.onerror = function() { reject(new Error("外部サイトの情報を取得できません。")); };',
      '    document.head.appendChild(s);',
      '  }); }',
      '  load("gg.js").then(function() { return load("galleries/" + id + ".js"); }).then(function() {',
      '    if (typeof gg === "undefined" || !gg || typeof gg.s !== "function" || typeof gg.m !== "function" ||',
      '        typeof gg.b !== "string" || typeof galleryinfo === "undefined" || !galleryinfo || !Array.isArray(galleryinfo.files))',
      '      throw new Error("ページ情報の形式が変わりました。");',
      '    var base = String(gg.b);',
      '    if (!(new RegExp("^[0-9]{8,12}/$")).test(base)) throw new Error("画像配信設定の形式が変わりました。");',
      '    var entries = galleryinfo.files;',
      '    if (!entries.length || entries.length > 2000) throw new Error("ページ数が不正です。");',
      '    var urls = entries.map(function(file) {',
      '      var hash = String(file && file.hash || "").toLowerCase();',
      '      if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("画像識別子が不正です。");',
      '      var ext = Number(file.haswebp) === 1 ? "webp" : Number(file.hasavif) === 1 ? "avif" : "";',
      '      if (!ext) throw new Error("対応する画像形式がありません。");',
      '      var hex = hash.slice(-1) + hash.slice(-3, -1);',
      '      var backend = Number(gg.m(parseInt(hex, 16)));',
      '      var shard = String(gg.s(hash));',
      '      if (!Number.isInteger(backend) || backend < 0 || backend > 15 || !/^[0-9]{1,5}$/.test(shard))',
      '        throw new Error("画像配信先の形式が変わりました。");',
      '      return "https://" + (ext === "webp" ? "w" : "a") + (backend + 1) + ".' + DOMAIN + '/" + base + shard + "/" + hash + "." + ext;',
      '    });',
      '    respond(true, urls);',
      '  }).catch(function(error) { respond(false, String(error && error.message || error)); });',
      '})();'
    ].join('\n');

    return new Promise((resolve, reject) => {
      const iframe = documentRef.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts'); // no allow-same-origin
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
      iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
      iframe.referrerPolicy = 'no-referrer';
      let finished = false;
      let timer;
      function cleanup() {
        windowRef.removeEventListener('message', receive);
        signal?.removeEventListener?.('abort', abort);
        windowRef.clearTimeout(timer);
        iframe.remove();
      }
      function finish(error, urls) {
        if (finished) return;
        finished = true;
        cleanup();
        if (error) reject(error);
        else resolve(urls);
      }
      function abort() {
        finish(Object.assign(new Error('中止しました。'), { name: 'AbortError' }));
      }
      function receive(event) {
        if (event.source !== iframe.contentWindow || event.origin !== 'null' ||
            event.data?.channel !== 'testcode-remote-gallery-v1' || event.data?.nonce !== nonce) return;
        if (event.data.ok !== true) {
          finish(new Error(typeof event.data.data === 'string' ? event.data.data.slice(0, 150) : '外部画像の取得に失敗しました。'));
          return;
        }
        try { finish(null, validateUrls(event.data.data)); }
        catch (error) { finish(error); }
      }
      windowRef.addEventListener('message', receive);
      signal?.addEventListener?.('abort', abort, { once: true });
      timer = windowRef.setTimeout(() => finish(new Error('外部サイトの応答がありません。')), timeoutMs);
      iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
        script + '</scr' + 'ipt></body></html>';
      documentRef.body.appendChild(iframe);
    });
  }

  function create({ documentRef = globalThis.document, windowRef = globalThis,
                    lookup = isolatedPageLookup, timeoutMs } = {}) {
    return Object.freeze({
      supports: (url) => !!galleryIdFromUrl(url),
      async resolve(item, { signal } = {}) {
        const id = galleryIdFromUrl(item?.url);
        if (!id) throw new Error('対応する外部漫画URLではありません。');
        const urls = validateUrls(await lookup(id, { documentRef, windowRef, signal, timeoutMs }));
        const start = Number.isSafeInteger(Number(item?.pageRangeStart)) && Number(item.pageRangeStart) >= 1
          ? Number(item.pageRangeStart) : 1;
        const end = Number.isSafeInteger(Number(item?.pageRangeEnd)) && Number(item.pageRangeEnd) >= start
          ? Number(item.pageRangeEnd) : urls.length;
        if (start > urls.length) throw new Error('開始ページが作品の総ページ数を超えています。');
        return urls.slice(start - 1, Math.min(end, urls.length));
      }
    });
  }
  const api = Object.freeze({ galleryIdFromUrl, validateUrls, isolatedPageLookup, create });
  if (typeof window !== 'undefined') window.ReaderHitomiSourceFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
