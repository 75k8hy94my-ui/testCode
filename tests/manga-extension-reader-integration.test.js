const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const bridgeSource = fs.readFileSync(new URL('../manga-extension-bridge.js', import.meta.url), 'utf8');
const bridge = require('../manga-extension-bridge.js');

test('bridge no longer depends on reader IIFE locals', () => {
  assert.doesNotMatch(bridgeSource, /typeof savedItems === 'undefined'/);
  assert.doesNotMatch(bridgeSource, /getSavedItems:\s*\(\)\s*=>\s*savedItems/);
});

test('storage-backed page deps persist added items and schedule cloud save', () => {
  const data = new Map([['mangaReaderSavedItems', JSON.stringify([{ id:'old', url:'https://x/old.jpg' }])]]);
  const storage = {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value))
  };
  let cloudSaves = 0;
  let reloads = 0;
  const root = {
    localStorage: storage,
    MangaVault: { loadActive: () => ({ key:'ready' }), savePayload: () => { cloudSaves += 1; return Promise.resolve(); } },
    MangaVaultPayload: { buildFromLocalStorage: () => ({ items:'payload' }) },
    location: { reload: () => { reloads += 1; } },
    setTimeout: (fn) => { fn(); return 1; }
  };
  const deps = bridge.makePageDeps(root);
  const items = deps.getSavedItems();
  items.unshift({ id:'new', url:'https://x/new.jpg' });
  deps.persistItems();
  deps.afterAdded();
  assert.equal(JSON.parse(data.get('mangaReaderSavedItems'))[0].id, 'new');
  assert.equal(cloudSaves, 1);
  assert.equal(reloads, 1);
  assert.equal(deps.isVaultReady(), true);
});
