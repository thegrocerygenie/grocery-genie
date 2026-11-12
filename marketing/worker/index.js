// Cloudflare Worker for the marketing site.
// wrangler.toml serves dist/ as static assets and sends only /api/* here
// (run_worker_first), so page and asset requests never run this script.
// Env vars (RESEND_API_KEY, RESEND_AUDIENCE_ID, ALLOWED_ORIGIN, ...) are the
// Worker's runtime variables and secrets. There is no process.env here.

import { handleWaitlistJoin } from '../api/_handler.js';

const MAX_BODY_BYTES = 4096;

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env?.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function json(status, body, env, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(env), 'Content-Type': 'application/json', ...extra },
  });
}

async function waitlist(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' }, env, { Allow: 'POST' });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { error: 'Request too large.' }, env);
  }
  let body;
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return json(400, { error: 'Please enter a valid email address.' }, env);
  }

  const result = await handleWaitlistJoin(
    {
      email: body?.email,
      source: body?.source,
      path: body?.path,
      referrer: body?.referrer,
      ip: request.headers.get('CF-Connecting-IP'),
      userAgent: request.headers.get('User-Agent'),
    },
    env,
  );
  return json(result.status, result.body, env);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/waitlist') {
      return waitlist(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
