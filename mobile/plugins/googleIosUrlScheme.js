// The Info.plist URL scheme Google Sign-In needs: the iOS client ID reversed,
// "1234-abcd.apps.googleusercontent.com" -> "com.googleusercontent.apps.1234-abcd".
// Plain JS because app.config.ts loads it, and Expo's config loader doesn't
// transpile TypeScript imports.
const SUFFIX = '.apps.googleusercontent.com';

/**
 * Null when no client ID is set; throws on a value that isn't one, so a typo
 * fails the build instead of shipping a broken button.
 * @param {string | undefined} clientId
 * @returns {string | null}
 */
function googleIosUrlScheme(clientId) {
  const id = clientId?.trim();
  if (!id) return null;
  if (!id.endsWith(SUFFIX) || id.length === SUFFIX.length) {
    throw new Error(`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must end with "${SUFFIX}"; got "${id}".`);
  }
  return `com.googleusercontent.apps.${id.slice(0, -SUFFIX.length)}`;
}

module.exports = { googleIosUrlScheme };
