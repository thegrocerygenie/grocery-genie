// Smoke tests for api/_handler.js — pure-function, no live network.
// Run: npm run test:smoke

import { handleWaitlistJoin } from '../api/_handler.js';

const results = [];
function test(name, fn) {
  results.push(Promise.resolve()
    .then(() => fn())
    .then(() => ({ name, ok: true }))
    .catch((err) => ({ name, ok: false, err })));
}
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

const realFetch = globalThis.fetch;

function withFetch(impl, run) {
  globalThis.fetch = impl;
  return run().finally(() => { globalThis.fetch = realFetch; });
}

// --------------- tests ---------------

test('rejects empty email with 400', async () => {
  const r = await handleWaitlistJoin({ email: '' }, { RESEND_API_KEY: 'x', RESEND_AUDIENCE_ID: 'y' });
  assert(r.status === 400, 'status not 400');
  assert(r.body.error, 'no error message');
});

test('rejects invalid email with 400', async () => {
  const r = await handleWaitlistJoin({ email: 'not-an-email' }, { RESEND_API_KEY: 'x', RESEND_AUDIENCE_ID: 'y' });
  assert(r.status === 400, 'status not 400');
});

test('returns 500 when env missing', async () => {
  const r = await handleWaitlistJoin({ email: 'a@b.co' }, {});
  assert(r.status === 500, `status ${r.status}, want 500`);
});

test('happy path returns 200 ok', async () => {
  const calls = [];
  await withFetch(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: 'contact_123', email: 'a@b.co' }), {
      status: 201, headers: { 'content-type': 'application/json' }
    });
  }, async () => {
    const r = await handleWaitlistJoin(
      { email: 'A@B.co', source: 'hero', ip: '1.2.3.4' },
      { RESEND_API_KEY: 'x', RESEND_AUDIENCE_ID: 'audience-123' },
    );
    assert(r.status === 200, 'status not 200');
    assert(r.body.ok === true, 'ok not true');
    assert(r.body.already === false, 'already should be false');
    assert(calls.length === 1, 'one fetch call');
    assert(calls[0].url.endsWith('/audiences/audience-123/contacts'), 'wrong endpoint');
    const sent = JSON.parse(calls[0].init.body);
    assert(sent.email === 'a@b.co', 'email not lowercased');
  });
});

test('duplicate (422) returns 200 already=true', async () => {
  await withFetch(async () => new Response(JSON.stringify({
    name: 'validation_error',
    message: 'Contact already exists.',
  }), { status: 422 }), async () => {
    const r = await handleWaitlistJoin(
      { email: 'a@b.co', ip: '5.6.7.8' },
      { RESEND_API_KEY: 'x', RESEND_AUDIENCE_ID: 'y' },
    );
    assert(r.status === 200, `status ${r.status}, want 200`);
    assert(r.body.already === true, 'already should be true');
  });
});

test('rate limits after 6 hits from same IP', async () => {
  await withFetch(async () => new Response(JSON.stringify({ id: 'x' }), { status: 201 }), async () => {
    const env = { RESEND_API_KEY: 'x', RESEND_AUDIENCE_ID: 'y' };
    let last;
    for (let i = 0; i < 8; i++) {
      // Different email each time so server-side validation passes; same IP for rate limiting.
      last = await handleWaitlistJoin({ email: `rate${i}@b.co`, ip: '9.9.9.9' }, env);
    }
    assert(last.status === 429, `status ${last.status}, want 429`);
    assert(/too many/i.test(last.body.error), 'expected too-many message');
  });
});

test('upstream 500 returns 502 to client', async () => {
  await withFetch(async () => new Response('boom', { status: 500 }), async () => {
    const r = await handleWaitlistJoin(
      { email: 'a@b.co', ip: '7.7.7.7' },
      { RESEND_API_KEY: 'x', RESEND_AUDIENCE_ID: 'y' },
    );
    assert(r.status === 502, `status ${r.status}, want 502`);
  });
});

test('network error returns 502', async () => {
  await withFetch(async () => { throw new Error('ENETDOWN'); }, async () => {
    const r = await handleWaitlistJoin(
      { email: 'a@b.co', ip: '8.8.8.8' },
      { RESEND_API_KEY: 'x', RESEND_AUDIENCE_ID: 'y' },
    );
    assert(r.status === 502, `status ${r.status}, want 502`);
  });
});

// --------------- run + report ---------------

const out = await Promise.all(results);
let failed = 0;
for (const r of out) {
  if (r.ok) {
    console.log('  ✓', r.name);
  } else {
    failed++;
    console.log('  ✗', r.name, '\n     ', r.err?.message || r.err);
  }
}
console.log('\n', failed === 0 ? `All ${out.length} tests passed.` : `${failed}/${out.length} failed.`);
process.exit(failed === 0 ? 0 : 1);
