import { tokenSubject } from '../utils/tokenSubject';

function jwt(payload: object): string {
  const b64url = (o: object) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;
}

describe('tokenSubject', () => {
  it('reads the user id from the access token', () => {
    expect(tokenSubject(jwt({ sub: '3f2c9a1e-0000-4000-8000-000000000001', typ: 'access' }))).toBe(
      '3f2c9a1e-0000-4000-8000-000000000001',
    );
  });

  it('handles base64url characters in the payload', () => {
    // "~~~" encodes to "fn5-" — a "-" that plain base64 decoding rejects.
    expect(tokenSubject(jwt({ sub: 'u-1', note: '~~~' }))).toBe('u-1');
  });

  it.each([
    ['no token', null],
    ['not a JWT', 'static-dev-token'],
    ['a payload that is not JSON', 'a.bm90LWpzb24.c'],
    ['a payload with no sub', jwt({ typ: 'access' })],
  ])('returns null for %s', (_label, token) => {
    expect(tokenSubject(token)).toBeNull();
  });
});
