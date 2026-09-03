(()=>{
'use strict';
function deps(overrides = {}) {
  return {
    cache: overrides.cache || globalThis.EncryptedChunkCache,
    chunkCrypto: overrides.chunkCrypto || globalThis.EncryptedChunkCrypto,
    schema: overrides.schema || globalThis.LegalIndexSchema,
    sync: overrides.sync || globalThis.EncryptedChunkSync,
    idFactory: overrides.idFactory || (() => crypto.randomUUID())
  };
}
function portableBook(data, schema) {
  const normalized = schema.normalizeBook(data);
  return JSON.parse(JSON.stringify(normalized));
}
async function exportBooks(masterKeyBytes, overrides = {}) {
  const { cache, chunkCrypto, schema } = deps(overrides);
  if (!cache || !chunkCrypto || !schema) throw new Error('索引バックアップ機能を読み込めませんでした。');
  const rows = await cache.list();
  const result = [];
  for (const row of rows) {
    if (!row || row.deletedAt || !row.payload) continue;
    const data = await chunkCrypto.decryptChunk(masterKeyBytes, row.chunkId, row.payload);
    if (!data || data.type !== 'index-book' || data.version !== 1 || data.chunkId !== row.chunkId) continue;
    result.push(portableBook(data, schema));
  }
  return result;
}
async function restoreBooks(masterKeyBytes, books, overrides = {}) {
  const { cache, chunkCrypto, schema, sync, idFactory } = deps(overrides);
  if (!cache || !chunkCrypto || !schema) throw new Error('索引バックアップ機能を読み込めませんでした。');
  const input = Array.isArray(books) ? books : [];
  const valid = [];
  const failures = [];
  input.forEach((book, index) => {
    const checked = schema.validateBookFile(book, { fileName: `indexBooks[${index}]` });
    if (!checked.ok) failures.push({ index, error: checked.error });
    else valid.push({ index, book: checked.book });
  });
  for (const entry of valid) {
    try {
      const bookId = idFactory(), chunkId = idFactory();
      const chunk = schema.createIndexBookChunk(entry.book, { bookId, chunkId });
      const payload = await chunkCrypto.encryptChunk(masterKeyBytes, chunkId, chunk);
      await cache.put({ chunkId, revision: 0, deletedAt: null, updatedAt: new Date().toISOString(), payload, pendingAction: 'insert', baseRevision: null });
    } catch (error) { failures.push({ index: entry.index, error: error?.message || String(error) }); }
  }
  const restored = valid.length - failures.filter((failure) => valid.some((entry) => entry.index === failure.index)).length;
  if (overrides.syncAfter !== false && sync && navigator.onLine) {
    try { await sync.sync(cache, { upload: true }); } catch (_) {}
  }
  return { restored, failures };
}
const api = { exportBooks, restoreBooks };
if (typeof window !== 'undefined') window.LegalIndexBackup = api;
if (typeof module !== 'undefined') module.exports = api;
})();
