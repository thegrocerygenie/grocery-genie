/**
 * "Continue with Google" shows only when the build can complete it: the native
 * module is linked and EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set (app.config.ts
 * adds the URL scheme from the same variable).
 */
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'bare' },
  ExecutionEnvironment: { StoreClient: 'storeClient', Bare: 'bare' },
}));
jest.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: {} }), {
  virtual: true,
});

const saved = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
afterEach(() => {
  if (saved === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = saved;
});

function available(): boolean {
  let result = false;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    result = require('../socialSignIn').isGoogleSignInAvailable();
  });
  return result;
}

describe('isGoogleSignInAvailable', () => {
  it('is true in a native build with an iOS client ID', () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = '1234-abcd.apps.googleusercontent.com';
    expect(available()).toBe(true);
  });

  it('is false without an iOS client ID, even with the native module', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    expect(available()).toBe(false);
  });
});
