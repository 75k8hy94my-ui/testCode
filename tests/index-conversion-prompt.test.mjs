import test from 'node:test';
import assert from 'node:assert/strict';
import Prompt from '../index-conversion-prompt.js';

test('conversion prompt fully specifies schema v1 and safe legal-index extraction rules', () => {
  const prompt = Prompt.buildPrompt();
  assert.match(prompt, /"schemaVersion"\s*:\s*1/);
  assert.match(prompt, /matterEntries/);
  assert.match(prompt, /caseEntries/);
  assert.match(prompt, /statuteEntries/);
  assert.match(prompt, /親見出し.*子見出し.*flatten/is);
  assert.match(prompt, /年月日だけ.*同一/is);
  assert.match(prompt, /裁判所.*判例集.*巻.*号.*掲載頁/is);
  assert.match(prompt, /条.*項.*号/is);
  assert.match(prompt, /ページ.*文字列/is);
  assert.match(prompt, /推測.*しない/is);
  assert.match(prompt, /JSONのみ/is);
  assert.match(prompt, /Markdown.*禁止/is);
});

test('prompt is deterministic and contains no current user/book data inputs', () => {
  assert.equal(Prompt.buildPrompt(), Prompt.buildPrompt());
  assert.equal(Prompt.buildPrompt.length, 0);
});
