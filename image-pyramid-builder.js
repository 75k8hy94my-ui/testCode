(() => {
  'use strict';

  const profileApi = typeof require === 'function'
    ? require('./image-compression-profile.js')
    : ((typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null))?.ImageCompressionProfile || null);
  if (!profileApi) throw new Error('ImageCompressionProfile is required');

  const { getCompressionProfile, normalizeCompressionProfile } = profileApi;
  const positiveInteger = (value, path) => {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${path} must be a positive integer`);
    return value;
  };

  function calculateScaledDimensions(width, height, maxLongEdge) {
    const sourceWidth = positiveInteger(Number(width), 'width');
    const sourceHeight = positiveInteger(Number(height), 'height');
    const limit = positiveInteger(Number(maxLongEdge), 'maxLongEdge');
    const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
    const scale = Math.min(1, limit / sourceLongEdge);
    const scaledWidth = Math.max(1, Math.round(sourceWidth * scale));
    const scaledHeight = Math.max(1, Math.round(sourceHeight * scale));
    return { width: scaledWidth, height: scaledHeight, longEdge: Math.max(scaledWidth, scaledHeight) };
  }

  function planZoomLevels(width, height, profile = getCompressionProfile()) {
    const normalized = normalizeCompressionProfile(profile);
    const sourceWidth = positiveInteger(Number(width), 'width');
    const sourceHeight = positiveInteger(Number(height), 'height');
    const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
    if (sourceLongEdge <= normalized.preview.maxLongEdge) return [];
    const maximumLongEdge = Math.min(sourceLongEdge, normalized.zoom.maximumLongEdge);
    const targets = [normalized.zoom.intermediateLongEdge, maximumLongEdge]
      .filter(target => target <= sourceLongEdge)
      .filter((target, index, all) => all.indexOf(target) === index)
      .sort((a, b) => a - b);
    return targets.map((target, level) => ({
      level,
      ...calculateScaledDimensions(sourceWidth, sourceHeight, target),
      longEdge: target === sourceLongEdge ? sourceLongEdge : target
    }));
  }

  function calculateTileGrid(width, height, tileSize) {
    const normalizedWidth = positiveInteger(Number(width), 'width');
    const normalizedHeight = positiveInteger(Number(height), 'height');
    const normalizedTileSize = positiveInteger(Number(tileSize), 'tileSize');
    return {
      columns: Math.ceil(normalizedWidth / normalizedTileSize),
      rows: Math.ceil(normalizedHeight / normalizedTileSize)
    };
  }

  function calculateTileRect(levelWidth, levelHeight, x, y, tileSize) {
    const width = positiveInteger(Number(levelWidth), 'levelWidth');
    const height = positiveInteger(Number(levelHeight), 'levelHeight');
    const size = positiveInteger(Number(tileSize), 'tileSize');
    const tileX = positiveInteger(Number(x) + 1, 'x') - 1;
    const tileY = positiveInteger(Number(y) + 1, 'y') - 1;
    const pixelX = tileX * size;
    const pixelY = tileY * size;
    if (pixelX >= width || pixelY >= height) throw new Error('tile index is outside the level');
    return { pixelX, pixelY, width: Math.min(size, width - pixelX), height: Math.min(size, height - pixelY) };
  }

  function buildManifestMetadata({ source, preview, levels }, profile = getCompressionProfile()) {
    const normalized = normalizeCompressionProfile(profile);
    const clone = value => JSON.parse(JSON.stringify(value));
    return {
      schemaVersion: 1,
      compressionProfileVersion: normalized.version,
      source: clone(source),
      preview: clone(preview),
      zoom: { tileSize: normalized.zoom.tileSize, levels: clone(levels) }
    };
  }

  const api = { calculateScaledDimensions, planZoomLevels, calculateTileGrid, calculateTileRect, buildManifestMetadata };
  const host = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null);
  if (host) host.ImagePyramidBuilder = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
