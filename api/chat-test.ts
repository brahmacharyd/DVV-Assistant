export const config = { runtime: 'edge' };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('POST only', { status: 405, headers: CORS });
  }

  const key = process.env['OPENROUTER_API_KEY'];
  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing OPENROUTER_API_KEY' }), {
      status: 401, headers: { 'content-type': 'application/json', ...CORS }
    });
  }

  const body = await req.json().catch(() => ({}));
  const messages = body?.messages ?? [{ role: 'user', content: 'Say hi!' }];

  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${key}`,
      'x-title': 'DVV Agent'
    },
    body: JSON.stringify({ model: 'openai/gpt-4o', messages })
  });

  if (!r.ok) {
    const errText = await r.text();
    return new Response(JSON.stringify({ upstreamStatus: r.status, upstreamBody: errText }), {
      status: 502, headers: { 'content-type': 'application/json', ...CORS }
    });
  }

  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  return new Response(JSON.stringify({ text }), {
    headers: { 'content-type': 'application/json', ...CORS }
  });
}