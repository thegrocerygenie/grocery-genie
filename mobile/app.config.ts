import type { ConfigContext, ExpoConfig } from 'expo/config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { googleIosUrlScheme } = require('./plugins/googleIosUrlScheme');

// app.json holds the static config. This adds what depends on the build's
// environment: the Google Sign-In plugin, only when the iOS client ID is set
// (the sign-in button checks the same variable).
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = googleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  return {
    ...config,
    name: config.name ?? 'Grocery Genie',
    slug: config.slug ?? 'grocery-genie',
    plugins: [
      ...(config.plugins ?? []),
      ...(iosUrlScheme
        ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, object]]
        : []),
    ],
  };
};
