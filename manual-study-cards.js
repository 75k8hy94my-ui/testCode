/* Independent front/back study cards, unrelated to statute definition annotations. */
(function(root) {
  'use strict';
  const STORAGE_KEY = 'testCode.statutes.manualCards.v1';
  const max = { front: 3000, back: 12000, category: 120 };
  const clean = value => typeof value === 'string' ? value.trim() : '';
  function normalize(items) {
    if (!Array.isArray(items)) return [];
    const seen = new Set(), valid = [];
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id ||
        seen.has(item.id)) continue;
      const front = clean(item.front), back = clean(item.back), category = clean(item.category);
      if (!front || !back || front.length > max.front || back.length > max.back ||
        category.length > max.category) continue;
      seen.add(item.id);
      valid.push({
        id: item.id, front, back, category,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0,
        updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0
      });
    }
    return valid;
  }
  function load(storage = root.localStorage) {
    try { return normalize(JSON.parse(storage.getItem(STORAGE_KEY) || '[]')); }
    catch (_) { return []; }
  }
  function validate(input) {
    const front = clean(input?.front), back = clean(input?.back), category = clean(input?.category);
    if (!front || !back) throw new Error('問題と解答の両方を入力してください。');
    if (front.length > max.front || back.length > max.back || category.length > max.category)
      throw new Error('文字数の上限を超えています。');
    return {front, back, category};
  }
  function insert(input, storage = root.localStorage, idFactory = () => root.crypto.randomUUID()) {
    const values = load(storage), card = validate(input);
    const id = idFactory();
    if (typeof id !== 'string' || !id || values.some(value => value.id === id))
      throw new Error('カードIDを生成できませんでした。');
    const now = Date.now();
    const result = {id, ...card, createdAt:now, updatedAt:now};
    storage.setItem(STORAGE_KEY, JSON.stringify([...values, result]));
    return result;
  }
  function update(id, input, storage = root.localStorage) {
    const values = load(storage), index = values.findIndex(x => x.id === id);
    if (index < 0) throw new Error('編集対象のカードが見つかりません。');
    const result = {...values[index], ...validate(input), updatedAt:Date.now()};
    values[index] = result;
    storage.setItem(STORAGE_KEY, JSON.stringify(values));
    return result;
  }
  function remove(id, storage = root.localStorage) {
    const values = load(storage);
    if (!values.some(x => x.id === id)) throw new Error('削除対象のカードが見つかりません。');
    storage.setItem(STORAGE_KEY, JSON.stringify(values.filter(x => x.id !== id)));
  }
  const reviewId = id => 'manual:' + id;
  const api = {STORAGE_KEY,normalize,load,insert,update,remove,reviewId};
  if (typeof module !== 'undefined') module.exports = api;
  root.ManualStudyCards = api;
})(typeof window !== 'undefined' ? window : globalThis);
