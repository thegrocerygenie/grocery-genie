/**
 * Google Sign-In in a native build needs the reversed iOS client ID as a URL
 * scheme in Info.plist. app.config.ts adds the config plugin only when
 * EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set, so a build without it neither
 * breaks prebuild nor shows a button that can't work.
 */
import type { ExpoConfig } from 'expo/config';

import appConfig from '../../app.config';
import { googleIosUrlScheme } from '../../plugins/googleIosUrlScheme';

const base: ExpoConfig = { name: 'Grocery Genie', slug: 'grocery-genie', plugins: ['expo-camera'] };
const saved = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

afterEach(() => {
  if (saved === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = saved;
});

function googlePlugin(config: ExpoConfig) {
  return config.plugins?.find(
    (p) => Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin',
  );
}

describe('googleIosUrlScheme', () => {
  it('reverses an iOS client ID into its URL scheme', () => {
    expect(googleIosUrlScheme('1234-abcd.apps.googleusercontent.com')).toBe(
      'com.googleusercontent.apps.1234-abcd',
    );
  });

  it('is null when no client ID is set', () => {
    expect(googleIosUrlScheme(undefined)).toBeNull();
    expect(googleIosUrlScheme('  ')).toBeNull();
  });

  it('rejects a value that is not an iOS client ID', () => {
    expect(() => googleIosUrlScheme('not-a-client-id')).toThrow(/EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID/);
  });
});

describe('app.config Google Sign-In plugin', () => {
  it('adds the plugin with the URL scheme when the client ID is set', () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = '1234-abcd.apps.googleusercontent.com';
    const config = appConfig({ config: base } as never);

    expect(googlePlugin(config)).toEqual([
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: 'com.googleusercontent.apps.1234-abcd' },
    ]);
    expect(config.plugins).toContain('expo-camera');
  });

  it('leaves the plugin out when the client ID is not set', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    const config = appConfig({ config: base } as never);

    expect(googlePlugin(config)).toBeUndefined();
    expect(config.plugins).toEqual(['expo-camera']);
  });
});
