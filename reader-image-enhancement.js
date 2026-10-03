(() => {
  'use strict';

  const MAX_PIXELS = 8000000;
  const SAMPLE_LIMIT = 140000;
  const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

  function histogramPercentile(histogram, total, percentile) {
    const target = Math.max(1, Math.floor(total * percentile));
    let count = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      count += histogram[value];
      if (count >= target) return value;
    }
    return histogram.length - 1;
  }

  function autoCorrectImageData(imageData) {
    const data = imageData?.data;
    const pixelCount = data?.length / 4;
    if (!pixelCount) return false;
    const histogram = new Uint32Array(256);
    const sampleStride = Math.max(1, Math.ceil(pixelCount / SAMPLE_LIMIT));
    let sampleCount = 0;
    let luminanceSum = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += sampleStride) {
      const offset = pixel * 4;
      const luminance = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
      histogram[Math.max(0, Math.min(255, Math.round(luminance)))] += 1;
      luminanceSum += luminance;
      sampleCount += 1;
    }
    const blackPoint = histogramPercentile(histogram, sampleCount, 0.02);
    const whitePoint = histogramPercentile(histogram, sampleCount, 0.98);
    const range = Math.max(32, whitePoint - blackPoint);
    const mean = luminanceSum / Math.max(1, sampleCount) / 255;
    const normalizedMean = Math.max(0.08, Math.min(0.92, (mean * 255 - blackPoint) / range));
    const gamma = normalizedMean < 0.42 ? Math.max(0.84, Math.min(1, Math.log(0.52) / Math.log(normalizedMean))) : 1;
    if (blackPoint <= 8 && whitePoint >= 247 && gamma === 1) return false;
    for (let offset = 0; offset < data.length; offset += 4) {
      const luminance = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
      const normalized = Math.max(0, Math.min(1, (luminance - blackPoint) / range));
      const corrected = Math.pow(normalized, gamma);
      const source = luminance / 255;
      const ratio = source > 0.015 ? corrected / source : corrected > 0 ? corrected / 0.015 : 0;
      data[offset] = clampByte(data[offset] * ratio);
      data[offset + 1] = clampByte(data[offset + 1] * ratio);
      data[offset + 2] = clampByte(data[offset + 2] * ratio);
    }
    return true;
  }

  function restore(image) {
    const source = image?.dataset?.originalSrc;
    if (image?._localEnhancementUrl) URL.revokeObjectURL(image._localEnhancementUrl);
    if (image) {
      image._localEnhancementUrl = '';
      delete image.dataset.localEnhanced;
      if (source && image.src !== source) image.src = source;
    }
  }

  async function enhanceElement(image, { documentRef = globalThis.document, windowRef = globalThis, maxPixels = MAX_PIXELS } = {}) {
    if (!image || image.dataset?.enhancePending === 'true' || image.dataset?.localEnhanced === 'true') return false;
    const originalSrc = image.dataset.originalSrc || image.currentSrc || image.src;
    if (!originalSrc || originalSrc.startsWith('blob:')) return false;
    image.dataset.originalSrc = originalSrc;
    image.dataset.enhancePending = 'true';
    try {
      const source = await new Promise((resolve, reject) => {
        const loaded = new windowRef.Image();
        const timer = windowRef.setTimeout(() => reject(new Error('image enhancement timeout')), 2500);
        loaded.decoding = 'async';
        if (/^https?:/i.test(originalSrc)) loaded.crossOrigin = 'anonymous';
        loaded.onload = () => { windowRef.clearTimeout(timer); resolve(loaded); };
        loaded.onerror = () => { windowRef.clearTimeout(timer); reject(new Error('image enhancement source unavailable')); };
        loaded.src = originalSrc;
      });
      const pixels = source.naturalWidth * source.naturalHeight;
      if (!pixels) return false;
      const scale = Math.min(1, Math.sqrt(maxPixels / pixels));
      const canvas = documentRef.createElement('canvas');
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return false;
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      let data;
      try { data = context.getImageData(0, 0, canvas.width, canvas.height); } catch (_) { return false; }
      if (!autoCorrectImageData(data)) { image.dataset.localEnhanced = 'true'; return true; }
      context.putImageData(data, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));
      if (!blob) return false;
      const enhancedUrl = windowRef.URL.createObjectURL(blob);
      if (!image.isConnected || image.dataset.originalSrc !== originalSrc) {
        windowRef.URL.revokeObjectURL(enhancedUrl);
        return false;
      }
      image._localEnhancementUrl = enhancedUrl;
      image.dataset.localEnhanced = 'true';
      image.src = enhancedUrl;
      return true;
    } catch (_) {
      return false;
    } finally {
      delete image.dataset.enhancePending;
    }
  }

  const api = Object.freeze({ autoCorrectImageData, enhanceElement, restore });
  if (typeof self !== 'undefined') self.ReaderImageEnhancement = api;
  if (typeof window !== 'undefined') window.ReaderImageEnhancement = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
