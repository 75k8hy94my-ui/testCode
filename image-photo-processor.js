(() => {
  'use strict';

  const profileApi = typeof require === 'function'
    ? require('./image-compression-profile.js')
    : ((typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null))?.ImageCompressionProfile || null);
  const pyramidApi = typeof require === 'function'
    ? require('./image-pyramid-builder.js')
    : ((typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null))?.ImagePyramidBuilder || null);
  if (!profileApi || !pyramidApi) throw new Error('Image processing dependencies are required');

  const { getCompressionProfile, normalizeCompressionProfile } = profileApi;
  const { calculateScaledDimensions, planZoomLevels, calculateTileGrid, calculateTileRect, buildManifestMetadata } = pyramidApi;

  function createAbortError() {
    const error = new Error('Image processing was aborted');
    error.name = 'AbortError';
    return error;
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw createAbortError();
  }

  function report(onProgress, phase, completed, total) {
    if (typeof onProgress === 'function') onProgress({ phase, completed, total });
  }

  function getGlobal(name) {
    return typeof globalThis !== 'undefined' ? globalThis[name] : undefined;
  }

  function createDefaultRuntime() {
    return {
      async decode(file) {
        const createImageBitmapFunction = getGlobal('createImageBitmap');
        if (typeof createImageBitmapFunction === 'function') {
          let bitmap;
          try {
            bitmap = await createImageBitmapFunction(file, { imageOrientation: 'from-image' });
          } catch (firstError) {
            try {
              bitmap = await createImageBitmapFunction(file);
            } catch (secondError) {
              if (!getGlobal('document')) throw firstError;
            }
          }
          if (bitmap) return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
        }

        const documentObject = getGlobal('document');
        const URLObject = getGlobal('URL');
        if (!documentObject || !URLObject || typeof URLObject.createObjectURL !== 'function') {
          throw new Error('No browser image decoder is available');
        }
        const url = URLObject.createObjectURL(file);
        try {
          const image = await new Promise((resolve, reject) => {
            const element = documentObject.createElement('img');
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('Unable to decode image'));
            element.src = url;
          });
          return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URLObject.revokeObjectURL(url) };
        } catch (error) {
          URLObject.revokeObjectURL(url);
          throw error;
        }
      },
      createCanvas(width, height) {
        const OffscreenCanvasObject = getGlobal('OffscreenCanvas');
        if (typeof OffscreenCanvasObject === 'function') return new OffscreenCanvasObject(width, height);
        const documentObject = getGlobal('document');
        if (!documentObject) throw new Error('No canvas implementation is available');
        const canvas = documentObject.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
      },
      drawImage(source, targetCanvas, { width, height, sourceX, sourceY, sourceWidth, sourceHeight } = {}) {
        const context = targetCanvas.getContext('2d', { alpha: false });
        if (sourceWidth == null || sourceHeight == null) {
          context.drawImage(source, 0, 0, width, height);
        } else {
          context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
        }
      },
      async encode(canvas, mimeType, quality) {
        if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type: mimeType, quality });
        return new Promise((resolve, reject) => {
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas encoding failed')), mimeType, quality);
        });
      },
      releaseCanvas(canvas) {
        if (canvas && typeof canvas.width === 'number') canvas.width = 1;
        if (canvas && typeof canvas.height === 'number') canvas.height = 1;
      }
    };
  }

  async function encodeCanvas(runtime, canvas, mimeType, quality, signal) {
    throwIfAborted(signal);
    const blob = await runtime.encode(canvas, mimeType, quality);
    throwIfAborted(signal);
    if (!(blob instanceof Blob) && (!blob || typeof blob.size !== 'number')) throw new Error('Canvas encoder did not return a Blob');
    return blob;
  }

  // Canvas implementations may silently export PNG when asked for WebP.
  // Safari/iOS Safari support WebP decoding but not Canvas WebP encoding.
  // Avoid huge PNG files and misleading image/webp manifest metadata.
  async function encodeWithSupportedFormat(runtime, canvas, requestedMimeType, quality, signal) {
    const blob = await encodeCanvas(runtime, canvas, requestedMimeType, quality, signal);
    const actualMimeType = String(blob.type || requestedMimeType).toLowerCase();
    if (actualMimeType === requestedMimeType.toLowerCase()) {
      return { blob, mimeType: requestedMimeType };
    }
    if (requestedMimeType === 'image/webp' && actualMimeType === 'image/png') {
      const jpeg = await encodeCanvas(runtime, canvas, 'image/jpeg', quality, signal);
      if (String(jpeg.type || '').toLowerCase() !== 'image/jpeg') {
        throw new Error('このブラウザーはJPEG画像の書き出しに対応していません。');
      }
      return { blob: jpeg, mimeType: 'image/jpeg' };
    }
    throw new Error('ブラウザーが指定された画像形式で書き出せませんでした: ' + requestedMimeType);
  }


  function normalizePhotoOptimization(value) {
    if (!value) return null;
    const n = name => Number(value[name]);
    const config = {
      bytesPerMegapixel: n('bytesPerMegapixel'),
      maxZoomBytes: n('maxZoomBytes'),
      minZoomBytes: n('minZoomBytes'),
      minQuality: n('minQuality'),
      minZoomLongEdge: n('minZoomLongEdge'),
      maxPasses: n('maxPasses')
    };
    if (!Number.isFinite(config.bytesPerMegapixel) || config.bytesPerMegapixel <= 0 ||
        !Number.isSafeInteger(config.maxZoomBytes) || config.maxZoomBytes < 1 ||
        !Number.isSafeInteger(config.minZoomBytes) || config.minZoomBytes < 1 ||
        config.minZoomBytes > config.maxZoomBytes ||
        !Number.isFinite(config.minQuality) || config.minQuality < 0.4 || config.minQuality > 1 ||
        !Number.isSafeInteger(config.minZoomLongEdge) || config.minZoomLongEdge < 1 ||
        !Number.isInteger(config.maxPasses) || config.maxPasses < 1 || config.maxPasses > 6) {
      throw new TypeError('photo optimization settings are invalid');
    }
    return config;
  }

  async function encodeZoomLevel({ decoded, runtime, profile, plannedLevel, quality, mimeType, signal, onTile }) {
    const grid = calculateTileGrid(plannedLevel.width, plannedLevel.height, profile.zoom.tileSize);
    const levelCanvas = runtime.createCanvas(plannedLevel.width, plannedLevel.height);
    const blobs = [];
    const tileMetadata = [];
    let totalBytes = 0;
    let actualMimeType = mimeType;
    try {
      runtime.drawImage(decoded.source, levelCanvas, { width: plannedLevel.width, height: plannedLevel.height });
      for (let y = 0; y < grid.rows; y += 1) {
        for (let x = 0; x < grid.columns; x += 1) {
          throwIfAborted(signal);
          const rect = calculateTileRect(plannedLevel.width, plannedLevel.height, x, y, profile.zoom.tileSize);
          const canvas = runtime.createCanvas(rect.width, rect.height);
          try {
            runtime.drawImage(levelCanvas, canvas, {
              width: rect.width, height: rect.height, sourceX: rect.pixelX, sourceY: rect.pixelY,
              sourceWidth: rect.width, sourceHeight: rect.height
            });
            const encoded = await encodeWithSupportedFormat(runtime, canvas, actualMimeType, quality, signal);
            actualMimeType = encoded.mimeType;
            blobs.push(encoded.blob);
            totalBytes += encoded.blob.size;
            tileMetadata.push({ x, y, ...rect, mimeType: encoded.mimeType, bytes: encoded.blob.size, quality });
            onTile?.(blobs.length, grid.rows * grid.columns);
          } finally {
            runtime.releaseCanvas?.(canvas);
          }
        }
      }
    } finally {
      runtime.releaseCanvas?.(levelCanvas);
    }
    return {
      level: { ...plannedLevel, ...grid, tiles: tileMetadata },
      blobs, totalBytes, mimeType: actualMimeType
    };
  }

  async function optimizePhotoZoom({ decoded, runtime, profile, plannedLevel, mimeType, signal, onProgress, options }) {
    const megapixels = plannedLevel.width * plannedLevel.height / 1000000;
    // Limits scale with the *actual* photo dimensions, not with source file size.
    const targetBytes = Math.min(options.maxZoomBytes,
      Math.max(options.minZoomBytes, Math.round(megapixels * options.bytesPerMegapixel)));
    const minEdge = Math.min(plannedLevel.longEdge,
      Math.max(profile.preview.maxLongEdge + 1, options.minZoomLongEdge));
    let quality = profile.zoom.quality;
    if (quality < options.minQuality) throw new TypeError('minimum photo quality exceeds initial quality');
    let edge = plannedLevel.longEdge;
    let selected = null;
    for (let attempt = 0; attempt < options.maxPasses; attempt += 1) {
      throwIfAborted(signal);
      const dims = calculateScaledDimensions(decoded.width, decoded.height, edge);
      const level = { ...plannedLevel, ...dims, longEdge: dims.longEdge };
      const encoded = await encodeZoomLevel({
        decoded, runtime, profile, plannedLevel: level, quality, mimeType, signal,
        onTile: (completed, total) => report(onProgress, 'tiles', completed, total)
      });
      const ratio = encoded.totalBytes / targetBytes;
      onProgress?.({
        phase: 'optimizing', completed: attempt + 1, total: options.maxPasses,
        outputBytes: encoded.totalBytes, targetBytes, quality, longEdge: level.longEdge
      });
      // A later trial must not replace a smaller result with a larger one.
      if (!selected || encoded.totalBytes < selected.totalBytes) selected = encoded;
      if (encoded.totalBytes <= targetBytes) {
        selected = encoded;
        break;
      }
      if (attempt + 1 === options.maxPasses) break;
      if (quality > options.minQuality + 0.005) {
        const drop = Math.min(0.22, Math.max(0.06, Math.log2(Math.max(1, ratio)) * 0.10 + 0.04));
        quality = Math.max(options.minQuality, Math.round((quality - drop) * 100) / 100);
      } else if (edge > minEdge) {
        const factor = Math.max(0.60, Math.min(0.90, Math.sqrt(1 / ratio) * 0.94));
        edge = Math.max(minEdge, Math.min(edge - 1, Math.floor(edge * factor)));
      } else break; // Quality and resolution floors are deliberate, not a hard size promise.
    }
    return selected;
  }

  async function processPhotoOnMainThread(file, options = {}) {
    const profile = normalizeCompressionProfile(options.profile || getCompressionProfile());
    const signal = options.signal;
    const onProgress = options.onProgress;
    const runtime = options.runtime || createDefaultRuntime();
    const targetBytes = Number.isInteger(options.previewTargetBytes) ? options.previewTargetBytes : profile.preview.targetBytes;
    const photoOptimization = normalizePhotoOptimization(options.photoOptimization);
    let decoded;
    const tileBlobs = [];
    const levels = [];
    try {
      throwIfAborted(signal);
      report(onProgress, 'decode', 0, 1);
      decoded = await runtime.decode(file);
      if (!decoded || !Number.isInteger(decoded.width) || !Number.isInteger(decoded.height)) throw new Error('Decoded image dimensions are invalid');
      report(onProgress, 'decode', 1, 1);
      throwIfAborted(signal);

      const source = { width: decoded.width, height: decoded.height, mimeType: String(file?.type || 'application/octet-stream'), bytes: Number(file?.size || 0) };
      const previewCandidates = [
        { longEdge: profile.preview.maxLongEdge, quality: profile.preview.initialQuality },
        { longEdge: profile.preview.maxLongEdge, quality: profile.preview.preferredQuality },
        { longEdge: profile.preview.maxLongEdge, quality: profile.preview.fallbackQuality },
        { longEdge: profile.preview.fallbackLongEdge, quality: profile.preview.fallbackQuality }
      ];
      let preview = null;
      let previewMimeType = profile.preview.mimeType;
      for (const candidate of previewCandidates) {
        throwIfAborted(signal);
        const dimensions = calculateScaledDimensions(decoded.width, decoded.height, candidate.longEdge);
        const canvas = runtime.createCanvas(dimensions.width, dimensions.height);
        try {
          runtime.drawImage(decoded.source, canvas, { width: dimensions.width, height: dimensions.height });
          const encoded = await encodeWithSupportedFormat(runtime, canvas, previewMimeType, candidate.quality, signal);
          previewMimeType = encoded.mimeType;
          const blob = encoded.blob;
          preview = { ...dimensions, mimeType: encoded.mimeType, bytes: blob.size, quality: candidate.quality, blob };
          if (blob.size <= targetBytes) break;
        } finally {
          runtime.releaseCanvas?.(canvas);
        }
      }
      if (!preview) throw new Error('Preview encoding produced no output');
      report(onProgress, 'preview', 1, 1);
      throwIfAborted(signal);

      let zoomMimeType = profile.zoom.mimeType === 'image/webp' && previewMimeType === 'image/jpeg'
        ? 'image/jpeg' : profile.zoom.mimeType;
      const plannedLevels = planZoomLevels(decoded.width, decoded.height, profile);
      report(onProgress, 'pyramid', 0, plannedLevels.length);
      if (photoOptimization && plannedLevels.length === 1) {
        const selected = await optimizePhotoZoom({
          decoded, runtime, profile, plannedLevel: plannedLevels[0],
          mimeType: zoomMimeType, signal, onProgress, options: photoOptimization
        });
        tileBlobs.push(...selected.blobs);
        levels.push(selected.level);
        report(onProgress, 'pyramid', 1, 1);
      } else {
        const totalTiles = plannedLevels.reduce((sum, level) => sum +
          calculateTileGrid(level.width, level.height, profile.zoom.tileSize).columns *
          calculateTileGrid(level.width, level.height, profile.zoom.tileSize).rows, 0);
        let completedTiles = 0;
        for (const plannedLevel of plannedLevels) {
          throwIfAborted(signal);
          const encoded = await encodeZoomLevel({
            decoded, runtime, profile, plannedLevel, mimeType: zoomMimeType,
            quality: profile.zoom.quality, signal,
            onTile: () => report(onProgress, 'tiles', ++completedTiles, totalTiles)
          });
          zoomMimeType = encoded.mimeType;
          tileBlobs.push(...encoded.blobs);
          levels.push(encoded.level);
          report(onProgress, 'pyramid', levels.length, plannedLevels.length);
        }
      }

      const manifest = buildManifestMetadata({ source, preview: { width: preview.width, height: preview.height, mimeType: preview.mimeType, bytes: preview.bytes, quality: preview.quality, longEdge: preview.longEdge }, levels }, profile);
      throwIfAborted(signal);
      report(onProgress, 'complete', 1, 1);
      return { manifest, previewBlob: preview.blob, tileBlobs };
    } finally {
      decoded?.close?.();
    }
  }

  function defaultWorkerFactory() {
    const WorkerObject = getGlobal('Worker');
    if (typeof WorkerObject !== 'function') return null;
    const documentObject = getGlobal('document');
    const base = documentObject?.baseURI || getGlobal('location')?.href || '';
    const workerUrl = new URL('image-processing-worker.js?v=20261008-adaptive-photo', base || undefined);
    return () => new WorkerObject(workerUrl, { type: 'classic' });
  }

  function runInWorker(file, options, workerFactory) {
    return new Promise((resolve, reject) => {
      let worker;
      let settled = false;
      const signal = options.signal;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener?.('abort', onAbort);
        worker?.removeEventListener?.('message', onMessage);
        worker?.removeEventListener?.('error', onError);
        if (worker) {
          worker.onmessage = null;
          worker.onerror = null;
          worker.terminate?.();
        }
        callback(value);
      };
      const onAbort = () => {
        finish(reject, createAbortError());
      };
      const onError = event => {
        const error = new Error(event?.message || 'Image processing worker failed');
        error.workerFailure = true;
        finish(reject, error);
      };
      const onMessage = event => {
        const message = event?.data || event;
        if (!message) return;
        if (message.type === 'progress') {
          const progress = message.progress;
          if (progress) options.onProgress?.(progress);
        } else if (message.type === 'complete') {
          finish(resolve, message.result);
        } else if (message.type === 'error') {
          const error = new Error(message.error?.message || 'Image processing worker failed');
          error.workerFailure = true;
          finish(reject, error);
        }
      };
      try {
        worker = workerFactory();
        if (!worker) throw new Error('Worker is unavailable');
        if (typeof worker.addEventListener === 'function') {
          worker.addEventListener('message', onMessage);
          worker.addEventListener('error', onError);
        } else {
          worker.onmessage = onMessage;
          worker.onerror = onError;
        }
        signal?.addEventListener?.('abort', onAbort, { once: true });
        throwIfAborted(signal);
        worker.postMessage({ type: 'process', file, profile: options.profile || getCompressionProfile(), photoOptimization: options.photoOptimization });
      } catch (error) {
        if (error.name === 'AbortError') finish(reject, error);
        else {
          error.workerFailure = true;
          finish(reject, error);
        }
      }
    });
  }

  async function processPhoto(file, options = {}) {
    const workerFactory = options.workerFactory || defaultWorkerFactory();
    if (options.preferWorker !== false && workerFactory) {
      try {
        return await runInWorker(file, options, workerFactory);
      } catch (error) {
        if (error.name === 'AbortError' || options.signal?.aborted) throw createAbortError();
      }
    }
    return processPhotoOnMainThread(file, options);
  }

  const api = { processPhoto, processPhotoOnMainThread, createAbortError, createDefaultRuntime };
  const host = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null);
  if (host) host.ImagePhotoProcessor = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
