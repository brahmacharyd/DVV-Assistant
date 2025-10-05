export const config = { runtime: 'edge' };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function siteOrigin() {
  // e.g. "https://dvv-assistant.vercel.app"
  const url = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  return url || 'https://example.com';
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: CORS });

  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.trim().length < 20) {
    return new Response(JSON.stringify({ error: 'Missing/invalid OPENROUTER_API_KEY on server' }), {
      status: 500, headers: { 'content-type': 'application/json', ...CORS },
    });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'content-type': 'application/json', ...CORS },
    });
  }

  // Ensure a model is sent
  if (!body?.model) {
    body.model = 'openai/gpt-4o'; // set your default model here
  }

  // Decide streaming vs non-streaming
  const wantsStream = body?.stream === true;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'authorization': `Bearer ${key}`,
    'x-title': 'DVV Assistant (Server Proxy)',
    // Some setups prefer a referer; harmless to include
    'referer': siteOrigin(),
  };

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    // If error, forward a readable error payload to help debug (401/403/etc.)
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      return new Response(JSON.stringify({
        upstreamStatus: upstream.status,
        upstreamStatusText: upstream.statusText,
        errorBody: safeParse(txt),
      }), { status: upstream.status, headers: { 'content-type': 'application/json', ...CORS } });
    }

    // Non-stream passthrough
    if (!wantsStream) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'content-type': upstream.headers.get('content-type') ?? 'application/json',
          ...CORS,
        },
      });
    }

    // Stream passthrough (SSE)
    if (!upstream.body) {
      return new Response(JSON.stringify({ error: 'No upstream body for stream' }), {
        status: 502, headers: { 'content-type': 'application/json', ...CORS },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        const encoder = new TextEncoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value); // pass bytes as-is
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (e) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
        'cache-control': 'no-store',
        ...CORS,
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 502, headers: { 'content-type': 'application/json', ...CORS },
    });
  }
}

function safeParse(txt: string) {
  try { return JSON.parse(txt); } catch { return txt; }
}