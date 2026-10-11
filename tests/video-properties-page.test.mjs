import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../video-custom-properties.js');
const Admin = require('../video-custom-property-settings-model.js');
const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const types = ['text', 'long_text', 'single_select', 'multi_select', 'checkbox', 'number', 'date'];

test('createsSevenTypesWithStableOptionIds', () => {
  let definitions = { schemaVersion: 1, properties: {} };
  for (const [index, type] of types.entries()) {
    definitions = Admin.createProperty(definitions, { id: `p${index}`, name: `項目${index}`, type, now: 100 + index });
  }
  assert.deepEqual(Object.keys(definitions.properties), types.map((_, index) => `p${index}`));
  definitions = Admin.addOption(definitions, 'p2', { id: 'o1', name: '朝', now: 500 });
  assert.equal(definitions.properties.p2.options.o1.id, 'o1');
  assert.throws(() => Admin.addOption(definitions, 'p2', { id: 'o1', name: '重複' }), /ID/);
});

test('editsOrderAndGeneralVisibility', () => {
  let definitions = { schemaVersion: 1, properties: {
    p1: { id: 'p1', name: 'A', type: 'text', order: 0, hidden: false, showInCard: false, deleted: false, options: {} },
    p2: { id: 'p2', name: 'B', type: 'text', order: 1, hidden: false, showInCard: false, deleted: false, options: {} },
  } };
  definitions = Admin.setPropertyFlag(definitions, 'p1', 'hidden', true);
  definitions = Admin.reorderProperty(definitions, 'p2', 0);
  assert.equal(definitions.properties.p1.hidden, true);
  assert.throws(() => Admin.setPropertyFlag(definitions, 'p1', 'showInCard', true), /表示設定/);
  assert.equal(definitions.properties.p2.order, 0);
  assert.equal(definitions.properties.p1.order, 1);
});

test('locksTypeAfterCreation', () => {
  const definitions = Admin.createProperty({ schemaVersion: 1, properties: {} }, { id: 'p1', name: '評価', type: 'number' });
  assert.throws(() => Admin.updateProperty(definitions, 'p1', { type: 'text' }), /種類は変更できません/);
  const renamed = Admin.updateProperty(definitions, 'p1', { name: '満足度' });
  assert.equal(renamed.properties.p1.id, 'p1');
  assert.equal(renamed.properties.p1.type, 'number');
});

test('showsAffectedVideoCountsBeforeSoftDelete', () => {
  const definitions = Admin.createProperty({ schemaVersion: 1, properties: {} }, { id: 'p1', name: '時間帯', type: 'single_select' });
  const withOption = Admin.addOption(definitions, 'p1', { id: 'morning', name: '朝' });
  const values = { v1: { p1: 'morning' }, v2: { p1: null }, v3: { p1: 'morning' } };
  assert.equal(Admin.countPropertyValues(values, 'p1'), 2);
  assert.equal(Admin.countOptionValues(values, 'p1', 'morning'), 2);
  const removed = Admin.softDeleteProperty(withOption, 'p1');
  assert.equal(removed.properties.p1.deleted, true);
  assert.equal(removed.properties.p1.options.morning.deleted, false);
});

test('restoresDeletedPropertyAndOptionByOriginalId', () => {
  let definitions = Admin.createProperty({ schemaVersion: 1, properties: {} }, { id: 'p1', name: '時間帯', type: 'single_select' });
  definitions = Admin.addOption(definitions, 'p1', { id: 'morning', name: '朝' });
  definitions = Admin.softDeleteOption(definitions, 'p1', 'morning');
  definitions = Admin.restoreOption(definitions, 'p1', 'morning');
  definitions = Admin.softDeleteProperty(definitions, 'p1');
  definitions = Admin.restoreProperty(definitions, 'p1');
  assert.equal(definitions.properties.p1.id, 'p1');
  assert.equal(definitions.properties.p1.options.morning.id, 'morning');
  assert.equal(definitions.properties.p1.options.morning.deleted, false);
  assert.equal(definitions.properties.p1.deleted, false);
});

test('settingsRouteUsesTheVideoAccessGateAndTypedStore', () => {
  const html = read('video-properties.html');
  const page = read('video-properties-page.js');
  assert.match(html, /media-access-gate\.js/);
  assert.match(html, /vault-session\.js/);
  assert.match(html, /video-custom-properties\.js/);
  assert.match(html, /video-custom-property-store\.js/);
  assert.match(html, /video-custom-property-settings-model\.js/);
  assert.match(html, /video-properties-page\.js/);
  assert.match(page, /markLocalChangesPending|\.mutate\(/);
  assert.match(page, /プロパティ設定/);
  assert.match(page, /aria-label/);
  assert.match(page, /textContent/);
});

test('card visibility switch is removed, active fields use automatic listing', () => {
  const page = read('video-properties-page.js');
  const model = read('video-custom-property-settings-model.js');
  const library = read('video-library.js');
  assert.doesNotMatch(page, /動画カードに表示|showInCard/);
  assert.doesNotMatch(model, /showInCard/);
  assert.doesNotMatch(library, /showInCard/);
  assert.match(read('video-properties.html'), /video-properties-page\.js\?v=20261012-always-show-properties/);
});
