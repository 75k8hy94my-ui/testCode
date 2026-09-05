(() => {
  'use strict';

  const FILES = [
    'extension/manifest.json',
    'extension/background.js',
    'extension/popup.html',
    'extension/popup.css',
    'extension/popup.js',
    'extension/content/rule-locator.js',
    'extension/content/extractor.js',
    'extension/content/element-picker.js',
    'extension/content/site-toolbar.js',
    'extension/content/testcode-content.js'
  ];
  const DOWNLOAD_NAME = 'testcode-manga-extension.zip';
  const encoder = new TextEncoder();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(value) {
    const out = new Uint8Array(2);
    new DataView(out.buffer).setUint16(0, value, true);
    return out;
  }

  function u32(value) {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0, true);
    return out;
  }

  function concat(parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  function localHeader(nameBytes, data, crc) {
    return concat([
      encoder.encode('PK\u0003\u0004'),
      u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), nameBytes, data
    ]);
  }

  function centralHeader(nameBytes, data, crc, offset) {
    return concat([
      encoder.encode('PK\u0001\u0002'),
      u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), nameBytes
    ]);
  }

  function endOfCentralDirectory(count, centralSize, centralOffset) {
    return concat([
      encoder.encode('PK\u0005\u0006'),
      u16(0), u16(0), u16(count), u16(count),
      u32(centralSize), u32(centralOffset), u16(0)
    ]);
  }

  async function fetchFiles() {
    return Promise.all(FILES.map(async (path) => {
      const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`${path} (${response.status})`);
      return {
        name: path.replace(/^extension\//, ''),
        data: new Uint8Array(await response.arrayBuffer())
      };
    }));
  }

  function buildZip(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const crc = crc32(file.data);
      const local = localHeader(nameBytes, file.data, crc);
      locals.push(local);
      centrals.push(centralHeader(nameBytes, file.data, crc, offset));
      offset += local.length;
    }
    const central = concat(centrals);
    return concat([...locals, central, endOfCentralDirectory(files.length, central.length, offset)]);
  }

  async function download(button, status) {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'ZIPを作成中…';
    status.textContent = '';
    try {
      const zip = buildZip(await fetchFiles());
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = DOWNLOAD_NAME;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      status.textContent = 'ダウンロードしました。ZIPを展開して拡張機能として読み込んでください。';
    } catch (error) {
      status.textContent = `ダウンロードを作成できませんでした: ${error && error.message ? error.message : '不明なエラー'}`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('extensionDownloadBtn');
    const status = document.getElementById('extensionDownloadStatus');
    if (!button || !status) return;
    button.addEventListener('click', () => download(button, status));
  });
})();
