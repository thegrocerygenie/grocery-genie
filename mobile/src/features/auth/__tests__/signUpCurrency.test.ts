/**
 * The budget currency starts as the iPhone region's currency: every way to
 * create an account sends it (the server uses it only for a new account).
 */
import { appleSignIn, googleSignIn, signUp } from '../services/authApi';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ currencyCode: 'EUR' }],
  getCalendars: () => [{ timeZone: 'Europe/Berlin' }],
}));

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  global.fetch = mockFetch as unknown as typeof fetch;
});

function sentBody(): Record<string, unknown> {
  return JSON.parse(mockFetch.mock.calls[0][1].body as string);
}

it('sends the device currency with an email sign-up', async () => {
  await signUp({ email: 'a@example.test', password: 'pw' });
  expect(sentBody()).toMatchObject({ currency_preference: 'EUR' });
});

it('sends it with Sign in with Apple', async () => {
  await appleSignIn({ identity_token: 't', authorization_code: 'c' });
  expect(sentBody()).toMatchObject({ currency_preference: 'EUR' });
});

it('sends it with Google sign-in', async () => {
  await googleSignIn('id-token');
  expect(sentBody()).toMatchObject({ id_token: 'id-token', currency_preference: 'EUR' });
});

describe('time zone at sign-up (BC-06: summary at 9 AM local)', () => {
  it('sends the device time zone with every sign-up', async () => {
    await signUp({ email: 'a@example.test', password: 'pw' });
    await appleSignIn({ identity_token: 't', authorization_code: 'c' });
    await googleSignIn('id-token');

    for (const call of mockFetch.mock.calls) {
      expect(JSON.parse(call[1].body as string)).toMatchObject({ timezone: 'Europe/Berlin' });
    }
  });
});
