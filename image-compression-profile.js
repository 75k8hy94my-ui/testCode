(() => {
  'use strict';

  const PROFILE_VERSION = 1;
  const DEFAULT_PROFILE = Object.freeze({
    version: PROFILE_VERSION,
    preview: Object.freeze({
      maxLongEdge: 1440,
      mimeType: 'image/webp',
      initialQuality: 0.64,
      preferredQuality: 0.60,
      fallbackQuality: 0.56,
      minimumQuality: 0.54,
      targetBytes: 400 * 1024,
      fallbackLongEdge: 1280
    }),
    zoom: Object.freeze({
      mimeType: 'image/webp',
      quality: 0.88,
      tileSize: 512,
      intermediateLongEdge: 2048,
      maximumLongEdge: 4096
    })
  });

  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const copy = value => JSON.parse(JSON.stringify(value));

  function assertPositiveInteger(value, path) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${path} must be a positive integer`);
  }

  function assertQuality(value, path) {
    if (typeof value !== 'number' || value < 0 || value > 1) throw new Error(`${path} must be between 0 and 1`);
  }

  function normalizeCompressionProfile(value = DEFAULT_PROFILE) {
    if (!isObject(value)) throw new Error('profile must be an object');
    if (Number(value.version) !== PROFILE_VERSION) throw new Error(`profile version must be ${PROFILE_VERSION}`);
    if (!isObject(value.preview)) throw new Error('preview must be an object');
    if (!isObject(value.zoom)) throw new Error('zoom must be an object');

    const preview = {
      maxLongEdge: Number(value.preview.maxLongEdge),
      mimeType: String(value.preview.mimeType || ''),
      initialQuality: Number(value.preview.initialQuality),
      preferredQuality: Number(value.preview.preferredQuality),
      fallbackQuality: Number(value.preview.fallbackQuality),
      minimumQuality: Number(value.preview.minimumQuality),
      targetBytes: Number(value.preview.targetBytes),
      fallbackLongEdge: Number(value.preview.fallbackLongEdge)
    };
    const zoom = {
      mimeType: String(value.zoom.mimeType || ''),
      quality: Number(value.zoom.quality),
      tileSize: Number(value.zoom.tileSize),
      intermediateLongEdge: Number(value.zoom.intermediateLongEdge),
      maximumLongEdge: Number(value.zoom.maximumLongEdge)
    };

    assertPositiveInteger(preview.maxLongEdge, 'preview.maxLongEdge');
    assertPositiveInteger(preview.targetBytes, 'preview.targetBytes');
    assertPositiveInteger(preview.fallbackLongEdge, 'preview.fallbackLongEdge');
    assertQuality(preview.initialQuality, 'preview.initialQuality');
    assertQuality(preview.preferredQuality, 'preview.preferredQuality');
    assertQuality(preview.fallbackQuality, 'preview.fallbackQuality');
    assertQuality(preview.minimumQuality, 'preview.minimumQuality');
    if (preview.initialQuality < preview.preferredQuality || preview.preferredQuality < preview.fallbackQuality || preview.fallbackQuality < preview.minimumQuality) {
      throw new Error('preview quality values must be descending');
    }
    if (!preview.mimeType) throw new Error('preview.mimeType is required');
    assertPositiveInteger(zoom.tileSize, 'zoom.tileSize');
    assertPositiveInteger(zoom.intermediateLongEdge, 'zoom.intermediateLongEdge');
    assertPositiveInteger(zoom.maximumLongEdge, 'zoom.maximumLongEdge');
    assertQuality(zoom.quality, 'zoom.quality');
    if (!zoom.mimeType) throw new Error('zoom.mimeType is required');
    if (zoom.intermediateLongEdge > zoom.maximumLongEdge) throw new Error('zoom intermediateLongEdge exceeds maximumLongEdge');

    return Object.freeze({ version: PROFILE_VERSION, preview: Object.freeze(preview), zoom: Object.freeze(zoom) });
  }

  function getCompressionProfile() {
    return copy(DEFAULT_PROFILE);
  }

  const api = { PROFILE_VERSION, getCompressionProfile, normalizeCompressionProfile };
  const host = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null);
  if (host) host.ImageCompressionProfile = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
