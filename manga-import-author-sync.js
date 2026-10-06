(function (root) {
  'use strict';
  function synchronize({ savedItems, authorCards, createId, now }) {
    const cards = authorCards.map(card => ({ ...card, links: Array.isArray(card.links) ? [...card.links] : card.links }));
    let changed = false;
    for (const item of savedItems) {
      const name = String(item.author || '').trim();
      if (!name) continue;
      const existing = cards.find(card => card.name === name || card.circleName === name);
      if (existing) {
        if (existing.name === name && !String(existing.circleName || '').trim() && String(item.circleName || '').trim()) {
          existing.circleName = item.circleName; changed = true;
        }
        continue;
      }
      cards.push({ id: createId(), name, circleName: item.circleName || '', links: [], createdAt: now() });
      changed = true;
    }
    return { authorCards: cards, changed };
  }
  root.MangaImportAuthorSync = Object.freeze({ synchronize });
})(typeof self !== 'undefined' ? self : globalThis);
