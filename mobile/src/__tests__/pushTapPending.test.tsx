/**
 * BUG-6 (Simulator pass 2026-11-06): a price alert tapped from a killed app
 * opened Budget and did not route, once in five cold starts, the first after a
 * fresh sign-in. A tap that launches the app must be kept until the session is
 * known and the app has left onboarding, then open its item exactly once.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { router, Slot, useLocalSearchParams } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import RootLayout from '../../app/_layout';
import type { UserProfile } from '@/features/auth/types';
import { useAuthStore } from '@/store/authStore';
import { deliverTap, priceAlertTap, resetNative } from '@/testing/fakeNotifications';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncQueue: () => undefined }));
jest.mock('expo-notifications', () =>
  jest.requireActual('@/testing/fakeNotifications').fakeNotificationsModule(),
);

// The keychain answers when the test says so, as it can be slow on launch.
const mockKeychain: { session: string | null; gate: Promise<void> } = {
  session: null,
  gate: Promise.resolve(),
};
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async (key: string) => {
    await mockKeychain.gate;
    return key === 'gg.auth.access' ? mockKeychain.session : null;
  }),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const mockMarkRead = jest.fn(async () => undefined);
jest.mock('@/features/notifications/services/pushApi', () => ({
  registerPushToken: jest.fn(async () => undefined),
  markNotificationRead: (...args: unknown[]) => mockMarkRead(...(args as [])),
}));

function mockProfile(): UserProfile {
  return {
    id: 'u-1',
    email: 'push@test.com',
    name: 'Push',
    locale: 'en_US',
    currency_preference: 'USD',
    email_verified_at: '2026-10-27T00:00:00Z',
    preferences: {
      notification_thresholds: { fifty: false, eighty: true, hundred: true },
      weekly_summary: { enabled: true, day: 0 },
      ocr_languages: [],
    },
    needs_onboarding: false,
  };
}
jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: async () => mockProfile(),
}));

function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`Item ${id}`}</Text>;
}

// Sign-in as the real screen does it: save the session (useSignIn's
// onSuccess), then, once mutateAsync resolves, replace itself with the tabs.
// On the phone React renders the new session and runs its effects before that
// promise chain gets back to the screen; the pause makes that order certain.
function SignInScreen() {
  const onPress = async () => {
    await useAuthStore.getState().setSession({ accessToken: 'fresh', refreshToken: 'r' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    router.replace('/(tabs)');
  };
  return (
    <Pressable accessibilityLabel="Sign in" onPress={() => void onPress()}>
      <Text>Sign in</Text>
    </Pressable>
  );
}

function launch(initialUrl: string) {
  return renderRouter(
    {
      _layout: RootLayout,
      '(tabs)/_layout': () => <Slot />,
      '(tabs)/index': () => <Text>Budget home</Text>,
      'onboarding/_layout': () => <Slot />,
      'onboarding/index': () => <Text>Welcome</Text>,
      'onboarding/sign-in': SignInScreen,
      'items/[id]': ItemScreen,
    },
    { initialUrl },
  );
}

async function expectBackToBudget() {
  expect(router.canGoBack()).toBe(true);
  act(() => router.back());
  expect(await screen.findByText('Budget home')).toBeTruthy();
}

// renderRouter runs on fake timers: let promises and timers play out.
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      jest.advanceTimersByTime(50);
    });
  }
}

let push: jest.SpyInstance;

beforeEach(() => {
  resetNative();
  mockMarkRead.mockClear();
  mockKeychain.session = null;
  mockKeychain.gate = Promise.resolve();
  useAuthStore.setState({ accessToken: null, refreshToken: null, hydrated: false });
  push = jest.spyOn(router, 'push');
});

afterEach(() => {
  push.mockRestore();
});

function itemPushes(itemId: string) {
  return push.mock.calls.filter(([href]) => href === `/items/${itemId}`).length;
}

describe('A push tap that launches the app (BUG-6)', () => {
  it('keeps a tap that lands before the keychain returns the session, then routes it once', async () => {
    let openKeychain = () => {};
    mockKeychain.gate = new Promise((resolve) => {
      openKeychain = resolve;
    });
    mockKeychain.session = 'token';
    launch('/');
    deliverTap(priceAlertTap('tap-hydrate', 'item-hydrate'));

    await act(async () => openKeychain());

    expect(await screen.findByText('Item item-hydrate')).toBeTruthy();
    expect(itemPushes('item-hydrate')).toBe(1);
    expect(mockMarkRead).toHaveBeenCalledWith('n-tap-hydrate', 'push');
    await expectBackToBudget();
  });

  it('keeps a tap that iOS delivered before the root layout mounted', async () => {
    mockKeychain.session = 'token';
    deliverTap(priceAlertTap('tap-early', 'item-early'));
    launch('/');

    expect(await screen.findByText('Item item-early')).toBeTruthy();
    expect(itemPushes('item-early')).toBe(1);
    await expectBackToBudget();
  });

  it('drops a tap made while signed out, so whoever signs in next does not open it', async () => {
    useAuthStore.setState({ hydrated: true });
    launch('/onboarding/sign-in');
    deliverTap(priceAlertTap('tap-signin', 'item-signin'));
    expect(itemPushes('item-signin')).toBe(0);

    fireEvent.press(await screen.findByLabelText('Sign in'));

    await settle();
    expect(itemPushes('item-signin')).toBe(0);
    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(screen.getByText('Budget home')).toBeTruthy();

    // A remount reads the tap iOS stored again: it stays dropped.
    await act(async () => deliverTap(priceAlertTap('tap-signin', 'item-signin')));
    await settle();
    expect(itemPushes('item-signin')).toBe(0);
  });

  it('routes a tap once, even when the same response is handed over again', async () => {
    useAuthStore.setState({ hydrated: true, accessToken: 'token' });
    const tap = priceAlertTap('tap-once', 'item-once');
    deliverTap(tap);
    launch('/');
    expect(await screen.findByText('Item item-once')).toBeTruthy();

    // iOS (or a remount reading the native store) hands over the same tap.
    await act(async () => deliverTap(tap));
    await settle();

    expect(itemPushes('item-once')).toBe(1);
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
  });

  it('opens a second, different tap too', async () => {
    useAuthStore.setState({ hydrated: true, accessToken: 'token' });
    deliverTap(priceAlertTap('tap-first', 'item-first'));
    launch('/');
    expect(await screen.findByText('Item item-first')).toBeTruthy();

    await act(async () => deliverTap(priceAlertTap('tap-second', 'item-second')));

    await waitFor(() => expect(screen.getByText('Item item-second')).toBeTruthy());
    expect(itemPushes('item-second')).toBe(1);
  });
});
