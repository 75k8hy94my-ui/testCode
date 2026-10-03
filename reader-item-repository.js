(() => {
  'use strict';

  function create(dependencies = {}) {
    for (const key of ['readItems', 'writeItems', 'scheduleSync']) {
      if (typeof dependencies[key] !== 'function') throw new TypeError(`reader item repository requires ${key}`);
    }

    function readItems() {
      const items = dependencies.readItems();
      return Array.isArray(items) ? items : [];
    }

    function persist(items) {
      if (dependencies.writeItems(items) === false) throw new Error('saved items could not be persisted');
      dependencies.scheduleSync();
    }

    function loadItem(itemId) {
      const id = String(itemId == null ? '' : itemId).trim();
      if (!id) return null;
      return readItems().find((item) => item && String(item.id) === id) || null;
    }

    function saveItem(item) {
      if (!item || typeof item !== 'object' || !String(item.id == null ? '' : item.id).trim()) {
        throw new TypeError('reader item id is required');
      }
      const id = String(item.id);
      const items = readItems();
      const index = items.findIndex((entry) => entry && String(entry.id) === id);
      const next = items.slice();
      if (index < 0) next.push(item);
      else next[index] = item;
      persist(next);
      return item;
    }

    function updateItem(itemId, patch = {}) {
      const id = String(itemId == null ? '' : itemId).trim();
      if (!id) return null;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('reader item patch must be an object');
      if (Object.prototype.hasOwnProperty.call(patch, 'id') && String(patch.id) !== id) {
        throw new Error('reader item identity cannot be changed');
      }
      const items = readItems();
      const index = items.findIndex((entry) => entry && String(entry.id) === id);
      if (index < 0) return null;
      const updated = { ...items[index], ...patch, id: items[index].id };
      const next = items.slice();
      next[index] = updated;
      persist(next);
      return updated;
    }

    function findNextVolume(item) {
      if (!item || !item.series || !Number.isFinite(Number(item.volume))) return null;
      const currentVolume = Number(item.volume);
      return readItems()
        .filter((entry) => entry && String(entry.id) !== String(item.id) && entry.series === item.series && Number.isFinite(Number(entry.volume)) && Number(entry.volume) > currentVolume)
        .sort((left, right) => Number(left.volume) - Number(right.volume))[0] || null;
    }

    return Object.freeze({ loadItem, saveItem, updateItem, findNextVolume, scheduleSync: dependencies.scheduleSync });
  }

  const api = Object.freeze({ create });
  if (typeof self !== 'undefined') self.ReaderItemRepositoryFactory = api;
  if (typeof window !== 'undefined') window.ReaderItemRepositoryFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
