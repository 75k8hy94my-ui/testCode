/* Sequential MPEG-TS playback without persistent segment storage.
 * URL format: https://host/path/1.ts#ts=1-120&seconds=6
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
      if (!params.has('ts')) return null;
      const range = /^(\d+)-(\d+)$/.exec(params.get('ts') || '');
      if (!range) return null;
      const start = Number(range[1]), end = Number(range[2]);
      const seconds = Number(params.get('seconds') || 6);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || end < start || end - start > 9999
        || Number(match[2]) !== start || !(seconds > 0 && seconds <= 120)) return null;
      const digits = match[2].length;
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
    for (let n = config.start; n <= config.end; n++) {
      lines.push('#EXTINF:' + config.seconds + ',', config.segment(n));
    }
    lines.push('#EXT-X-ENDLIST');
    return lines.join('\n') + '\n';
  }
  function attach(video, input, HlsCtor) {
    const config = parse(input);
    if (!config) throw new Error('URL末尾に #ts=1-120&seconds=6 の形式で範囲と長さを指定してください。');
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
  return { parse, manifest, attach };
});
