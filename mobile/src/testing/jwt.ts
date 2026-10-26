/** An unsigned JWT-shaped token carrying `sub`, for tests that need a signed-in user. */
export function fakeAccessToken(sub: string): string {
  const b64url = (o: object) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub, typ: 'access' })}.test`;
}
