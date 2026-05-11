// Vercel / Cloudflare Pages Functions handler.
// Expects POST application/json: { email, source }
// Returns 200 { ok: true, already: boolean } | 4xx { error } | 5xx { error }

import { handleWaitlistJoin } from './_handler.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (Array.isArray(fwd)) return fwd[0];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { ...corsHeaders(), 'Content-Type': 'application/json', Allow: 'POST' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  } else if (!body) {
    // Some runtimes don't auto-parse — read the stream.
    body = await new Promise((resolve) => {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; if (raw.length > 4096) req.destroy(); });
      req.on('end', () => {
        try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });
  }

  const result = await handleWaitlistJoin(
    {
      email: body?.email,
      source: body?.source,
      path: body?.path,
      referrer: body?.referrer,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || null,
    },
    process.env,
  );

  res.writeHead(result.status, { ...corsHeaders(), 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.body));
}

export const config = { runtime: 'nodejs' };
