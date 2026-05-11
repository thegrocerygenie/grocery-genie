// Netlify Functions wrapper for the waitlist handler.
// Configure the redirect in netlify.toml: /api/waitlist -> /.netlify/functions/waitlist

import { handleWaitlistJoin } from '../../api/_handler.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let parsed = {};
  try { parsed = JSON.parse(event.body || '{}'); } catch { parsed = {}; }

  const headers = event.headers || {};
  const fwd = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  const ip = typeof fwd === 'string' ? fwd.split(',')[0].trim() : (event.clientContext?.ip || null);

  const result = await handleWaitlistJoin(
    {
      email: parsed.email,
      source: parsed.source,
      path: parsed.path,
      referrer: parsed.referrer,
      ip,
      userAgent: headers['user-agent'] || null,
    },
    process.env,
  );

  return {
    statusCode: result.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body),
  };
};
