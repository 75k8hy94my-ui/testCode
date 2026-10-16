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
