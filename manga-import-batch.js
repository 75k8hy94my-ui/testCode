(function (root) {
  'use strict';
  function create({ getState, setState, validator, candidateFactory, authorSync, persistItems, persistAuthorCards, render, createId, now }) {
    return {
      register({ items, explicitDuplicateIds = [] }) {
        if (!Array.isArray(items) || items.length > 500 || !Array.isArray(explicitDuplicateIds) || explicitDuplicateIds.some(id => typeof id !== 'string')) return { ok: false, errors: ['Invalid selection'] };
        const ids = new Set();
        for (const item of items) {
          if (!item || typeof item.queueId !== 'string' || !item.queueId || item.queueId.length > 128 || ids.has(item.queueId)) return { ok: false, errors: ['Invalid queue ID'] };
          ids.add(item.queueId);
        }
        if (explicitDuplicateIds.some(id => !ids.has(id))) return { ok: false, errors: ['Invalid duplicate override'] };
        const checked = validator.validateBatch(items.map(item => item.candidate));
        if (!checked.ok) return { ok: false, errors: checked.errors };
        const state = getState();
        const overrides = new Set(explicitDuplicateIds);
        const additions = []; const registeredQueueIds = []; const skippedQueueIds = [];
        for (let index = 0; index < items.length; index += 1) {
          const candidate = checked.candidates[index];
          if (!overrides.has(items[index].queueId) && candidateFactory.findDuplicate(candidate, [...state.savedItems, ...additions]).duplicate) {
            skippedQueueIds.push(items[index].queueId); continue;
          }
          additions.push(candidateFactory.createSavedItem(candidate, { id: createId(), addedAt: now() }));
          registeredQueueIds.push(items[index].queueId);
        }
        if (!additions.length) return { ok: true, registeredQueueIds, skippedQueueIds, savedItems: state.savedItems, authorCards: state.authorCards };
        const savedItems = [...state.savedItems, ...additions];
        const synced = authorSync.synchronize({ savedItems, authorCards: state.authorCards, createId, now });
        setState({ ...state, savedItems, authorCards: synced.authorCards });
        persistItems();
        if (synced.changed) persistAuthorCards();
        render();
        return { ok: true, registeredQueueIds, skippedQueueIds, savedItems, authorCards: synced.authorCards };
      }
    };
  }
  root.MangaImportBatch = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : globalThis);
