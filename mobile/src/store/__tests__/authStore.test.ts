/**
 * DA-14: the device keeps the last known onboarding state per account, so a
 * cold start offline can open a held push tap without waiting for the
 * profile. The keychain holds only the account id and the flag.
 */
import * as SecureStore from 'expo-secure-store';

import { cachedNeedsOnboarding, useAuthStore } from '../authStore';

jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    __items: items,
    getItemAsync: jest.fn(async (key: string) => items.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      items.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      items.delete(key);
    }),
  };
});

const keychain = (SecureStore as unknown as { __items: Map<string, string> }).__items;
const KEY = 'gg.auth.onboarding';

/** An access token whose `sub` is `userId`, as the API issues them. */
function tokenFor(userId: string): string {
  return `h.${btoa(JSON.stringify({ sub: userId }))}.s`;
}

async function relaunch() {
  useAuthStore.setState({
    hydrated: false,
    accessToken: null,
    refreshToken: null,
    userId: null,
    onboarding: null,
  });
  await useAuthStore.getState().hydrate();
}

beforeEach(async () => {
  keychain.clear();
  await relaunch();
});

describe('the last known onboarding state (DA-14)', () => {
  it('is kept on the device for the signed-in account and read back on launch', async () => {
    await useAuthStore.getState().setSession({ accessToken: tokenFor('u-a'), refreshToken: 'r' });
    await useAuthStore.getState().rememberOnboarding(false);

    expect(JSON.parse(keychain.get(KEY) ?? 'null')).toEqual({
      userId: 'u-a',
      needsOnboarding: false,
    });
    await relaunch();
    expect(cachedNeedsOnboarding(useAuthStore.getState())).toBe(false);
  });

  it('keeps "onboarding due" too', async () => {
    await useAuthStore.getState().setSession({ accessToken: tokenFor('u-a'), refreshToken: 'r' });
    await useAuthStore.getState().rememberOnboarding(true);
    await relaunch();
    expect(cachedNeedsOnboarding(useAuthStore.getState())).toBe(true);
  });

  it('is unknown before any profile loaded for this account', () => {
    useAuthStore.setState({ accessToken: tokenFor('u-a') });
    expect(cachedNeedsOnboarding(useAuthStore.getState())).toBeNull();
  });

  it('is cleared on sign-out', async () => {
    await useAuthStore.getState().setSession({ accessToken: tokenFor('u-a'), refreshToken: 'r' });
    await useAuthStore.getState().rememberOnboarding(false);
    await useAuthStore.getState().clear();

    expect(keychain.has(KEY)).toBe(false);
    expect(useAuthStore.getState().onboarding).toBeNull();
    expect(cachedNeedsOnboarding(useAuthStore.getState())).toBeNull();
    await relaunch();
    expect(useAuthStore.getState().onboarding).toBeNull();
  });

  it('is cleared when another account signs in', async () => {
    await useAuthStore.getState().setSession({ accessToken: tokenFor('u-a'), refreshToken: 'r' });
    await useAuthStore.getState().rememberOnboarding(false);
    await useAuthStore.getState().setSession({ accessToken: tokenFor('u-b'), refreshToken: 'r' });

    expect(keychain.has(KEY)).toBe(false);
    expect(cachedNeedsOnboarding(useAuthStore.getState())).toBeNull();
  });

  it('survives a token refresh for the same account', async () => {
    await useAuthStore.getState().setSession({ accessToken: tokenFor('u-a'), refreshToken: 'r' });
    await useAuthStore.getState().rememberOnboarding(false);
    await useAuthStore.getState().setSession({ accessToken: tokenFor('u-a'), refreshToken: 'r2' });

    expect(cachedNeedsOnboarding(useAuthStore.getState())).toBe(false);
  });

  it("never applies user A's state to user B", async () => {
    keychain.set(KEY, JSON.stringify({ userId: 'u-a', needsOnboarding: false }));
    keychain.set('gg.auth.access', tokenFor('u-b'));
    await relaunch();

    expect(cachedNeedsOnboarding(useAuthStore.getState())).toBeNull();
  });

  it('ignores a damaged entry', async () => {
    keychain.set(KEY, '{not json');
    keychain.set('gg.auth.access', tokenFor('u-a'));
    await relaunch();

    expect(cachedNeedsOnboarding(useAuthStore.getState())).toBeNull();
  });

  it('is not written without a known account', async () => {
    useAuthStore.setState({ accessToken: 'not-a-jwt' });
    await useAuthStore.getState().rememberOnboarding(false);
    expect(keychain.has(KEY)).toBe(false);
  });

  it('does not stop sign-in when the keychain fails', async () => {
    jest
      .mocked(SecureStore.getItemAsync)
      .mockImplementation(async (key: string) =>
        key === KEY
          ? Promise.reject(new Error('keychain unavailable'))
          : (keychain.get(key) ?? null),
      );
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key: string, value: string) => {
      if (key === KEY) throw new Error('keychain unavailable');
      keychain.set(key, value);
    });
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key: string) => {
      if (key === KEY) throw new Error('keychain unavailable');
      keychain.delete(key);
    });
    try {
      await relaunch();
      await useAuthStore.getState().setSession({ accessToken: tokenFor('u-a'), refreshToken: 'r' });
      await expect(useAuthStore.getState().rememberOnboarding(false)).resolves.toBeUndefined();
      expect(useAuthStore.getState().accessToken).toBe(tokenFor('u-a'));
      expect(keychain.get('gg.auth.access')).toBe(tokenFor('u-a'));

      // Next launch: nothing could be read back, so the app falls back to waiting.
      await relaunch();
      expect(useAuthStore.getState().accessToken).toBe(tokenFor('u-a'));
      expect(cachedNeedsOnboarding(useAuthStore.getState())).toBeNull();
      await expect(useAuthStore.getState().clear()).resolves.toBeUndefined();
    } finally {
      jest
        .mocked(SecureStore.getItemAsync)
        .mockImplementation(async (key: string) => keychain.get(key) ?? null);
      jest
        .mocked(SecureStore.setItemAsync)
        .mockImplementation(async (key: string, value: string) => {
          keychain.set(key, value);
        });
      jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key: string) => {
        keychain.delete(key);
      });
    }
  });
});
