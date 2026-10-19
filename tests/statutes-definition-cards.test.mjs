import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const store = require('../statutes-definition-store.js');
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const legacy = { subject:'civil-general', article:'１条', part:0, start:0, end:2, quote:'私権', definition:'私法上の権利', card:false };

test('every definition is a card, including previously unchecked records', () => {
  const values = new Map([[store.STORAGE_KEY, JSON.stringify([legacy])]]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const cards = store.loadDefinitions(storage);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].card, true);
  assert.equal(cards[0].source, '民法１条');
  assert.equal(JSON.parse(values.get(store.STORAGE_KEY))[0].card, true);
});

test('normalization preserves all valid annotations and marks them as cards', () => {
  const next = store.normalizeDefinitions([legacy, { ...legacy, start:3, end:4, card:true }, null, { quote: 'invalid' }]);
  assert.equal(next.length, 2);
  assert.ok(next.every(entry => entry.card === true));
  assert.equal(next[0].definition, '私法上の権利');
});

test('statute-derived definitions save the article wording without a manual answer', () => {
  const source = { subject:'civil-family', article:'７２５条', part:0, start:8, end:10, quote:'親族' };
  const wording = '次に掲げる者は、親族とする。\n一　六親等内の血族\n二　配偶者\n三　三親等内の姻族';
  const entry = store.definitionFromArticle(source, wording);
  assert.equal(entry.definitionKind, 'statute');
  assert.equal(entry.definition, wording);
  assert.equal(entry.source, '民法７２５条');
  assert.equal(entry.card, true);
  assert.equal(store.normalizeDefinitions([entry])[0].definitionKind, 'statute');
  assert.equal(store.definitionFromArticle(source, '   '), null);
});

test('statute-derived edit mode and flashcard labelling are wired', () => {
  const ui = read('statutes-definitions.js');
  const cards = read('definition-cards.js');
  assert.match(ui, /statutesDefinitionStatuteToggle/);
  assert.match(ui, /articleDefinitionText\(pending\)/);
  assert.match(ui, /definitionFromArticle\(pending, text\)/);
  assert.match(ui, /textarea.required = !usesArticle/);
  assert.match(cards, /entry.definitionKind === 'statute'/);
});

test('standalone cards UI replaces statute-header shortcut and its checkbox', () => {
  const statuteUi = read('statutes-definitions.js');
  const page = read('statutes.html');
  const cardPage = read('definition-cards.html');
  const rail = read('app-desktop-rail.js');
  const home = read('home-profile-spa.js');
  assert.doesNotMatch(statuteUi, /statutesCardsOpen|statutesDefinitionCardCheckbox|定義カードにする|cardsButton/);
  assert.match(statuteUi, /enrichDefinition\(\{ \.\.\.pending, definition: text \}\)/);
  assert.match(page, /statutes-definition-store\.js/);
  assert.match(cardPage, /definition-cards\.js/);
  assert.match(cardPage, /id="definitionCardsFlip"/);
  assert.match(rail, /desktopNavDefinitionCards/);
  assert.match(rail, /href: 'definition-cards\.html'/);
  assert.match(home, /class="homeStudyMenu"/);
});

test('definition review history is included in vault payload lifecycle', () => {
  const payload = require('../vault-payload.js');
  const key = 'testCode.statutes.definitionReviews.v1';
  const map = new Map();
  const storage = {
    getItem: k => map.get(k) ?? null,
    setItem: (k,v) => map.set(k,v),
    removeItem: k => map.delete(k),
  };
  const review = { 'civil-general:１条:0:0:2': { ease:2.5, due:1700000000000, lastReviewed:1699999990000, reviews:[] } };
  storage.setItem(key, JSON.stringify(review));
  const snapshot = payload.buildFromLocalStorage(storage);
  assert.deepEqual(snapshot.definitionReviews, review);
  const restored = new Map();
  const target = { getItem:k => restored.get(k) ?? null, setItem:(k,v)=>restored.set(k,v), removeItem:k=>restored.delete(k) };
  payload.applyToLocalStorage(snapshot,target);
  assert.deepEqual(JSON.parse(target.getItem(key)),review);
  payload.clearDeviceData(target);
  assert.equal(target.getItem(key), null);
});

test('definition card scheduling and rating controls are wired', () => {
  const ui = read('definition-cards.js');
  const page = read('definition-cards.html');
  assert.match(ui,/DefinitionFSRS.schedule/);
  assert.match(read('definition-fsrs.js'),/lastReviewed:now/);
  assert.match(ui,/data-grade/);
  assert.match(page,/id="definitionCardsRating"/);
  assert.match(page,/data-grade="0"/);
  assert.match(page,/data-grade="3"/);
});

test('official FSRS UMD library schedules four grades and migrates history', () => {
  const official=require('../fsrs-runtime/ts-fsrs.umd.js');
  global.FSRS=official;
  const fsrs=require('../definition-fsrs.js');
  const now=Date.UTC(2026,9,19);
  const again=fsrs.schedule(null,0,now);
  const good=fsrs.schedule(null,2,now);
  const easy=fsrs.schedule(null,3,now);
  assert.equal(again.due,now+60_000);
  assert.ok(easy.due>good.due);
  assert.equal(good.algorithm,'ts-fsrs-v6');
  assert.equal(good.reviews.length,1);
  assert.equal(fsrs.isReady(),true);
  const followup=fsrs.schedule(good,2,good.due);
  assert.equal(followup.reviews.length,2);
  assert.ok(followup.stability>0);
  const old={ease:2.5,interval:3,reps:2,lastReviewed:now-86400000,reviews:[{at:now-86400000,grade:2,due:now}]};
  const migrated=fsrs.schedule(old,2,now);
  assert.equal(migrated.algorithm,'ts-fsrs-v6');
  assert.equal(migrated.reviews.length,2);
  assert.equal(migrated.ease,old.ease);
});
test('retention changes use official scheduler without losing review events',()=>{
 const fsrs=require('../definition-fsrs.js');
 const at=Date.UTC(2026,9,19);
 const record=fsrs.schedule(undefined,3,at);
 const high=fsrs.reschedule(record,0.95);
 const low=fsrs.reschedule(record,0.85);
 assert.ok(high.interval<=low.interval);
 assert.equal(high.reviews.length,record.reviews.length);
 assert.equal(high.lastReviewed,record.lastReviewed);
});
test('optimizer integration uses fsrs-browser WASM and preserves full history',()=>{
 const source=read('fsrs-build/optimizer.worker.js');
 assert.match(source,/fsrs-browser\\/fsrs_browser/);
 assert.match(source,/computeParameters\\(/);
 assert.match(read('definition-cards.html'),/fsrs-runtime\\/ts-fsrs.umd.js/);
 const fsrs=require('../definition-fsrs.js');
 assert.ok(fsrs.validWeights(fsrs.weights));
 assert.equal(fsrs.validWeights(Array(21).fill(-1)),false);
 const historical=fsrs.schedule(null,2,Date.UTC(2026,9,19));
 assert.equal(fsrs.reschedule(historical,0.9).reviews.length,1);
});
