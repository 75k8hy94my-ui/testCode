import test from 'node:test';
import assert from 'node:assert/strict';
import StudyAudio from '../study-audio.js';

test('uses saved hiragana pronunciation instead of visible kanji', () => {
  const spoken = [];
  const synth = { cancel() {}, speak(utterance) { spoken.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate }); } };
  class Utterance { constructor(text) { this.text = text; } }
  const definition = {
    title: '瑕疵',
    modelText: '瑕疵ある意思表示',
    pronunciation: { title: 'かし', modelText: 'かしある いしひょうじ' }
  };
  assert.equal(StudyAudio.speakDefinition(definition, 'modelText', { synth, Utterance }), true);
  assert.deepEqual(spoken, [{ text: 'かしある いしひょうじ', lang: 'ja-JP', rate: 1 }]);
});

test('falls back to visible text when saved pronunciation is empty', () => {
  const spoken = [];
  const synth = { cancel() {}, speak(utterance) { spoken.push(utterance.text); } };
  class Utterance { constructor(text) { this.text = text; } }
  assert.equal(StudyAudio.speakDefinition({ title: '処分性', pronunciation: { title: '' } }, 'title', { synth, Utterance }), true);
  assert.deepEqual(spoken, ['処分性']);
});

test('unsupported speech returns false without throwing', () => {
  assert.equal(StudyAudio.speak('てすと', { synth: null, Utterance: null }), false);
  assert.equal(StudyAudio.stop({ synth: null }), false);
});

test('stop cancels active speech', () => {
  let cancelled = 0;
  assert.equal(StudyAudio.stop({ synth: { cancel() { cancelled += 1; } } }), true);
  assert.equal(cancelled, 1);
});
