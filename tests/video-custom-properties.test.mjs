import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Properties = require('../video-custom-properties.js');

const definitions = {
  schemaVersion: 1,
  properties: {
    text: { id: 'text', name: '出演者', type: 'text', order: 0, hidden: false, deleted: false, options: {} },
    long: { id: 'long', name: '補足', type: 'long_text', order: 1, hidden: false, deleted: false, options: {} },
    single: { id: 'single', name: '時間帯', type: 'single_select', order: 2, hidden: false, deleted: false, options: {
      morning: { id: 'morning', name: '朝', order: 0, deleted: false },
      night: { id: 'night', name: '夜', order: 1, deleted: false },
      archived: { id: 'archived', name: '以前の選択肢', order: 2, deleted: true },
    } },
    multi: { id: 'multi', name: 'ジャンル', type: 'multi_select', order: 3, hidden: false, deleted: false, options: {
      travel: { id: 'travel', name: '旅行', order: 0, deleted: false },
      music: { id: 'music', name: '音楽', order: 1, deleted: false },
    } },
    check: { id: 'check', name: '要確認', type: 'checkbox', order: 4, hidden: false, deleted: false, options: {} },
    number: { id: 'number', name: '評価', type: 'number', order: 5, hidden: false, deleted: false, options: {} },
    date: { id: 'date', name: '撮影日', type: 'date', order: 6, hidden: false, deleted: false, options: {} },
  },
};

test('normalizesAllSevenPropertyTypes', () => {
  assert.deepEqual(Properties.PROPERTY_TYPES, ['text', 'long_text', 'single_select', 'multi_select', 'checkbox', 'number', 'date']);
  const raw = { schemaVersion: 1, properties: { p: { id: 'p', name: '評価', type: 'number', options: {} } } };
  assert.deepEqual(Properties.normalizeDefinitions(raw), raw);
  assert.deepEqual(Properties.normalizeValues({ v1: { check: false, number: 0, text: '' } }), { v1: { check: false, number: 0, text: '' } });
});

test('validatesTypedValuesWithoutCoercion', () => {
  const valid = [
    ['text', '出演者'], ['long', '複数行\n補足'], ['single', 'morning'], ['multi', ['travel', 'music']],
    ['check', true], ['number', 4], ['date', '2026-10-12'], ['single', null], ['number', null], ['date', null],
  ];
  for (const [id, value] of valid) assert.equal(Properties.validateValue(definitions.properties[id], value, definitions), true, id);
  for (const [id, value] of [['text', 7], ['single', 'missing'], ['single', 'archived'], ['multi', ['travel', 'travel']], ['check', 'false'], ['number', '0'], ['number', Infinity], ['date', '2026-02-29'], ['date', '2026-1-2']]) {
    assert.equal(Properties.validateValue(definitions.properties[id], value, definitions), false, `${id}:${String(value)}`);
  }
});

test('distinguishesFalseZeroEmptyAndUnset', () => {
  const values = { v1: { check: false, number: 0, text: '' } };
  assert.equal(Properties.matchesFilters({ id: 'v1' }, definitions, values, [{ propertyId: 'check', operator: 'false' }]), true);
  assert.equal(Properties.matchesFilters({ id: 'v1' }, definitions, values, [{ propertyId: 'number', operator: 'equals', value: 0 }]), true);
  assert.equal(Properties.matchesFilters({ id: 'v1' }, definitions, values, [{ propertyId: 'text', operator: 'equals', value: '' }]), true);
  assert.equal(Properties.matchesFilters({ id: 'v1' }, definitions, values, [{ propertyId: 'text', operator: 'is_unset' }]), false);
  assert.equal(Properties.matchesFilters({ id: 'v2' }, definitions, values, [{ propertyId: 'check', operator: 'is_unset' }]), true);
});

test('preservesUnknownFieldsAndArchivedOptionIds', () => {
  const rawDefinitions = { schemaVersion: 1, futureSchemaField: { retained: true }, properties: {
    single: { ...definitions.properties.single, futurePropertyField: 'kept', options: { ...definitions.properties.single.options } },
  } };
  assert.deepEqual(Properties.normalizeDefinitions(rawDefinitions), rawDefinitions);
  assert.deepEqual(Properties.normalizeValues({ v1: { single: 'archived', futureValue: 9 } }), { v1: { single: 'archived', futureValue: 9 } });
  assert.equal(Properties.validateValue(definitions.properties.single, 'archived', definitions), false);
  assert.equal(Properties.formatValue(definitions.properties.single, 'archived', definitions), '以前の選択肢（削除済み）');
});

test('matchesTypedFiltersWithAndAndMultiSelectAnyAll', () => {
  const video = { id: 'v1' };
  const values = { v1: { single: 'night', multi: ['travel', 'music'], number: 4, date: '2026-10-12', text: '出演者A' } };
  assert.equal(Properties.matchesFilters(video, definitions, values, [
    { propertyId: 'single', operator: 'equals', value: 'night' },
    { propertyId: 'multi', operator: 'contains_all', optionIds: ['travel', 'music'] },
    { propertyId: 'number', operator: 'gte', value: 3 },
    { propertyId: 'date', operator: 'on_or_before', value: '2026-10-12' },
    { propertyId: 'text', operator: 'contains', value: '者A' },
  ]), true);
  assert.equal(Properties.matchesFilters(video, definitions, values, [{ propertyId: 'multi', operator: 'contains_any', optionIds: ['travel', 'unknown'] }]), true);
  assert.equal(Properties.matchesFilters(video, definitions, values, [{ propertyId: 'multi', operator: 'contains_all', optionIds: ['travel', 'unknown'] }]), false);
  assert.equal(Properties.formatValue(definitions.properties.multi, ['music', 'travel'], definitions), '音楽、旅行');
});
