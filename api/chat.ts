export const config = { runtime: 'edge' };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: CORS });

  const key = process.env['OPENROUTER_API_KEY'];
  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing OPENROUTER_API_KEY' }), {
      status: 401, headers: { 'content-type': 'application/json', ...CORS }
    });
  }

  const { messages } = await req.json().catch(() => ({ messages: [] }));
  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'messages[] required' }), {
      status: 400, headers: { 'content-type': 'application/json', ...CORS }
    });
  }

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${key}`,
      'x-title': 'DVV Agent'
    },
    body: JSON.stringify({ model: 'openai/gpt-4o', messages, stream: true })
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), {
      status: upstream.status, headers: { 'content-type': 'application/json', ...CORS }
    });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder(); const dec = new TextDecoder();

  (async () => {
    try {
      const reader = upstream.body!.getReader();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const ln of lines) {
          const t = ln.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') {
            await writer.write(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
            await writer.close(); return;
          }
          try {
            const j = JSON.parse(payload);
            const delta = j?.choices?.[0]?.delta?.content ?? '';
            if (delta) await writer.write(enc.encode(`data: ${JSON.stringify({ delta })}\n\n`));
          } catch {}
        }
      }
      await writer.write(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      await writer.close();
    } catch (e: any) {
      await writer.write(enc.encode(`data: ${JSON.stringify({ error: e?.message || 'stream error' })}\n\n`));
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      ...CORS
    }
  });
}