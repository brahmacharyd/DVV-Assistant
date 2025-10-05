// /api/chat.ts  — Vercel Edge Function
export const config = { runtime: 'edge' };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: CORS });

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing OPENROUTER_API_KEY' }), {
      status: 500, headers: { 'content-type': 'application/json', ...CORS },
    });
  }

  const body = await req.json().catch(() => ({}));

  // Proxy to OpenRouter
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${key}`,     // <-- secret attached here
      'x-title': 'DVV Agent (Server Proxy)',
    },
    body: JSON.stringify(body),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', ...CORS },
  });
}