import test from 'node:test';
import assert from 'node:assert/strict';
import payload from '../vault-payload.js';
import home from '../home-dashboard.js';

test('statute notes are part of encrypted vault payload and device clearing', () => {
  const notes = { 'civil:709': '不法行為の一般条項' };
  const storage = new Map([[payload.DATA_KEYS.statuteNotes, JSON.stringify(notes)]]);
  assert.equal(payload.DATA_KEYS.statuteNotes, 'mangaReaderStatuteNotes');
  assert.deepEqual(payload.buildFromLocalStorage(storage).statuteNotes, notes);
  payload.clearDeviceData(storage);
  assert.equal(storage.has('mangaReaderStatuteNotes'), false);
});

test('home dashboard exposes statutes as a default internal card', () => {
  assert.ok(home.DEFAULT_CARD_IDS.includes('statutes'));
  assert.deepEqual(home.CARD_CATALOG.statutes, {
    id: 'statutes',
    title: '六法',
    subtitle: '主要6法の条文を読み、条文ごとにメモする',
    kind: 'internal',
    href: 'statutes.html',
    badge: 'LAW'
  });
});
