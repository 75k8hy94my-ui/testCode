import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dashboard from '../home-dashboard.js';
import payload from '../vault-payload.js';
import backup from '../backup-format.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('home dashboard exposes roppo as a default internal card', () => {
  assert.ok(dashboard.DEFAULT_CARD_IDS.includes('roppo'));
  assert.equal(dashboard.CARD_CATALOG.roppo.href, 'roppo.html');
  assert.equal(dashboard.CARD_CATALOG.roppo.kind, 'internal');
});

test('vault payload round-trips encrypted roppo private state through local storage', () => {
  const storage = new Map();
  storage.set('mangaReaderRoppoState', JSON.stringify({
    schemaVersion: 1,
    notes: { '129AC0000000089|Article_90': { text: '公序良俗メモ', updatedAt: '2026-09-04T09:00:00.000Z' } },
    favorites: ['129AC0000000089|Article_90'],
    recent: [],
    preferences: { selectedGroup: 'civil-law', selectedLawId: '129AC0000000089' }
  }));
  assert.equal(payload.DATA_KEYS.roppoState, 'mangaReaderRoppoState');
  const built = payload.buildFromLocalStorage(storage);
  assert.equal(built.roppoState.notes['129AC0000000089|Article_90'].text, '公序良俗メモ');
  const target = new Map();
  payload.applyToLocalStorage(built, target);
  assert.equal(JSON.parse(target.get('mangaReaderRoppoState')).favorites[0], '129AC0000000089|Article_90');
});

test('portable backup preserves normalized roppo state', () => {
  const normalized = backup.normalizeData({
    roppoState: {
      schemaVersion: 1,
      notes: { '417AC0000000086|Article_1': { text: '会社法メモ', updatedAt: '2026-09-04T09:00:00.000Z' } },
      favorites: ['417AC0000000086|Article_1'], recent: [], preferences: {}
    }
  });
  assert.equal(normalized.roppoState.notes['417AC0000000086|Article_1'].text, '会社法メモ');
});

test('roppo page is vault gated, reads repository JSON, and syncs private paragraph notes', () => {
  const source = read('roppo.html');
  assert.match(source, /class=["']auth-pending["']/);
  assert.match(source, /MangaVault\.loadActive\(\)/);
  assert.match(source, /roppo-data\.js/);
  assert.match(source, /vault-payload\.js/);
  assert.match(source, /data\/roppo\/metadata\.json/);
  assert.match(source, /data\/roppo\/\$\{encodeURIComponent\(meta\.id\)\}\.json/);
  assert.doesNotMatch(source, /laws\.e-gov\.go\.jp\/api\/1\/lawdata\//);
  assert.match(source, /MangaVault\.savePayload/);
  assert.match(source, /paragraphStorageKey/);
  assert.match(source, /項のメモ/);
  assert.match(source, /id=["']roppoSearch["']/);
  assert.match(source, /id=["']favoriteBtn["']/);
  assert.match(source, /lastSyncedAt/);
});

test('clearing roppo search keeps the article selected from search results', () => {
  const source = read('roppo.html');
  assert.match(source, /currentArticleKey/);
  assert.match(source, /currentArticleKey=article\.key/);
  assert.match(source, /const selectedKey=currentArticleKey/);
  assert.match(source, /visibleArticles\.findIndex\([^)]*\.key===selectedKey\)/);
});

test('clearing roppo search scrolls the retained article into view in the article list', () => {
  const source = read('roppo.html');
  assert.match(source, /scrollSelectedArticleIntoView/);
  assert.match(source, /querySelector\(['"]\.articleItem\.active['"]\)/);
  assert.match(source, /scrollIntoView\(\{block:['"]center['"],inline:['"]nearest['"]\}\)/);
});

test('mobile roppo search prioritizes the results list and returns to the selected statute on tap', () => {
  const source = read('roppo.html');
  assert.match(source, /mobile-searching/);
  assert.match(source, /body\.mobile-searching/);
  assert.match(source, /classList\.toggle\(['"]mobile-searching['"]/);
  assert.match(source, /classList\.remove\(['"]mobile-searching['"]\)/);
  assert.match(source, /scrollIntoView\(\{behavior:['"]smooth['"],block:['"]start['"]\}\)/);
});

test('roppo refresh action is manual-only and keeps the one-month check inside the sync script', () => {
  const source = read('.github/workflows/roppo-sync.yml');
  assert.match(source, /workflow_dispatch/);
  assert.doesNotMatch(source, /schedule\s*:/);
  assert.doesNotMatch(source, /\n\s*push\s*:/);
  assert.match(source, /scripts\/sync_roppo\.py/);
  const script = read('scripts/sync_roppo.py');
  assert.match(script, /is_stale/);
  assert.match(script, /if not force and not is_stale/);
});

test('static verifier includes roppo page and module', () => {
  const source = read('scripts/check-static.mjs');
  assert.match(source, /['"]roppo\.html['"]/);
  assert.match(source, /['"]roppo-data\.js['"]/);
});
