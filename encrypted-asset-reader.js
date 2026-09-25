(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EncryptedAssetReader = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const sync = typeof require === 'function' ? require('./encrypted-asset-sync.js') : root.EncryptedAssetSync;
  const settings = typeof require === 'function' ? require('./image-transfer-settings.js') : root.ImageTransferSettings;
  const remoteAccess = typeof require === 'function' ? require('./image-remote-access.js') : root.ImageRemoteAccess;
  const cryptoApi = typeof require === 'function' ? require('./encrypted-asset-crypto.js') : root.EncryptedAssetCrypto;
  const MIN_SCALE = 1;
  const MAX_SCALE = 4;
  const ZOOM_SETTLE_MS = 180;
  const MAX_TILE_CONCURRENCY = 4;

  function positive(value, name) { if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`); return value; }
  function finitePositive(value, name) { if (!Number.isFinite(Number(value)) || Number(value) <= 0) throw new TypeError(`${name} must be positive`); return Number(value); }
  function validateManifest(manifest) {
    if (!manifest || manifest.schemaVersion !== 1 || manifest.compressionProfileVersion !== 1) throw new TypeError('manifest version is invalid');
    const preview = manifest.preview;
    if (!preview || !Number.isInteger(preview.width) || preview.width < 1 || !Number.isInteger(preview.height) || preview.height < 1 || typeof preview.mimeType !== 'string' || !Number.isInteger(preview.bytes) || preview.bytes < 1) throw new TypeError('preview metadata is invalid');
    const zoom = manifest.zoom;
    if (!zoom || !Number.isInteger(zoom.tileSize) || zoom.tileSize < 1 || !Array.isArray(zoom.levels)) throw new TypeError('zoom metadata is invalid');
    const seenLevels = new Set();
    for (const level of zoom.levels) {
      if (!Number.isInteger(level.level) || level.level < 0) throw new TypeError('level must be a non-negative integer'); finitePositive(level.width, 'level width'); finitePositive(level.height, 'level height');
      if (seenLevels.has(level.level) || !Number.isInteger(level.columns) || !Number.isInteger(level.rows) || level.columns < 1 || level.rows < 1 || !Array.isArray(level.tiles)) throw new TypeError('level metadata is invalid');
      seenLevels.add(level.level); const seenTiles = new Set();
      for (const tile of level.tiles) {
        if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y) || tile.x < 0 || tile.y < 0 || tile.x >= level.columns || tile.y >= level.rows || !Number.isInteger(tile.pixelX) || !Number.isInteger(tile.pixelY) || !Number.isInteger(tile.width) || tile.width < 1 || !Number.isInteger(tile.height) || tile.height < 1 || tile.pixelX < 0 || tile.pixelY < 0 || tile.pixelX + tile.width > level.width || tile.pixelY + tile.height > level.height || !Number.isInteger(tile.bytes) || tile.bytes < 1 || typeof tile.mimeType !== 'string') throw new TypeError('tile metadata is invalid');
        const key = `${tile.x}:${tile.y}`; if (seenTiles.has(key)) throw new TypeError('duplicate tile coordinate'); seenTiles.add(key);
      }
    }
    return manifest;
  }
  function calculateContainRect({ containerWidth, containerHeight, imageWidth, imageHeight }) {
    finitePositive(containerWidth, 'containerWidth'); finitePositive(containerHeight, 'containerHeight'); finitePositive(imageWidth, 'imageWidth'); finitePositive(imageHeight, 'imageHeight');
    const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight); const width = imageWidth * scale; const height = imageHeight * scale;
    return { width, height, left: (containerWidth - width) / 2, top: (containerHeight - height) / 2 };
  }
  function clampTransform({ scale, translateX, translateY, containerWidth, containerHeight, imageWidth, imageHeight }) {
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(scale) || MIN_SCALE));
    if (nextScale === 1) return { scale: 1, translateX: 0, translateY: 0 };
    const extraX = Math.max(0, imageWidth * nextScale - containerWidth) / 2;
    const extraY = Math.max(0, imageHeight * nextScale - containerHeight) / 2;
    return { scale: nextScale, translateX: Math.max(-extraX, Math.min(extraX, Number(translateX) || 0)), translateY: Math.max(-extraY, Math.min(extraY, Number(translateY) || 0)) };
  }
  function calculateVisibleRect({ scale, translateX, translateY, containerWidth, containerHeight, imageWidth, imageHeight }) {
    const x0 = (0 - (containerWidth - imageWidth * scale) / 2 - translateX) / (imageWidth * scale);
    const y0 = (0 - (containerHeight - imageHeight * scale) / 2 - translateY) / (imageHeight * scale);
    const x1 = (containerWidth - (containerWidth - imageWidth * scale) / 2 - translateX) / (imageWidth * scale);
    const y1 = (containerHeight - (containerHeight - imageHeight * scale) / 2 - translateY) / (imageHeight * scale);
    return { x0: Math.max(0, Math.min(1, x0)), y0: Math.max(0, Math.min(1, y0)), x1: Math.max(0, Math.min(1, x1)), y1: Math.max(0, Math.min(1, y1)) };
  }
  function selectZoomLevel({ manifest, scale, renderedWidth, renderedHeight, devicePixelRatio = 1 }) {
    validateManifest(manifest); if (!manifest.zoom.levels.length || Number(scale) <= 1) return null;
    const required = Math.max(renderedWidth, renderedHeight) * Number(scale) * (Number(devicePixelRatio) || 1);
    return [...manifest.zoom.levels].sort((a, b) => a.longEdge - b.longEdge).find((level) => level.longEdge >= required) || [...manifest.zoom.levels].sort((a, b) => a.longEdge - b.longEdge).at(-1);
  }
  function selectVisibleTiles(level, visibleRect) { return level.tiles.filter((tile) => { const x0 = tile.pixelX / level.width; const y0 = tile.pixelY / level.height; const x1 = (tile.pixelX + tile.width) / level.width; const y1 = (tile.pixelY + tile.height) / level.height; return x0 < visibleRect.x1 && x1 > visibleRect.x0 && y0 < visibleRect.y1 && y1 > visibleRect.y0; }); }
  function selectTileRing(level, visibleTiles, radius = 1) { const visible = new Set(visibleTiles.map((tile) => `${tile.x}:${tile.y}`)); const result = []; const bounds = new Set(); for (const tile of visibleTiles) for (let y = Math.max(0, tile.y - radius); y <= Math.min(level.rows - 1, tile.y + radius); y += 1) for (let x = Math.max(0, tile.x - radius); x <= Math.min(level.columns - 1, tile.x + radius); x += 1) bounds.add(`${x}:${y}`); for (const tile of level.tiles) if (bounds.has(`${tile.x}:${tile.y}`) && !visible.has(`${tile.x}:${tile.y}`)) result.push(tile); return result; }

  function createEncryptedAssetReader(options = {}) {
    validateManifest(options.manifest);
    if (!options.container) throw new TypeError('container is required');
    const manifest = options.manifest; const container = options.container; const objectUrls = new Set(); const loadedTiles = new Set(); const inFlightTiles = new Map(); const prefetchInFlight = new Set(); const controllers = new Map();
    const syncImpl = options.sync || sync; const settingsImpl = options.settings || settings; const remoteAccessImpl = options.remoteAccess || remoteAccess; const cryptoImpl = options.crypto || cryptoApi; const savedPrefetchObjectIds = new Set();
    let state = { scale: 1, translateX: 0, translateY: 0 }; let mounted = false; let destroyed = false; let generation = 0; let selectedLevel = null; let settleTimer = null; let previewUrl = null; let resizeObserver = null; let active = 0; const queue = [];
    const viewport = root.document?.createElement ? root.document.createElement('div') : { style: {}, appendChild() {}, addEventListener() {}, removeEventListener() {} }; const content = root.document?.createElement ? root.document.createElement('div') : { style: {}, appendChild() {}, addEventListener() {}, removeEventListener() {} }; const preview = root.document?.createElement ? root.document.createElement('img') : { style: {}, className: '' }; const tileLayer = root.document?.createElement ? root.document.createElement('div') : { style: {}, appendChild() {} };
    viewport.className = 'encryptedAssetViewport'; content.className = 'encryptedAssetContent'; preview.className = 'encryptedAssetPreview'; tileLayer.className = 'encryptedAssetTiles'; content.appendChild(preview); content.appendChild(tileLayer); viewport.appendChild(content);
    function dimensions() { const width = container.clientWidth || container.offsetWidth || 1; const height = container.clientHeight || container.offsetHeight || 1; return { width, height }; }
    function layout() { const size = dimensions(); const rect = calculateContainRect({ containerWidth: size.width, containerHeight: size.height, imageWidth: manifest.preview.width, imageHeight: manifest.preview.height }); content.style.width = `${rect.width}px`; content.style.height = `${rect.height}px`; content.style.left = `${rect.left}px`; content.style.top = `${rect.top}px`; content.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`; }
    function releaseUrl(url) { if (!url) return; objectUrls.delete(url); if (root.URL?.revokeObjectURL) root.URL.revokeObjectURL(url); }
    function clearTiles() { while (tileLayer.firstChild) tileLayer.removeChild(tileLayer.firstChild); for (const url of [...objectUrls]) if (url !== previewUrl) releaseUrl(url); loadedTiles.clear(); }
    async function loadPreview() { const bytes = await syncImpl.loadDecryptedObject({ ...options, objectId: 'preview', estimatedBytes: cryptoImpl.encryptedAssetByteLength(manifest.preview.bytes) }); if (destroyed || !bytes) return; const blob = new Blob([bytes], { type: manifest.preview.mimeType }); previewUrl = root.URL?.createObjectURL ? root.URL.createObjectURL(blob) : null; if (previewUrl) { objectUrls.add(previewUrl); preview.src = previewUrl; } }
    function key(tile) { return `${options.assetId}:${options.revision}:L${selectedLevel.level}:${tile.x}:${tile.y}`; }
    function enqueue(tile, prefetch, currentGeneration) { const id = key(tile); if (loadedTiles.has(id) || inFlightTiles.has(id) || (prefetch && prefetchInFlight.has(id))) return; const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null; controllers.set(id, { controller, generation: currentGeneration, prefetch }); if (prefetch) prefetchInFlight.add(id); inFlightTiles.set(id, { prefetch }); queue.push({ tile, id, prefetch, generation: currentGeneration, controller }); pump(); }
    async function run(request) { active += 1; try { const id = cryptoImpl.tileObjectId(selectedLevel.level, request.tile.x, request.tile.y); const args = { ...options, objectId: id, estimatedBytes: cryptoImpl.encryptedAssetByteLength(request.tile.bytes), signal: request.controller?.signal }; const bytes = request.prefetch ? await syncImpl.loadEncryptedObject(args) : await syncImpl.loadDecryptedObject(args); if (!request.prefetch && !destroyed && request.generation === generation && selectedLevel && request.tile) { const blob = new Blob([bytes], { type: request.tile.mimeType }); const url = root.URL?.createObjectURL ? root.URL.createObjectURL(blob) : null; if (url) { objectUrls.add(url); const image = root.document.createElement('img'); image.className = 'encryptedAssetTile'; image.src = url; image.style.left = `${request.tile.pixelX / selectedLevel.width * 100}%`; image.style.top = `${request.tile.pixelY / selectedLevel.height * 100}%`; image.style.width = `${request.tile.width / selectedLevel.width * 100}%`; image.style.height = `${request.tile.height / selectedLevel.height * 100}%`; tileLayer.appendChild(image); } loadedTiles.add(request.id); } else if (request.prefetch) loadedTiles.add(request.id); } catch (error) { if (typeof options.onTileError === 'function' && !destroyed) options.onTileError(error, request.tile); } finally { inFlightTiles.delete(request.id); prefetchInFlight.delete(request.id); controllers.delete(request.id); active -= 1; pump(); } }
    function pump() { while (active < MAX_TILE_CONCURRENCY && queue.length) run(queue.shift()); }
    function abortStale() { generation += 1; for (const [id, entry] of controllers) if (!id.startsWith(`${options.assetId}:${options.revision}:L${selectedLevel?.level}:`)) { try { entry.controller?.abort(); } catch (_) {} } for (let i = queue.length - 1; i >= 0; i -= 1) if (!queue[i].id.startsWith(`${options.assetId}:${options.revision}:L${selectedLevel?.level}:`)) queue.splice(i, 1); }
    function refresh() { if (!mounted || destroyed) return; layout(); if (state.scale <= 1 || !manifest.zoom.levels.length) { selectedLevel = null; clearTiles(); return; } const size = dimensions(); const rect = calculateContainRect({ containerWidth: size.width, containerHeight: size.height, imageWidth: manifest.preview.width, imageHeight: manifest.preview.height }); const next = selectZoomLevel({ manifest, scale: state.scale, renderedWidth: rect.width, renderedHeight: rect.height, devicePixelRatio: options.devicePixelRatio || root.devicePixelRatio || 1 }); const changed = selectedLevel?.level !== next?.level; selectedLevel = next; if (changed) { clearTiles(); abortStale(); } if (!selectedLevel) return; const visible = calculateVisibleRect({ scale: state.scale, translateX: state.translateX, translateY: state.translateY, containerWidth: size.width, containerHeight: size.height, imageWidth: rect.width, imageHeight: rect.height }); const visibleTiles = selectVisibleTiles(selectedLevel, visible); visibleTiles.forEach((tile) => enqueue(tile, false, generation)); const mode = settingsImpl.load(options.transferStorage).networkMode; if (mode === settingsImpl.STANDARD_NETWORK_MODE) selectTileRing(selectedLevel, visibleTiles, 1).forEach((tile) => enqueue(tile, true, generation)); else { for (const tile of selectTileRing(selectedLevel, visibleTiles, 1)) { const id = key(tile); if (!loadedTiles.has(id) && !savedPrefetchObjectIds.has(id)) { savedPrefetchObjectIds.add(id); remoteAccessImpl.recordPartialSavings(cryptoImpl.encryptedAssetByteLength(tile.bytes), { storage: options.transferStorage }); } } } }
    function scheduleRefresh() { if (settleTimer) root.clearTimeout?.(settleTimer); if (settingsImpl.load(options.transferStorage).networkMode === settingsImpl.SAVER_NETWORK_MODE) settleTimer = root.setTimeout(() => { settleTimer = null; refresh(); }, ZOOM_SETTLE_MS); else refresh(); }
    function setScale(scale) { const size = dimensions(); const rect = calculateContainRect({ containerWidth: size.width, containerHeight: size.height, imageWidth: manifest.preview.width, imageHeight: manifest.preview.height }); state = clampTransform({ ...state, scale, containerWidth: size.width, containerHeight: size.height, imageWidth: rect.width, imageHeight: rect.height }); layout(); scheduleRefresh(); }
    function setTransform(transform = {}) { const size = dimensions(); const rect = calculateContainRect({ containerWidth: size.width, containerHeight: size.height, imageWidth: manifest.preview.width, imageHeight: manifest.preview.height }); state = clampTransform({ ...state, ...transform, containerWidth: size.width, containerHeight: size.height, imageWidth: rect.width, imageHeight: rect.height }); layout(); scheduleRefresh(); }
    let pointers = new Map(); let pinch = null; let drag = null;
    function pointerDown(event) { pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.size === 2) { const values = [...pointers.values()]; pinch = { distance: Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y), scale: state.scale }; } else if (state.scale > 1) drag = { x: event.clientX, y: event.clientY, tx: state.translateX, ty: state.translateY }; }
    function pointerMove(event) { if (!pointers.has(event.pointerId)) return; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pinch && pointers.size === 2) { const values = [...pointers.values()]; setScale(pinch.scale * Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y) / pinch.distance); } else if (drag && state.scale > 1) setTransform({ translateX: drag.tx + event.clientX - drag.x, translateY: drag.ty + event.clientY - drag.y }); }
    function pointerUp(event) { pointers.delete(event.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) drag = null; }
    function wheel(event) { if (!(event.ctrlKey || event.metaKey)) return; event.preventDefault(); setScale(state.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15)); }
    function mount() { if (mounted || destroyed) return api; mounted = true; container.appendChild(viewport); viewport.addEventListener('pointerdown', pointerDown); viewport.addEventListener('pointermove', pointerMove); viewport.addEventListener('pointerup', pointerUp); viewport.addEventListener('pointercancel', pointerUp); viewport.addEventListener('wheel', wheel, { passive: false }); if (root.ResizeObserver) { resizeObserver = new root.ResizeObserver(refresh); resizeObserver.observe(container); } layout(); loadPreview().catch((error) => options.onPreviewError?.(error)); return api; }
    function destroy() { if (destroyed) return; destroyed = true; if (settleTimer) root.clearTimeout?.(settleTimer); for (const entry of controllers.values()) try { entry.controller?.abort(); } catch (_) {} queue.length = 0; resizeObserver?.disconnect(); viewport.removeEventListener('pointerdown', pointerDown); viewport.removeEventListener('pointermove', pointerMove); viewport.removeEventListener('pointerup', pointerUp); viewport.removeEventListener('pointercancel', pointerUp); viewport.removeEventListener('wheel', wheel); releaseUrl(previewUrl); for (const url of [...objectUrls]) releaseUrl(url); if (viewport.parentNode) viewport.parentNode.removeChild(viewport); }
    const api = { mount, setScale, setTransform, refresh, getState: () => ({ ...state }), destroy };
    return api;
  }
  return { MIN_SCALE, MAX_SCALE, ZOOM_SETTLE_MS, MAX_TILE_CONCURRENCY, validateManifest, calculateContainRect, clampTransform, calculateVisibleRect, selectZoomLevel, selectVisibleTiles, selectTileRing, createEncryptedAssetReader };
}));
