import test from 'node:test';
import assert from 'node:assert/strict';
import StudyOffline from '../study-offline.js';

function makeFakeDocument() {
  const inserted = [];
  const header = {
    prepend(node) { inserted.unshift(node); },
    querySelector(selector) { return inserted.find((node) => selector === '#studyAppHomeBackLink' && node.id === 'studyAppHomeBackLink') || null; }
  };
  return {
    inserted,
    header,
    querySelector(selector) {
      if (selector === '#studyHome .pageHeader') return header;
      if (selector === '#studyAppHomeBackLink') return inserted.find((node) => node.id === 'studyAppHomeBackLink') || null;
      return null;
    },
    createElement(tag) {
      return { tagName: tag.toUpperCase(), style: {}, setAttribute(name, value) { this[name] = value; } };
    }
  };
}

test('study home installs a single link back to the app home', () => {
  const doc = makeFakeDocument();
  assert.equal(StudyOffline.installAppHomeBackLink(doc), true);
  assert.equal(doc.inserted.length, 1);
  const link = doc.inserted[0];
  assert.equal(link.tagName, 'A');
  assert.equal(link.id, 'studyAppHomeBackLink');
  assert.equal(link.href, 'home.html');
  assert.equal(link.textContent, '← ホームへ戻る');
  assert.equal(link['aria-label'], 'アプリのホームへ戻る');
  assert.equal(StudyOffline.installAppHomeBackLink(doc), true);
  assert.equal(doc.inserted.length, 1);
});
