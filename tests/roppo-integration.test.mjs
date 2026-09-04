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
    schemaVersion: 2,
    notes: { '129AC0000000089|Article_90|1': { text: '公序良俗メモ', updatedAt: '2026-09-04T09:00:00.000Z' } },
    favorites: ['129AC0000000089|Article_90'],
    recent: [],
    preferences: { selectedGroup: 'civil-law', selectedLawId: '129AC0000000089' }
  }));
  assert.equal(payload.DATA_KEYS.roppoState, 'mangaReaderRoppoState');
  const built = payload.buildFromLocalStorage(storage);
  assert.equal(built.roppoState.notes['129AC0000000089|Article_90|1'].text, '公序良俗メモ');
  const target = new Map();
  payload.applyToLocalStorage(built, target);
  assert.equal(JSON.parse(target.get('mangaReaderRoppoState')).favorites[0], '129AC0000000089|Article_90');
});

test('portable backup preserves paragraph-scoped roppo state', () => {
  const normalized = backup.normalizeData({
    roppoState: {
      schemaVersion: 2,
      notes: { '417AC0000000086|Article_1|1': { text: '会社法メモ', updatedAt: '2026-09-04T09:00:00.000Z' } },
      favorites: ['417AC0000000086|Article_1'], recent: [], preferences: {}
    }
  });
  assert.equal(normalized.roppoState.notes['417AC0000000086|Article_1|1'].text, '会社法メモ');
});

test('roppo page is vault gated, reads repository JSON, and supports paragraph memos', () => {
  const source = read('roppo.html');
  assert.match(source, /class=["']auth-pending["']/);
  assert.match(source, /MangaVault\.loadActive\(\)/);
  assert.match(source, /roppo-data\.js/);
  assert.match(source, /vault-payload\.js/);
  assert.match(source, /data\/roppo\/metadata\.json/);
  assert.match(source, /data\/roppo\/\$\{encodeURIComponent\(meta\.id\)\}\.json/);
  assert.doesNotMatch(source, /laws\.e-gov\.go\.jp\/api\/(?:1|2)\//);
  assert.match(source, /paragraphStorageKey/);
  assert.match(source, /paragraphBlock/);
  assert.match(source, /MangaVault\.savePayload/);
  assert.match(source, /id=["']roppoSearch["']/);
  assert.match(source, /id=["']favoriteBtn["']/);
  assert.match(source, /法令データ更新推奨/);
});

test('manual roppo sync workflow has no schedule trigger', () => {
  const source = read('.github/workflows/sync-roppo.yml');
  assert.match(source, /workflow_dispatch/);
  assert.doesNotMatch(source, /schedule\s*:/);
  assert.match(source, /scripts\/sync-roppo-data\.mjs/);
});

test('static verifier includes roppo page, module, metadata, and sync assets', () => {
  const source = read('scripts/check-static.mjs');
  assert.match(source, /['"]roppo\.html['"]/);
  assert.match(source, /['"]roppo-data\.js['"]/);
  assert.match(source, /data\/roppo\/metadata\.json/);
  assert.match(source, /scripts\/sync-roppo-data\.mjs/);
  assert.match(source, /\.github\/workflows\/sync-roppo\.yml/);
});
