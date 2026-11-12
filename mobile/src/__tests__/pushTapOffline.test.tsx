/**
 * BUG-6 review (DA-12, DA-13): a launch tap waits for the profile, which says
 * whether the user still needs onboarding. Offline, the profile request fails
 * like a network error and TanStack Query retries it (three retries, 1 s, 2 s
 * and 4 s apart), so the tap opens only once the request gives up, about 7 s
 * in. These tests pin that path: the tap is not lost, it opens once, it does
 * not open over onboarding when a retry gets through, and signing out while
 * the request is still retrying drops it.
 *
 * These launches have no onboarding state remembered on the device (DA-14),
 * so the tap still waits for the profile. pushTapOnboardingCache.test.tsx
 * covers the remembered state.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { router, Slot, useLocalSearchParams } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import RootLayout from '../../app/_layout';
import type { UserProfile } from '@/features/auth/types';
import { usePendingTapStore } from '@/features/notifications/pendingTap';
import { useAuthStore } from '@/store/authStore';
import { deliverTap, priceAlertTap, resetNative } from '@/testing/fakeNotifications';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncQueue: () => undefined }));
jest.mock('expo-notifications', () =>
  jest.requireActual('@/testing/fakeNotifications').fakeNotificationsModule(),
);

// A stored session, read from the keychain on launch.
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async (key: string) => {
    if (key === 'gg.auth.access') return 'token';
    if (key === 'gg.auth.refresh') return 'refresh';
    if (key === 'gg.auth.user') return 'u-1';
    return null;
  }),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@/features/notifications/services/pushApi', () => ({
  registerPushToken: jest.fn(async () => undefined),
  markNotificationRead: jest.fn(async () => undefined),
}));

function profile(needsOnboarding: boolean): UserProfile {
  return {
    id: 'u-1',
    email: 'offline@test.com',
    name: 'Offline',
    locale: 'en_US',
    currency_preference: 'USD',
    email_verified_at: '2026-10-27T00:00:00Z',
    preferences: {
      notification_thresholds: { fifty: false, eighty: true, hundred: true },
      weekly_summary: { enabled: true, day: 0 },
      ocr_languages: [],
    },
    needs_onboarding: needsOnboarding,
  };
}

// What fetch throws with no connection; apiClient lets it through.
const offline = () => Promise.reject(new TypeError('Network request failed'));
const mockFetchMe = jest.fn<Promise<UserProfile>, []>();
jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: () => mockFetchMe(),
}));

// The root layout keeps one QueryClient for the app's life; each test starts
// from an empty profile cache, as a launch does.
let client: QueryClient | null = null;
function BudgetHome() {
  client = useQueryClient();
  return <Text>Budget home</Text>;
}

function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`Item ${id}`}</Text>;
}

// The last onboarding step, as onboarding/camera.tsx ends it.
function FinishOnboarding() {
  const qc = useQueryClient();
  client = qc;
  const finish = async () => {
    mockFetchMe.mockImplementation(async () => profile(false));
    await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    router.replace('/(tabs)');
  };
  return (
    <Pressable accessibilityLabel="Finish" onPress={() => void finish()}>
      <Text>Set a budget</Text>
    </Pressable>
  );
}

function launch() {
  return renderRouter(
    {
      _layout: RootLayout,
      '(tabs)/_layout': () => <Slot />,
      '(tabs)/index': BudgetHome,
      'onboarding/_layout': () => <Slot />,
      'onboarding/index': () => <Text>Welcome</Text>,
      'onboarding/budget': FinishOnboarding,
      'items/[id]': ItemScreen,
    },
    { initialUrl: '/' },
  );
}

// renderRouter runs on fake timers: move the clock in small steps so promises
// and the retry timers play out in order.
async function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    await act(async () => {
      jest.advanceTimersByTime(50);
    });
  }
}

let push: jest.SpyInstance;
const itemPushes = (id: string) => push.mock.calls.filter(([h]) => h === `/items/${id}`).length;

beforeEach(() => {
  resetNative();
  mockFetchMe.mockReset();
  useAuthStore.setState({ hydrated: false, accessToken: null, refreshToken: null, userId: null });
  push = jest.spyOn(router, 'push');
});
afterEach(() => {
  push.mockRestore();
  client?.clear();
});

describe('A launch tap while offline (BUG-6 review, DA-13)', () => {
  it('opens the item once, after the profile request gives up', async () => {
    mockFetchMe.mockImplementation(offline);
    deliverTap(priceAlertTap('tap-off', 'item-off'));
    launch();

    // Retries run 1 s, 2 s and 4 s apart: still waiting at 6.5 s.
    await advance(6_500);
    expect(mockFetchMe.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(itemPushes('item-off')).toBe(0);
    expect(screen.queryByText('Item item-off')).toBeNull();

    await advance(1_500);
    expect(mockFetchMe).toHaveBeenCalledTimes(4);
    expect(await screen.findByText('Item item-off')).toBeTruthy();
    expect(itemPushes('item-off')).toBe(1);
    expect(router.canGoBack()).toBe(true);
    // Opened means handed over: nothing is still held to open again.
    expect(usePendingTapStore.getState().pending).toBeNull();

    // Back online, the profile confirms onboarding is done: no second push.
    mockFetchMe.mockImplementation(async () => profile(false));
    await act(async () => {
      await client?.refetchQueries({ queryKey: ['auth', 'me'] });
    });
    await advance(10_000);
    expect(itemPushes('item-off')).toBe(1);
  });

  it('waits through onboarding when a retry gets through and onboarding is due', async () => {
    mockFetchMe
      .mockImplementationOnce(offline)
      .mockImplementationOnce(offline)
      .mockImplementation(async () => profile(true));
    deliverTap(priceAlertTap('tap-onb', 'item-onb'));
    launch();

    await advance(4_000);
    expect(mockFetchMe).toHaveBeenCalledTimes(3);
    expect(await screen.findByText('Set a budget')).toBeTruthy();
    await advance(10_000);
    expect(itemPushes('item-onb')).toBe(0);

    fireEvent.press(screen.getByLabelText('Finish'));
    await advance(500);

    expect(await screen.findByText('Item item-onb')).toBeTruthy();
    expect(itemPushes('item-onb')).toBe(1);
    await advance(10_000);
    expect(itemPushes('item-onb')).toBe(1);
  });

  it('drops the tap when the user signs out while the profile request is retrying', async () => {
    mockFetchMe.mockImplementation(offline);
    deliverTap(priceAlertTap('tap-out', 'item-out'));
    launch();

    await advance(2_000);
    expect(itemPushes('item-out')).toBe(0);
    await act(async () => useAuthStore.setState({ accessToken: null, userId: null }));

    // The request gives up while signed out, then the same account signs in.
    await advance(10_000);
    mockFetchMe.mockImplementation(async () => profile(false));
    await act(async () => useAuthStore.setState({ accessToken: 'token', userId: 'u-1' }));
    await act(async () => {
      await client?.invalidateQueries({ queryKey: ['auth', 'me'] });
    });
    act(() => router.replace('/(tabs)'));
    await advance(1_000);

    expect(itemPushes('item-out')).toBe(0);
    expect(screen.getByText('Budget home')).toBeTruthy();
  });

  it('opens the item once when the profile request fails and a refetch then succeeds', async () => {
    mockFetchMe.mockImplementation(offline);
    deliverTap(priceAlertTap('tap-twice', 'item-twice'));
    launch();

    await advance(8_000);
    expect(await screen.findByText('Item item-twice')).toBeTruthy();
    expect(itemPushes('item-twice')).toBe(1);

    // Back online: a refetch (focus, reconnect) gets the profile, slowly, so
    // the app renders while it is in flight and again when it lands.
    let answer = (_: UserProfile) => {};
    mockFetchMe.mockImplementation(
      () =>
        new Promise<UserProfile>((resolve) => {
          answer = resolve;
        }),
    );
    act(() => void client?.refetchQueries({ queryKey: ['auth', 'me'] }));
    await advance(500);
    expect(itemPushes('item-twice')).toBe(1);
    await act(async () => answer(profile(false)));
    await advance(2_000);

    expect(mockFetchMe).toHaveBeenCalledTimes(5);
    expect(itemPushes('item-twice')).toBe(1);
    expect(screen.getByText('Item item-twice')).toBeTruthy();
  });
});
