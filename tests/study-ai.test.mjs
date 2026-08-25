import test from 'node:test';
import assert from 'node:assert/strict';
import StudyAI from '../study-ai.js';

test('gradeAnswer calls authenticated Supabase Edge Function without provider key', async () => {
  const calls = [];
  const vault = { withSession: async (work) => work('access-token', { id: 'u1' }) };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        grade: 'correct', recalled_unit_ids: ['u1'], missing_unit_ids: [], wrong_unit_ids: [],
        confusions: [], feedback: '', confidence: 'high'
      })
    };
  };
  const definition = {
    id: 'd1', contentRevision: 2, modelText: '模範',
    memoryUnits: [{ id: 'u1', text: '模範', importantTerms: ['模範'], acceptedVariants: [] }]
  };
  const result = await StudyAI.gradeAnswer({ definition, answerText: '模範' }, {
    vault, fetchImpl, supabaseUrl: 'https://example.supabase.co', publishableKey: 'anon-key'
  });
  assert.equal(result.result, 'correct');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/study-ai');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer access-token');
  assert.equal(calls[0].options.headers.apikey, 'anon-key');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.action, 'grade');
  assert.equal(body.input.definitionId, 'd1');
  assert.equal(body.input.definitionRevision, 2);
  assert.equal(body.input.answerText, '模範');
  assert.doesNotMatch(calls[0].options.body, /OPENAI_API_KEY|sk-/i);
});

test('study AI default timeout allows normal structured-output latency', () => {
  assert.ok(StudyAI.DEFAULT_TIMEOUT_MS >= 30000, `timeout was ${StudyAI.DEFAULT_TIMEOUT_MS}`);
});

test('analyzeDefinition maps server snake_case fields to editable browser shape', async () => {
  const vault = { withSession: async (work) => work('token', { id: 'u1' }) };
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      genre_suggestions: ['捜査'],
      memory_units: [{ id: 'actor', text: '主体', required: true, important_terms: ['主体'], accepted_variants: [] }],
      cloze_candidates: [{ unit_id: 'actor', terms: ['主体'] }],
      title_pronunciation: 'しょぶんせい',
      model_text_pronunciation: 'もはん'
    })
  });
  const result = await StudyAI.analyzeDefinition({ subject: '行政法', title: '処分性', modelText: '模範' }, {
    vault, fetchImpl, supabaseUrl: 'https://example.supabase.co'
  });
  assert.deepEqual(result.genreSuggestions, ['捜査']);
  assert.equal(result.memoryUnits[0].importantTerms[0], '主体');
  assert.equal(result.clozeCandidates[0].unitId, 'actor');
  assert.equal(result.titlePronunciation, 'しょぶんせい');
});

test('network failure is classified without exposing provider details', async () => {
  const vault = { withSession: async (work) => work('token', { id: 'u1' }) };
  await assert.rejects(
    StudyAI.gradeAnswer({ definition: { modelText: '模範', memoryUnits: [] }, answerText: '回答' }, {
      vault,
      fetchImpl: async () => { throw new Error('offline'); },
      supabaseUrl: 'https://example.supabase.co'
    }),
    (error) => error && error.code === 'network'
  );
});
