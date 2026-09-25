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
      drawImage(source, targetCanvas, { width, height, sourceX = 0, sourceY = 0, sourceWidth = width, sourceHeight = height } = {}) {
        const context = targetCanvas.getContext('2d', { alpha: false });
        context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
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

  async function processPhotoOnMainThread(file, options = {}) {
    const profile = normalizeCompressionProfile(options.profile || getCompressionProfile());
    const signal = options.signal;
    const onProgress = options.onProgress;
    const runtime = options.runtime || createDefaultRuntime();
    const targetBytes = Number.isInteger(options.previewTargetBytes) ? options.previewTargetBytes : profile.preview.targetBytes;
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
      for (const candidate of previewCandidates) {
        throwIfAborted(signal);
        const dimensions = calculateScaledDimensions(decoded.width, decoded.height, candidate.longEdge);
        const canvas = runtime.createCanvas(dimensions.width, dimensions.height);
        try {
          runtime.drawImage(decoded.source, canvas, { width: dimensions.width, height: dimensions.height });
          const blob = await encodeCanvas(runtime, canvas, profile.preview.mimeType, candidate.quality, signal);
          preview = { ...dimensions, mimeType: profile.preview.mimeType, bytes: blob.size, quality: candidate.quality, blob };
          if (blob.size <= targetBytes) break;
        } finally {
          runtime.releaseCanvas?.(canvas);
        }
      }
      if (!preview) throw new Error('Preview encoding produced no output');
      report(onProgress, 'preview', 1, 1);
      throwIfAborted(signal);

      const plannedLevels = planZoomLevels(decoded.width, decoded.height, profile);
      report(onProgress, 'pyramid', 0, plannedLevels.length);
      const totalTiles = plannedLevels.reduce((sum, level) => sum + calculateTileGrid(level.width, level.height, profile.zoom.tileSize).columns * calculateTileGrid(level.width, level.height, profile.zoom.tileSize).rows, 0);
      let completedTiles = 0;
      for (const plannedLevel of plannedLevels) {
        throwIfAborted(signal);
        const grid = calculateTileGrid(plannedLevel.width, plannedLevel.height, profile.zoom.tileSize);
        const levelCanvas = runtime.createCanvas(plannedLevel.width, plannedLevel.height);
        const tileMetadata = [];
        try {
          runtime.drawImage(decoded.source, levelCanvas, { width: plannedLevel.width, height: plannedLevel.height });
          for (let y = 0; y < grid.rows; y += 1) {
            for (let x = 0; x < grid.columns; x += 1) {
              throwIfAborted(signal);
              const rect = calculateTileRect(plannedLevel.width, plannedLevel.height, x, y, profile.zoom.tileSize);
              const tileCanvas = runtime.createCanvas(rect.width, rect.height);
              try {
                runtime.drawImage(levelCanvas, tileCanvas, {
                  width: rect.width,
                  height: rect.height,
                  sourceX: rect.pixelX,
                  sourceY: rect.pixelY,
                  sourceWidth: rect.width,
                  sourceHeight: rect.height
                });
                const blob = await encodeCanvas(runtime, tileCanvas, profile.zoom.mimeType, profile.zoom.quality, signal);
                tileBlobs.push(blob);
                tileMetadata.push({ x, y, ...rect, mimeType: profile.zoom.mimeType, bytes: blob.size, quality: profile.zoom.quality });
                completedTiles += 1;
                report(onProgress, 'tiles', completedTiles, totalTiles);
              } finally {
                runtime.releaseCanvas?.(tileCanvas);
              }
            }
          }
        } finally {
          runtime.releaseCanvas?.(levelCanvas);
        }
        levels.push({ ...plannedLevel, ...grid, tiles: tileMetadata });
        report(onProgress, 'pyramid', levels.length, plannedLevels.length);
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
    const workerUrl = new URL('image-processing-worker.js', base || undefined);
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
        callback(value);
      };
      const onAbort = () => {
        worker?.terminate?.();
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
        worker.postMessage({ type: 'process', file, profile: options.profile || getCompressionProfile() });
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
    if (options.preferWorker && workerFactory) {
      try {
        return await runInWorker(file, options, workerFactory);
      } catch (error) {
        if (error.name === 'AbortError' || options.signal?.aborted) throw createAbortError();
      }
    }
    return processPhotoOnMainThread(file, options);
  }

  const api = { processPhoto, processPhotoOnMainThread, createAbortError };
  const host = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null);
  if (host) host.ImagePhotoProcessor = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
