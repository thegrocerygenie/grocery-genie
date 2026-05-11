// Framework-agnostic waitlist handler.
// Inputs:  { email, source, path, referrer, ip, userAgent }, env
// Outputs: { status, body }   — body is a plain object, callers JSON.stringify it.
//
// Wired up by:
//   /api/waitlist.js              (Vercel / Cloudflare Pages Functions)
//   /netlify/functions/waitlist.js (Netlify)
//   /server.js                    (self-hosted Node)
//
// Uses fetch() directly against the Resend API so we don't ship a runtime SDK
// dependency. Resend reference: https://resend.com/docs/api-reference/contacts/create-contact

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 6;

const rateBuckets = globalThis.__GG_RATE_BUCKETS__ ?? (globalThis.__GG_RATE_BUCKETS__ = new Map());

function rateLimit(ip) {
  if (!ip) return true;
  const now = Date.now();
  const entry = rateBuckets.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

function normalizeSource(s) {
  const v = String(s || '').toLowerCase();
  return ['hero', 'cta', 'unknown'].includes(v) ? v : 'unknown';
}

async function callResend(path, init, apiKey) {
  return fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init && init.headers ? init.headers : {}),
    },
  });
}

export async function handleWaitlistJoin(input, env) {
  const email = String(input?.email || '').trim().toLowerCase();
  const source = normalizeSource(input?.source);
  const ip = input?.ip || null;

  if (!EMAIL_RE.test(email) || email.length > 320) {
    return { status: 400, body: { error: 'Please enter a valid email address.' } };
  }
  if (!rateLimit(ip)) {
    return { status: 429, body: { error: 'Too many attempts. Try again in a minute.' } };
  }

  const apiKey = env?.RESEND_API_KEY;
  const audienceId = env?.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    // Surface a clear error in dev; in prod, the operator should have these set.
    return {
      status: 500,
      body: { error: 'Waitlist is temporarily unavailable. Please try again later.' },
    };
  }

  let response;
  try {
    response = await callResend(
      `/audiences/${encodeURIComponent(audienceId)}/contacts`,
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          unsubscribed: false,
        }),
      },
      apiKey,
    );
  } catch {
    return { status: 502, body: { error: 'Could not reach our servers. Please try again.' } };
  }

  let payload = null;
  try { payload = await response.json(); } catch { /* non-JSON */ }

  // Resend returns 422 with a "duplicate" type when the contact already exists.
  const dupName = payload?.name === 'validation_error' || payload?.name === 'invalid_parameter';
  const dupMsg = typeof payload?.message === 'string' && /already exists|duplicate/i.test(payload.message);
  if (response.status === 422 && (dupName || dupMsg)) {
    return { status: 200, body: { ok: true, already: true } };
  }

  if (!response.ok) {
    return {
      status: 502,
      body: { error: 'Could not save your email. Please try again.' },
    };
  }

  // Optional welcome email — only fired if WAITLIST_FROM is configured.
  if (env.WAITLIST_FROM) {
    const subject = env.WAITLIST_WELCOME_SUBJECT || "You're on the Grocery Genie list";
    const body =
      env.WAITLIST_WELCOME_TEXT ||
      `Welcome to the Grocery Genie waitlist.\n\nWe'll only email when there's something to ship — TestFlight invites, launch dates, the occasional "we shipped X" note. No drip sequence, no nonsense.\n\nIf you ever change your mind, reply with "unsubscribe" and we'll remove you within 24 hours.\n\n— The Grocery Genie team\nBrooklyn, NY`;

    // fire-and-forget: don't block the user response
    callResend('/emails', {
      method: 'POST',
      body: JSON.stringify({
        from: env.WAITLIST_FROM,
        to: [email],
        subject,
        text: body,
        tags: [{ name: 'kind', value: 'waitlist_welcome' }, { name: 'source', value: source }],
      }),
    }, apiKey).catch(() => { /* ignore */ });
  }

  return { status: 200, body: { ok: true, already: false } };
}

export const __test__ = { EMAIL_RE, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, rateBuckets };
