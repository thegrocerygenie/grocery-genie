/**
 * DA-14: a launch tap and the onboarding state the device remembers.
 *
 * The profile says whether onboarding is due, and offline it takes ~7 s to
 * give up (DA-13). The device keeps the last answer per account, so an
 * onboarded user's tap opens at once. With no answer kept for the account,
 * the tap still waits for the profile. When a later profile says onboarding
 * is due over an opened item (a stale answer, or the request gave up), the
 * redirect to onboarding does not lose the item: it opens once onboarding is
 * finished.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
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
jest.mock('@/features/notifications/services/pushApi', () => ({
  registerPushToken: jest.fn(async () => undefined),
  markNotificationRead: jest.fn(async () => undefined),
}));

const keychain = (SecureStore as unknown as { __items: Map<string, string> }).__items;
const ONBOARDING_KEY = 'gg.auth.onboarding';

/** An access token whose `sub` is `userId`, as the API issues them. */
function tokenFor(userId: string): string {
  return `h.${btoa(JSON.stringify({ sub: userId }))}.s`;
}

/** A session in the keychain, and what the device last knew about onboarding. */
function storedSession(userId: string, kept?: { userId: string; needsOnboarding: boolean }) {
  keychain.set('gg.auth.access', tokenFor(userId));
  keychain.set('gg.auth.refresh', 'refresh');
  if (kept) keychain.set(ONBOARDING_KEY, JSON.stringify(kept));
}

function profile(needsOnboarding: boolean): UserProfile {
  return {
    id: 'u-1',
    email: 'cache@test.com',
    name: 'Cache',
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

const offline = () => Promise.reject(new TypeError('Network request failed'));
const mockFetchMe = jest.fn<Promise<UserProfile>, []>();
jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: () => mockFetchMe(),
}));

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

async function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    await act(async () => {
      jest.advanceTimersByTime(50);
    });
  }
}

/** A refetch (focus, reconnect) whose answer is `next`. */
async function refetchWith(next: UserProfile) {
  mockFetchMe.mockImplementation(async () => next);
  await act(async () => {
    await client?.refetchQueries({ queryKey: ['auth', 'me'] });
  });
}

let push: jest.SpyInstance;
const itemPushes = (id: string) => push.mock.calls.filter(([h]) => h === `/items/${id}`).length;

beforeEach(() => {
  resetNative();
  keychain.clear();
  mockFetchMe.mockReset();
  useAuthStore.setState({
    hydrated: false,
    accessToken: null,
    refreshToken: null,
    userId: null,
    onboarding: null,
  });
  push = jest.spyOn(router, 'push');
});
afterEach(() => {
  push.mockRestore();
  client?.clear();
});

describe('A launch tap with the onboarding state kept on the device (DA-14)', () => {
  it('keeps the profile’s answer for the signed-in account', async () => {
    storedSession('u-1');
    mockFetchMe.mockImplementation(async () => profile(false));
    launch();
    await advance(500);

    expect(JSON.parse(keychain.get(ONBOARDING_KEY) ?? 'null')).toEqual({
      userId: 'u-1',
      needsOnboarding: false,
    });
  });

  it('opens at once offline when the device knows onboarding is done', async () => {
    storedSession('u-1', { userId: 'u-1', needsOnboarding: false });
    mockFetchMe.mockImplementation(offline);
    deliverTap(priceAlertTap('tap-fast', 'item-fast'));
    launch();

    // Well before the retries give up (~7 s).
    await advance(1_000);
    expect(mockFetchMe.mock.calls.length).toBeLessThan(4);
    expect(await screen.findByText('Item item-fast')).toBeTruthy();
    expect(itemPushes('item-fast')).toBe(1);
    expect(router.canGoBack()).toBe(true);

    await advance(10_000);
    expect(itemPushes('item-fast')).toBe(1);
    expect(usePendingTapStore.getState().pending).toBeNull();
  });

  it('waits for the profile when the device knows nothing for this account', async () => {
    storedSession('u-1');
    mockFetchMe.mockImplementation(offline);
    deliverTap(priceAlertTap('tap-new', 'item-new'));
    launch();

    await advance(6_500);
    expect(itemPushes('item-new')).toBe(0);
    await advance(1_500);
    expect(await screen.findByText('Item item-new')).toBeTruthy();
    expect(itemPushes('item-new')).toBe(1);
  });

  it('waits for the profile when the device remembers onboarding as due', async () => {
    storedSession('u-1', { userId: 'u-1', needsOnboarding: true });
    mockFetchMe.mockImplementation(offline);
    deliverTap(priceAlertTap('tap-due', 'item-due'));
    launch();

    await advance(6_500);
    expect(itemPushes('item-due')).toBe(0);
  });

  it("never uses another account's state: user B waits for the profile", async () => {
    storedSession('u-b', { userId: 'u-a', needsOnboarding: false });
    mockFetchMe.mockImplementation(offline);
    deliverTap(priceAlertTap('tap-b', 'item-b'));
    launch();

    await advance(6_500);
    expect(itemPushes('item-b')).toBe(0);
    await advance(1_500);
    expect(itemPushes('item-b')).toBe(1);
  });

  it('opens the item after onboarding when a stale "done" turns out to be due', async () => {
    storedSession('u-1', { userId: 'u-1', needsOnboarding: false });
    mockFetchMe.mockImplementationOnce(offline).mockImplementation(async () => profile(true));
    deliverTap(priceAlertTap('tap-stale', 'item-stale'));
    launch();

    await advance(200);
    expect(itemPushes('item-stale')).toBe(1);

    // The retry gets through: onboarding is due, and covers the item.
    await advance(2_000);
    expect(await screen.findByText('Set a budget')).toBeTruthy();
    await advance(10_000);
    expect(itemPushes('item-stale')).toBe(1);
    expect(JSON.parse(keychain.get(ONBOARDING_KEY) ?? 'null').needsOnboarding).toBe(true);

    fireEvent.press(screen.getByLabelText('Finish'));
    await advance(500);

    expect(await screen.findByText('Item item-stale')).toBeTruthy();
    expect(itemPushes('item-stale')).toBe(2);
    expect(router.canGoBack()).toBe(true);
    await advance(10_000);
    expect(itemPushes('item-stale')).toBe(2);
  });

  it('opens the item after onboarding when the request gave up and a refetch says due', async () => {
    // The DA-13 reviewer's gap: every retry fails, the item opens, then the
    // profile comes back with onboarding due.
    storedSession('u-1');
    mockFetchMe.mockImplementation(offline);
    deliverTap(priceAlertTap('tap-gap', 'item-gap'));
    launch();

    await advance(8_000);
    expect(await screen.findByText('Item item-gap')).toBeTruthy();
    expect(itemPushes('item-gap')).toBe(1);

    await refetchWith(profile(true));
    await advance(500);
    expect(await screen.findByText('Set a budget')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Finish'));
    await advance(500);

    expect(await screen.findByText('Item item-gap')).toBeTruthy();
    expect(itemPushes('item-gap')).toBe(2);
    await advance(10_000);
    expect(itemPushes('item-gap')).toBe(2);
  });

  it('does not reopen an item the profile then confirms', async () => {
    storedSession('u-1', { userId: 'u-1', needsOnboarding: false });
    mockFetchMe.mockImplementationOnce(offline).mockImplementation(async () => profile(false));
    deliverTap(priceAlertTap('tap-ok', 'item-ok'));
    launch();

    await advance(3_000);
    expect(itemPushes('item-ok')).toBe(1);
    // A later "due" (onboarding reset elsewhere) is not this tap's business.
    await refetchWith(profile(true));
    await advance(500);
    fireEvent.press(screen.getByLabelText('Finish'));
    await advance(500);

    expect(itemPushes('item-ok')).toBe(1);
    expect(screen.getByText('Budget home')).toBeTruthy();
  });

  it('drops an item held for after onboarding when the user signs out', async () => {
    storedSession('u-1', { userId: 'u-1', needsOnboarding: false });
    mockFetchMe.mockImplementationOnce(offline).mockImplementation(async () => profile(true));
    deliverTap(priceAlertTap('tap-so', 'item-so'));
    launch();

    await advance(2_000);
    expect(await screen.findByText('Set a budget')).toBeTruthy();
    expect(itemPushes('item-so')).toBe(1);

    await act(async () => useAuthStore.getState().clear());
    await advance(500);
    expect(keychain.has(ONBOARDING_KEY)).toBe(false);

    // The same account signs in again, already onboarded.
    mockFetchMe.mockImplementation(async () => profile(false));
    await act(async () =>
      useAuthStore.getState().setSession({ accessToken: tokenFor('u-1'), refreshToken: 'r' }),
    );
    await act(async () => {
      await client?.invalidateQueries({ queryKey: ['auth', 'me'] });
    });
    act(() => router.replace('/(tabs)'));
    await advance(1_000);

    expect(itemPushes('item-so')).toBe(1);
    expect(screen.getByText('Budget home')).toBeTruthy();
  });

  it('drops an item held for after onboarding when another account signs in', async () => {
    storedSession('u-1', { userId: 'u-1', needsOnboarding: false });
    mockFetchMe.mockImplementationOnce(offline).mockImplementation(async () => profile(true));
    deliverTap(priceAlertTap('tap-sw', 'item-sw'));
    launch();

    await advance(2_000);
    expect(await screen.findByText('Set a budget')).toBeTruthy();

    mockFetchMe.mockImplementation(async () => profile(false));
    await act(async () =>
      useAuthStore.getState().setSession({ accessToken: tokenFor('u-2'), refreshToken: 'r' }),
    );
    await act(async () => {
      await client?.invalidateQueries({ queryKey: ['auth', 'me'] });
    });
    act(() => router.replace('/(tabs)'));
    await advance(1_000);

    expect(itemPushes('item-sw')).toBe(1);
    expect(screen.getByText('Budget home')).toBeTruthy();
  });
});
