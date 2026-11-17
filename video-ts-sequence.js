/* Sequential MPEG-TS playback without persistent segment storage.
 * URL format: https://host/path/1.ts (optional: #ts=1-120&seconds=6)
 * The fragment is local configuration, never sent to the media host.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TestCodeTsSequence = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function parse(input) {
    try {
      const url = new URL(input);
      if (!/^https?:$/.test(url.protocol)) return null;
      const match = url.pathname.match(/^(.*\/)(\d+)(\.ts)$/i);
      if (!match) return null;
      const params = new URLSearchParams(url.hash.slice(1));
      const range = params.has('ts') ? /^(\d+)-(\d+)$/.exec(params.get('ts') || '') : null;
      if (params.has('ts') && !range) return null;
      const start = range ? Number(range[1]) : Number(match[2]);
      const end = range ? Number(range[2]) : null;
      const seconds = params.has('seconds') ? Number(params.get('seconds')) : 6;
      if (!Number.isSafeInteger(start) || (end !== null && (!Number.isSafeInteger(end) || end < start || end - start > 9999))
        || Number(match[2]) !== start || !(seconds > 0 && seconds <= 120)) return null;
      const digits = match[2].length;
      if ([...params.keys()].some(key => key !== 'ts' && key !== 'seconds')) return null;
      url.hash = '';
      return {
        start, end, seconds,
        segment(index) {
          const next = new URL(url.href);
          next.pathname = match[1] + String(index).padStart(digits, '0') + match[3];
          return next.href;
        },
      };
    } catch (_) { return null; }
  }
  function manifest(config) {
    if (!config) throw new Error('連番TSのURLを確認してください。');
    const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXT-X-TARGETDURATION:' + Math.ceil(config.seconds),
      '#EXT-X-MEDIA-SEQUENCE:0'];
    if (config.end == null) throw new Error('終端番号を検出できていません。');
    for (let n = config.start; n <= config.end; n++) {
      lines.push('#EXTINF:' + config.seconds + ',', config.segment(n));
    }
    lines.push('#EXT-X-ENDLIST');
    return lines.join('\n') + '\n';
  }
  // Discover the end using header-only probes; do not download or persist TS bodies.
  // Exponential search followed by binary search avoids thousands of sequential requests.
  async function discoverEnd(config, fetchImpl, signal) {
    if (config.end !== null) return config.end;
    const fetcher = fetchImpl || fetch;
    async function exists(index) {
      let response;
      try {
        response = await fetcher(config.segment(index), {
          method: 'HEAD', mode: 'cors', cache: 'no-store', signal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error('TSファイルの確認に失敗しました。配信元のCORS設定または通信状況を確認してください。');
      }
      if (response.status === 404 || response.status === 410) return false;
      if (!response.ok) throw new Error('TSファイル確認時にHTTP ' + response.status + 'が返されました。');
      const type = response.headers?.get?.('content-type') || '';
      if (/text\/html|application\/json/i.test(type)) return false;
      return true;
    }
    if (!(await exists(config.start))) throw new Error('最初のTSファイルが見つかりません。');
    let good = config.start, step = 1;
    const max = config.start + 9999;
    while (good + step <= max && await exists(good + step)) {
      good += step;
      step = Math.min(step * 2, max - good + 1);
    }
    let bad = Math.min(max + 1, good + step);
    if (bad === max + 1 && good < max && await exists(max)) {
      throw new Error('連番TSの探索上限（10000件）に達しました。');
    }
    if (bad !== max + 1 && await exists(bad)) {
      throw new Error('連番TSの探索上限に達しました。');
    }
    while (bad - good > 1) {
      const mid = good + Math.floor((bad - good) / 2);
      if (await exists(mid)) good = mid;
      else bad = mid;
    }
    return good;
  }
  async function attach(video, input, HlsCtor, options = {}) {
    const config = parse(input);
    if (!config) throw new Error('連番の最初のTS URL（例：1.ts）を指定してください。');
    config.end = await discoverEnd(config, options.fetch, options.signal);
    if (options.signal?.aborted) throw new Error('再生開始が取り消されました。');
    const blobUrl = URL.createObjectURL(new Blob([manifest(config)], { type: 'application/vnd.apple.mpegurl' }));
    let hls = null;
    try {
      if (HlsCtor && HlsCtor.isSupported()) {
        hls = new HlsCtor({ enableWorker: true, maxBufferLength: 30, backBufferLength: 30 });
        hls.loadSource(blobUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = blobUrl;
      } else {
        throw new Error('このブラウザにはHLS再生機能がありません。');
      }
    } catch (error) {
      URL.revokeObjectURL(blobUrl);
      if (hls) hls.destroy();
      throw error;
    }
    return () => {
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(blobUrl);
    };
  }
  return { parse, manifest, discoverEnd, attach };
});
