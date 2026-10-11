(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoCustomProperties = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PROPERTY_TYPES = Object.freeze(['text', 'long_text', 'single_select', 'multi_select', 'checkbox', 'number', 'date']);
  const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const record = (value) => isRecord(value) ? value : {};
  const properties = (definitions) => record(record(definitions).properties);
  const options = (property) => record(record(property).options);

  function normalizeDefinitions(value) {
    return isRecord(value) ? clone(value) : { schemaVersion: 1, properties: {} };
  }

  function normalizeValues(value) {
    return isRecord(value) ? clone(value) : {};
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function validateValue(property, value, definitions) {
    if (!isRecord(property) || property.deleted === true || !PROPERTY_TYPES.includes(property.type)) return false;
    if (property.type === 'text' || property.type === 'long_text') return typeof value === 'string';
    if (property.type === 'single_select') {
      if (value === null) return true;
      const option = options(property)[value];
      return typeof value === 'string' && !!option && option.deleted !== true;
    }
    if (property.type === 'multi_select') {
      if (!Array.isArray(value) || new Set(value).size !== value.length) return false;
      return value.every((id) => typeof id === 'string' && !!options(property)[id] && options(property)[id].deleted !== true);
    }
    if (property.type === 'checkbox') return typeof value === 'boolean';
    if (property.type === 'number') return value === null || (typeof value === 'number' && Number.isFinite(value));
    if (property.type === 'date') return value === null || validDate(value);
    return false;
  }

  function formatOption(property, optionId) {
    const option = options(property)[optionId];
    if (!option) return '削除済みの選択肢';
    const name = typeof option.name === 'string' ? option.name : '名称未設定';
    return option.deleted === true ? name + '（削除済み）' : name;
  }

  function formatValue(property, value, definitions) {
    if (value == null || !isRecord(property)) return '';
    switch (property.type) {
      case 'text':
      case 'long_text': return typeof value === 'string' ? value : '';
      case 'single_select': return typeof value === 'string' ? formatOption(property, value) : '';
      case 'multi_select': return Array.isArray(value) ? value.map((id) => formatOption(property, id)).join('、') : '';
      case 'checkbox': return typeof value === 'boolean' ? (value ? 'はい' : 'いいえ') : '';
      case 'number': return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
      case 'date': return validDate(value) ? value : '';
      default: return '';
    }
  }

  function matchesCondition(property, hasValue, value, filter) {
    const op = filter.operator;
    if (op === 'is_unset') return !hasValue || value == null;
    if (!hasValue || value == null) return false;
    switch (property.type) {
      case 'text':
      case 'long_text':
        if (typeof value !== 'string' || typeof filter.value !== 'string') return false;
        if (op === 'contains') return value.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase());
        return op === 'equals' && value === filter.value;
      case 'single_select': return op === 'equals' && value === filter.value;
      case 'multi_select': {
        if (!Array.isArray(value) || !Array.isArray(filter.optionIds) || !filter.optionIds.length) return false;
        if (op === 'contains_any') return filter.optionIds.some((id) => value.includes(id));
        if (op === 'contains_all') return filter.optionIds.every((id) => value.includes(id));
        return false;
      }
      case 'checkbox': return op === 'true' ? value === true : op === 'false' && value === false;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value) || typeof filter.value !== 'number' || !Number.isFinite(filter.value)) return false;
        if (op === 'equals') return value === filter.value;
        if (op === 'gte') return value >= filter.value;
        return op === 'lte' && value <= filter.value;
      case 'date':
        if (!validDate(value) || !validDate(filter.value)) return false;
        if (op === 'equals') return value === filter.value;
        if (op === 'on_or_after') return value >= filter.value;
        return op === 'on_or_before' && value <= filter.value;
      default: return false;
    }
  }

  function matchesFilters(video, definitions, values, filters) {
    if (!Array.isArray(filters) || !filters.length) return true;
    const videoId = video && video.id != null ? String(video.id) : '';
    const videoValues = record(record(values)[videoId]);
    const propertyMap = properties(definitions);
    return filters.every((filter) => {
      if (!isRecord(filter)) return false;
      const property = propertyMap[filter.propertyId];
      if (!isRecord(property) || property.deleted === true || property.hidden === true) return false;
      const hasValue = Object.prototype.hasOwnProperty.call(videoValues, filter.propertyId);
      const value = hasValue ? videoValues[filter.propertyId] : undefined;
      if (!matchesCondition(property, hasValue, value, filter)) return false;
      return filter.operator === 'is_unset' || validateValue(property, value, definitions);
    });
  }

  return Object.freeze({ PROPERTY_TYPES, normalizeDefinitions, normalizeValues, validateValue, formatValue, matchesFilters, validDate });
}));
