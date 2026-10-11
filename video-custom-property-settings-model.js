(function (root, factory) {
  const api = factory(root.MangaReaderVideoCustomProperties);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoCustomPropertySettingsModel = api;
}(typeof window !== 'undefined' ? window : globalThis, function (Properties) {
  'use strict';

  if (!Properties) throw new Error('video custom property model must load before its settings model');
  const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const mapOf = (definitions) => isRecord(definitions) && isRecord(definitions.properties) ? definitions.properties : null;
  const sortByOrder = (items) => items.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.id).localeCompare(String(b.id)));
  const stamp = (value) => Number.isFinite(value) ? value : Date.now();
  function requireDefinitions(value) {
    const map = mapOf(value);
    if (!map) throw new Error('プロパティ定義を読み込めません。元データを保持しました。');
    return map;
  }
  function requireProperty(definitions, id) {
    const property = requireDefinitions(definitions)[id];
    if (!isRecord(property)) throw new Error('プロパティが見つかりません。画面を再読み込みしてください。');
    return property;
  }
  function requireName(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name) throw new Error('項目名を入力してください。');
    if (name.length > 120) throw new Error('項目名は120文字以内にしてください。');
    return name;
  }
  function requireId(id) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('IDが必要です。');
    return id;
  }

  function createProperty(definitions, { id, name, type, now } = {}) {
    const source = clone(definitions);
    const properties = requireDefinitions(source);
    requireId(id);
    if (Object.prototype.hasOwnProperty.call(properties, id)) throw new Error('プロパティIDが重複しています。');
    if (!Properties.PROPERTY_TYPES.includes(type)) throw new Error('プロパティの種類が不正です。');
    const active = Object.values(properties).filter((item) => isRecord(item) && item.deleted !== true);
    properties[id] = {
      id, name: requireName(name), type,
      order: active.length,
      hidden: false,
      deleted: false,
      updatedAt: stamp(now),
      options: {},
    };
    return source;
  }

  function updateProperty(definitions, id, patch = {}) {
    const source = clone(definitions);
    const property = requireProperty(source, id);
    if (Object.prototype.hasOwnProperty.call(patch, 'type') && patch.type !== property.type) throw new Error('作成後に種類は変更できません。');
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) property.name = requireName(patch.name);
    if (Object.prototype.hasOwnProperty.call(patch, 'hidden')) {
      if (typeof patch.hidden !== 'boolean') throw new Error('表示設定が不正です。');
      property.hidden = patch.hidden;
    }
    property.updatedAt = stamp(patch.now);
    return source;
  }

  function setPropertyFlag(definitions, id, flag, value) {
    if (flag !== 'hidden') throw new Error('表示設定が不正です。');
    return updateProperty(definitions, id, { [flag]: value });
  }

  function reorderProperty(definitions, id, targetIndex) {
    const source = clone(definitions);
    const map = requireDefinitions(source);
    const active = sortByOrder(Object.values(map).filter((item) => isRecord(item) && item.deleted !== true));
    const currentIndex = active.findIndex((item) => item.id === id);
    if (currentIndex < 0) throw new Error('表示中のプロパティが見つかりません。');
    active.splice(Math.max(0, Math.min(active.length - 1, Math.trunc(Number(targetIndex) || 0))), 0, active.splice(currentIndex, 1)[0]);
    const activeSlots = sortByOrder(Object.values(map)).filter((item) => isRecord(item) && item.deleted !== true).map((item) => item.id);
    const movedOrder = new Map(active.map((item, index) => [item.id, index]));
    const archived = sortByOrder(Object.values(map)).filter((item) => isRecord(item) && item.deleted === true);
    const archivedOrder = new Map(archived.map((item, index) => [item.id, active.length + index]));
    activeSlots.forEach((propertyId) => { map[propertyId].order = movedOrder.get(propertyId); });
    archived.forEach((property) => { map[property.id].order = archivedOrder.get(property.id); });
    return source;
  }

  function setDeleted(definitions, propertyId, deleted) {
    const source = clone(definitions);
    const property = requireProperty(source, propertyId);
    property.deleted = deleted;
    property.updatedAt = Date.now();
    return source;
  }
  const softDeleteProperty = (definitions, propertyId) => setDeleted(definitions, propertyId, true);
  const restoreProperty = (definitions, propertyId) => setDeleted(definitions, propertyId, false);

  function addOption(definitions, propertyId, { id, name, now } = {}) {
    const source = clone(definitions);
    const property = requireProperty(source, propertyId);
    if (!['single_select', 'multi_select'].includes(property.type) || property.deleted === true) throw new Error('選択肢を追加できないプロパティです。');
    requireId(id);
    const options = isRecord(property.options) ? property.options : null;
    if (!options) throw new Error('選択肢データが破損しているため、変更を保存できません。');
    if (Object.prototype.hasOwnProperty.call(options, id)) throw new Error('選択肢IDが重複しています。');
    const active = Object.values(options).filter((item) => isRecord(item) && item.deleted !== true);
    options[id] = { id, name: requireName(name), order: active.length, deleted: false, updatedAt: stamp(now) };
    property.updatedAt = stamp(now);
    return source;
  }

  function updateOption(definitions, propertyId, optionId, patch = {}) {
    const source = clone(definitions);
    const property = requireProperty(source, propertyId);
    const option = isRecord(property.options) && property.options[optionId];
    if (!isRecord(option)) throw new Error('選択肢が見つかりません。');
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) option.name = requireName(patch.name);
    option.updatedAt = stamp(patch.now);
    property.updatedAt = stamp(patch.now);
    return source;
  }

  function reorderOption(definitions, propertyId, optionId, targetIndex) {
    const source = clone(definitions);
    const property = requireProperty(source, propertyId);
    const map = isRecord(property.options) ? property.options : null;
    if (!map) throw new Error('選択肢データが破損しているため、変更を保存できません。');
    const active = sortByOrder(Object.values(map).filter((item) => isRecord(item) && item.deleted !== true));
    const currentIndex = active.findIndex((item) => item.id === optionId);
    if (currentIndex < 0) throw new Error('表示中の選択肢が見つかりません。');
    active.splice(Math.max(0, Math.min(active.length - 1, Math.trunc(Number(targetIndex) || 0))), 0, active.splice(currentIndex, 1)[0]);
    active.forEach((option, index) => { map[option.id].order = index; });
    sortByOrder(Object.values(map).filter((item) => isRecord(item) && item.deleted === true)).forEach((option, index) => { map[option.id].order = active.length + index; });
    property.updatedAt = Date.now();
    return source;
  }

  function setOptionDeleted(definitions, propertyId, optionId, deleted) {
    const source = clone(definitions);
    const property = requireProperty(source, propertyId);
    const option = isRecord(property.options) && property.options[optionId];
    if (!isRecord(option)) throw new Error('選択肢が見つかりません。');
    option.deleted = deleted;
    option.updatedAt = Date.now();
    property.updatedAt = Date.now();
    return source;
  }
  const softDeleteOption = (definitions, propertyId, optionId) => setOptionDeleted(definitions, propertyId, optionId, true);
  const restoreOption = (definitions, propertyId, optionId) => setOptionDeleted(definitions, propertyId, optionId, false);

  function countPropertyValues(values, propertyId) {
    if (!isRecord(values)) return 0;
    return Object.values(values).filter((videoValues) => isRecord(videoValues)
      && Object.prototype.hasOwnProperty.call(videoValues, propertyId)
      && videoValues[propertyId] !== null
      && !(Array.isArray(videoValues[propertyId]) && videoValues[propertyId].length === 0)).length;
  }

  function countOptionValues(values, propertyId, optionId) {
    if (!isRecord(values)) return 0;
    return Object.values(values).filter((videoValues) => {
      if (!isRecord(videoValues)) return false;
      const value = videoValues[propertyId];
      return value === optionId || (Array.isArray(value) && value.includes(optionId));
    }).length;
  }

  return Object.freeze({ createProperty, updateProperty, reorderProperty, setPropertyFlag, softDeleteProperty, restoreProperty, addOption, updateOption, reorderOption, softDeleteOption, restoreOption, countPropertyValues, countOptionValues });
}));
