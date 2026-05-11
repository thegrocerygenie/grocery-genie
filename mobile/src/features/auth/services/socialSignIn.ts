import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

// Expo Go doesn't ship the RNGoogleSignin native module, and even a
// try/catch'd `require()` triggers a LogBox overlay because the package's
// top-level code calls `TurboModuleRegistry.getEnforcing()` which reports
// to the global error handler before throwing. Skip the require entirely.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

interface AppleCredential {
  identity_token: string;
  authorization_code: string;
  nonce?: string;
  name?: string;
}

let googleConfigured = false;

interface GoogleSdk {
  GoogleSignin: {
    configure: (options: {
      iosClientId?: string;
      webClientId?: string;
      offlineAccess?: boolean;
    }) => void;
    hasPlayServices: () => Promise<boolean>;
    signIn: () => Promise<unknown>;
  };
  isSuccessResponse: (result: unknown) => result is { data: { idToken?: string | null } };
}

// Lazy-load the Google SDK so Expo Go (which lacks the RNGoogleSignin native
// module) doesn't crash on module load. The native module is only required
// when the user actually taps "Continue with Google" — and at that point a
// missing module surfaces as a sign-in failure (returns null), not a boot
// crash. Production dev builds bundle the native module and resolve fine.
function loadGoogleSdk(): GoogleSdk | null {
  if (isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as GoogleSdk;
  } catch {
    return null;
  }
}

let _googleAvailable: boolean | null = null;

// Synchronous probe — safe to call from render. Memoized so we only attempt
// the native-module require once. Returns false in Expo Go (no native module),
// true in dev builds where the module is linked.
export function isGoogleSignInAvailable(): boolean {
  if (_googleAvailable !== null) return _googleAvailable;
  _googleAvailable = loadGoogleSdk() !== null;
  return _googleAvailable;
}

// Async probe — Apple requires `isAvailableAsync()`, which only resolves true
// on iOS 13+ devices with Sign in with Apple support. Returns false in Expo
// Go (the native module is gated even though the JS import succeeds).
export function useAppleSignInAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (mounted) setAvailable(ok);
      })
      .catch(() => {
        if (mounted) setAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  return available;
}

function ensureGoogleConfigured(sdk: GoogleSdk) {
  if (googleConfigured) return;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  sdk.GoogleSignin.configure({
    iosClientId,
    webClientId,
    offlineAccess: false,
  });
  googleConfigured = true;
}

export async function runAppleSignIn(): Promise<AppleCredential | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) return null;
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
    });
    if (!credential.identityToken || !credential.authorizationCode) return null;
    return {
      identity_token: credential.identityToken,
      authorization_code: credential.authorizationCode,
      name:
        credential.fullName?.givenName && credential.fullName?.familyName
          ? `${credential.fullName.givenName} ${credential.fullName.familyName}`
          : undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('canceled')) {
      return null;
    }
    return null;
  }
}

export async function runGoogleSignIn(): Promise<string | null> {
  try {
    const sdk = loadGoogleSdk();
    if (!sdk) return null;
    ensureGoogleConfigured(sdk);
    await sdk.GoogleSignin.hasPlayServices();
    const result = await sdk.GoogleSignin.signIn();
    if (!sdk.isSuccessResponse(result)) return null;
    return result.data.idToken ?? null;
  } catch {
    return null;
  }
}
