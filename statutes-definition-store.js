(() => {
  'use strict';
  const STORAGE_KEY = 'testCode.statutes.definitions.v1';
  const LAW_NAMES = Object.freeze({
    constitution: '日本国憲法',
    'criminal-general': '刑法', 'criminal-special': '刑法',
    'civil-procedure': '民事訴訟法', 'criminal-procedure': '刑事訴訟法',
    corporations: '会社法',
    'administrative-litigation': '行政事件訴訟法',
    'administrative-procedure': '行政手続法',
    'administrative-appeal': '行政不服審査法',
    'administrative-execution': '行政代執行法',
    'state-compensation': '国家賠償法',
    'local-autonomy': '地方自治法',
    'information-disclosure': '行政機関情報公開法',
    'labor-standards': '労働基準法', 'labor-contract': '労働契約法',
    'labor-unions': '労働組合法',
    'labor-relations': '労働関係調整法',
    'labor-safety': '労働安全衛生法',
    'labor-dispatch': '労働者派遣法',
    'minimum-wage': '最低賃金法',
    'equal-employment': '男女雇用機会均等法',
    'childcare-leave': '育児・介護休業法'
  });
  function lawForSubject(subject) {
    return subject.startsWith('civil-') || subject === 'civil' ? '民法' : (LAW_NAMES[subject] || '');
  }
  function enrichDefinition(item) {
    const law = lawForSubject(item.subject) || item.law || '';
    const source = law ? law + item.article : (item.source || '');
    // Every saved definition is a flashcard. Retain card:true so older Vault payloads stay compatible.
    return { ...item, law, source, card: true };
  }
  // A statute may define a term by listing its elements rather than by a prose definition.
  // Save the complete article wording as the answer so flashcards work offline, too.
  function definitionFromArticle(item, articleText) {
    const definition = typeof articleText === 'string' ? articleText.trim() : '';
    return definition ? enrichDefinition({ ...item, definition, definitionKind: 'statute' }) : null;
  }
  function normalizeDefinitions(data) {
    if (!Array.isArray(data)) return [];
    return data.filter(item =>
      item && typeof item.subject === 'string' &&
      typeof item.article === 'string' &&
      Number.isSafeInteger(item.part) && item.part >= 0 &&
      Number.isSafeInteger(item.start) && item.start >= 0 &&
      Number.isSafeInteger(item.end) && item.end > item.start &&
      typeof item.quote === 'string' && typeof item.definition === 'string'
    ).map(enrichDefinition);
  }
  function loadDefinitions(storage = typeof localStorage === 'undefined' ? null : localStorage) {
    if (!storage) return [];
    try {
      const data = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
      const valid = normalizeDefinitions(data);
      // Upgrade previously unchecked definitions without discarding annotations.
      if (JSON.stringify(data) !== JSON.stringify(valid)) {
        try { storage.setItem(STORAGE_KEY, JSON.stringify(valid)); } catch (_) {}
      }
      return valid;
    } catch (_) { return []; }
  }
  const api = { STORAGE_KEY, lawForSubject, enrichDefinition, definitionFromArticle, normalizeDefinitions, loadDefinitions };
  if (typeof window !== 'undefined') window.StatutesDefinitionStore = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
