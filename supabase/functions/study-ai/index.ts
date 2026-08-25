import { ANALYZE_SCHEMA, GRADE_SCHEMA, buildAnalyzePrompt, buildGradePrompt, parseStructuredResponse } from './core.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const allowedStudyUserIds = new Set([
  'c402d28a-b2fa-45b8-9731-bd2031955b84'
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization || !supabaseUrl || !anonKey) return null;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: anonKey }
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && user.id ? user : null;
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const user = await authenticatedUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!allowedStudyUserIds.has(user.id)) return json({ error: 'forbidden' }, 403);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'server_not_configured' }, 500);

  let body: { action?: string; input?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'invalid_json' }, 400);
  }

  const action = body && body.action;
  if (action !== 'analyze' && action !== 'grade') return json({ error: 'invalid_action' }, 400);

  const input = body.input && typeof body.input === 'object' ? body.input : {};
  const schema = action === 'analyze' ? ANALYZE_SCHEMA : GRADE_SCHEMA;
  const prompt = action === 'analyze' ? buildAnalyzePrompt(input) : buildGradePrompt(input);

  let provider: Response;
  try {
    provider = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_STUDY_MODEL') || 'gpt-5-mini',
        instructions: 'You are a precise Japanese legal-definition memorization grader and formatter. Follow the supplied authoritative text and JSON schema exactly.',
        input: prompt,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: action === 'analyze' ? 'study_definition_analysis' : 'study_definition_grade',
            strict: true,
            schema
          }
        }
      })
    });
  } catch (_) {
    return json({ error: 'provider_unreachable' }, 502);
  }

  if (!provider.ok) return json({ error: 'provider_error', status: provider.status }, 502);
  try {
    return json(parseStructuredResponse(await provider.json()));
  } catch (_) {
    return json({ error: 'provider_invalid_output' }, 502);
  }
});
