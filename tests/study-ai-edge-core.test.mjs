import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ANALYZE_SCHEMA, GRADE_SCHEMA, buildGradePrompt, parseStructuredResponse } from '../supabase/functions/study-ai/core.mjs';

test('analysis schema includes editable memory units and both pronunciations', () => {
  assert.equal(ANALYZE_SCHEMA.required.includes('memory_units'), true);
  assert.equal(ANALYZE_SCHEMA.required.includes('title_pronunciation'), true);
  assert.equal(ANALYZE_SCHEMA.required.includes('model_text_pronunciation'), true);
  assert.equal(ANALYZE_SCHEMA.additionalProperties, false);
});

test('grade schema contains grading facts but no scheduler outputs', () => {
  assert.equal(GRADE_SCHEMA.required.includes('missing_unit_ids'), true);
  assert.equal(GRADE_SCHEMA.required.includes('confidence'), true);
  assert.equal('next_stage' in GRADE_SCHEMA.properties, false);
  assert.equal('next_review_at' in GRADE_SCHEMA.properties, false);
  assert.equal('xp' in GRADE_SCHEMA.properties, false);
});

test('grade prompt treats registered model as authoritative', () => {
  const text = buildGradePrompt({ modelText: 'MODEL', answerText: 'ANSWER', memoryUnits: [] });
  assert.match(text, /AUTHORITATIVE/i);
  assert.match(text, /MODEL/);
  assert.match(text, /ANSWER/);
  assert.match(text, /scheduling is not your job/i);
});

test('parses Responses API output_text JSON', () => {
  const response = {
    output: [{ type: 'message', content: [{ type: 'output_text', text: '{"grade":"correct","recalled_unit_ids":[],"missing_unit_ids":[],"wrong_unit_ids":[],"confusions":[],"feedback":"","confidence":"high"}' }] }]
  };
  assert.equal(parseStructuredResponse(response).grade, 'correct');
});

test('invalid provider output is rejected', () => {
  assert.throws(() => parseStructuredResponse({ output: [] }), /no structured output/);
  assert.throws(() => parseStructuredResponse({ output_text: '{bad' }), /invalid JSON/);
});

test('edge source keeps provider secret server-side and uses structured Responses API', () => {
  const source = fs.readFileSync(new URL('../supabase/functions/study-ai/index.ts', import.meta.url), 'utf8');
  assert.match(source, /Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.match(source, /OPENAI_STUDY_MODEL/);
  assert.match(source, /api\.openai\.com\/v1\/responses/);
  assert.match(source, /store:\s*false/);
  assert.match(source, /type:\s*['"]json_schema['"]/);
  assert.doesNotMatch(source, /console\.(?:log|info|debug)\(/);
});

test('edge function requires an Authorization header', () => {
  const source = fs.readFileSync(new URL('../supabase/functions/study-ai/index.ts', import.meta.url), 'utf8');
  assert.match(source, /req\.headers\.get\('Authorization'\)/);
  assert.match(source, /unauthorized/);
});

test('edge function verifies the bearer token belongs to a real Supabase user', () => {
  const source = fs.readFileSync(new URL('../supabase/functions/study-ai/index.ts', import.meta.url), 'utf8');
  assert.match(source, /SUPABASE_URL/);
  assert.match(source, /SUPABASE_ANON_KEY/);
  assert.match(source, /auth\/v1\/user/);
  assert.match(source, /user\.id/);
});
