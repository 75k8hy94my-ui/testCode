(() => {
  'use strict';
  const STORAGE_KEY = 'mangaReaderProfileAvatar';
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_DATA_URL_BYTES = 100000;
  const SIDE = 256;
  const ALLOWED_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
  const AVATAR_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

  function normalize(value) {
    return typeof value === 'string' && value.length <= MAX_DATA_URL_BYTES && AVATAR_PATTERN.test(value) ? value : '';
  }
  function read(storage = globalThis.localStorage) {
    try { return normalize((typeof storage.getItem === 'function' ? storage.getItem(STORAGE_KEY) : storage.get?.(STORAGE_KEY)) || ''); } catch (_) { return ''; }
  }
  function write(value, storage = globalThis.localStorage) {
    const avatar = normalize(value);
    if (value && !avatar) throw new Error('プロフィール画像の形式が正しくありません。');
    if (avatar) {
      if (typeof storage.setItem === 'function') storage.setItem(STORAGE_KEY, avatar);
      else storage.set(STORAGE_KEY, avatar);
    } else if (typeof storage.removeItem === 'function') storage.removeItem(STORAGE_KEY);
    else storage.delete(STORAGE_KEY);
    return avatar;
  }
  function fromFile(file, options = {}) {
    if (!file || !ALLOWED_TYPES.includes(file.type) || file.size < 1 || file.size > MAX_FILE_BYTES) {
      return Promise.reject(new Error('JPEG・PNG・WebP画像（8MB以下）を選択してください。'));
    }
    const urlApi = options.urlApi || URL;
    const imageFactory = options.imageFactory || (() => new Image());
    const canvasFactory = options.canvasFactory || (() => document.createElement('canvas'));
    const url = urlApi.createObjectURL(file);
    return new Promise((resolve, reject) => {
      const image = imageFactory();
      let done = false;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        image.onload = null;
        image.onerror = null;
        urlApi.revokeObjectURL(url);
        if (error) reject(error); else resolve(value);
      };
      image.onerror = () => finish(new Error('画像を読み込めませんでした。'));
      image.onload = () => {
        try {
          const width = image.naturalWidth, height = image.naturalHeight;
          if (!width || !height || width * height > 40000000) throw new Error('画像のサイズが大きすぎます。');
          const canvas = canvasFactory();
          canvas.width = SIDE;
          canvas.height = SIDE;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('画像を処理できませんでした。');
          const side = Math.min(width, height);
          context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, SIDE, SIDE);
          let result = '';
          for (const quality of [0.84, 0.7, 0.55, 0.4]) {
            result = normalize(canvas.toDataURL('image/jpeg', quality));
            if (result) break;
          }
          if (!result) throw new Error('画像を圧縮できませんでした。別の画像を選択してください。');
          finish(null, result);
        } catch (error) { finish(error); }
      };
      image.src = url;
    });
  }
  const api = Object.freeze({ STORAGE_KEY, MAX_FILE_BYTES, MAX_DATA_URL_BYTES, SIDE, normalize, read, write, fromFile });
  if (typeof window !== 'undefined') window.ProfileAvatar = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
