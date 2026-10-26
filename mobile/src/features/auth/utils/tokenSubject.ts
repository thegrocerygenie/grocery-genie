/**
 * The user id (`sub`) inside a JWT access token, or null when the token is
 * missing or not a JWT. Decoded locally, not verified: use it to scope
 * on-device data to the signed-in user, never to authorize anything.
 */
export function tokenSubject(token: string | null | undefined): string | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}
