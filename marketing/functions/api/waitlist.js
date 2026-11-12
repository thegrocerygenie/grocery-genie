// Cloudflare Pages Functions entry for the waitlist handler: served at /api/waitlist.
// Pages routes by file path, so this file needs no redirect rule.
// Env vars (RESEND_API_KEY, RESEND_AUDIENCE_ID, ALLOWED_ORIGIN, ...) come from
// context.env, set in the Pages project settings. There is no process.env here.
// Pages calls onRequestPost / onRequestOptions for those methods and onRequest for the rest.

import { handleWaitlistJoin } from '../../api/_handler.js';

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

export async function onRequestOptions({ env }) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

export async function onRequestPost({ request, env }) {
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

export async function onRequest({ env }) {
  return json(405, { error: 'Method not allowed' }, env, { Allow: 'POST' });
}
