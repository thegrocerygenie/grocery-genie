/**
 * BUG-6 review (DA-12): a tap that launches the app for a user who still needs
 * onboarding opened the item, and the root layout's needs_onboarding redirect
 * then replaced it. The tap is held until onboarding ends, then opens once.
 * A held tap belongs to the user it was sent to: signing out, or another
 * account signing in, drops it.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { router, Slot, useLocalSearchParams } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import RootLayout from '../../app/_layout';
import type { UserProfile } from '@/features/auth/types';
import { useAuthStore } from '@/store/authStore';
import { deliverTap, priceAlertTap, resetNative } from '@/testing/fakeNotifications';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncQueue: () => undefined }));
jest.mock('expo-notifications', () =>
  jest.requireActual('@/testing/fakeNotifications').fakeNotificationsModule(),
);
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@/features/notifications/services/pushApi', () => ({
  registerPushToken: jest.fn(async () => undefined),
  markNotificationRead: jest.fn(async () => undefined),
}));

const mockProfile = { needsOnboarding: true };
jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: async (): Promise<UserProfile> => ({
    id: 'u-1',
    email: 'new@test.com',
    name: 'New',
    locale: 'en_US',
    currency_preference: 'USD',
    email_verified_at: null,
    preferences: {
      notification_thresholds: { fifty: false, eighty: true, hundred: true },
      weekly_summary: { enabled: true, day: 0 },
      ocr_languages: [],
    },
    needs_onboarding: mockProfile.needsOnboarding,
  }),
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

// The last onboarding step, as onboarding/camera.tsx ends it: the server
// stops asking, the profile refetches, and the tabs replace onboarding.
function FinishOnboarding() {
  const qc = useQueryClient();
  client = qc;
  const finish = async () => {
    mockProfile.needsOnboarding = false;
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

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      jest.advanceTimersByTime(50);
    });
  }
}

let push: jest.SpyInstance;
const itemPushes = (id: string) => push.mock.calls.filter(([h]) => h === `/items/${id}`).length;

beforeEach(() => {
  resetNative();
  mockProfile.needsOnboarding = true;
  useAuthStore.setState({ hydrated: true, accessToken: 'token', userId: 'u-1' });
  push = jest.spyOn(router, 'push');
});
afterEach(() => {
  push.mockRestore();
  client?.clear();
});

describe('A launch tap for a user still in onboarding (BUG-6 review)', () => {
  it('waits for onboarding to end, then opens the item once', async () => {
    deliverTap(priceAlertTap('tap-onb', 'item-onb'));
    launch();

    expect(await screen.findByText('Set a budget')).toBeTruthy();
    await settle();
    expect(itemPushes('item-onb')).toBe(0);

    fireEvent.press(screen.getByLabelText('Finish'));
    await settle();

    expect(await screen.findByText('Item item-onb')).toBeTruthy();
    expect(itemPushes('item-onb')).toBe(1);
    expect(router.canGoBack()).toBe(true);
  });

  it('drops a held tap when the user signs out', async () => {
    deliverTap(priceAlertTap('tap-out', 'item-out'));
    launch();
    expect(await screen.findByText('Set a budget')).toBeTruthy();

    await act(async () => useAuthStore.setState({ accessToken: null, userId: null }));
    mockProfile.needsOnboarding = false;
    await act(async () => useAuthStore.setState({ accessToken: 'other', userId: 'u-2' }));
    // Sign-in refetches the profile: the new account is done with onboarding.
    await act(async () => {
      await client?.invalidateQueries({ queryKey: ['auth', 'me'] });
    });
    act(() => router.replace('/(tabs)'));
    await settle();

    expect(itemPushes('item-out')).toBe(0);
    expect(screen.getByText('Budget home')).toBeTruthy();
  });

  it('drops a held tap when another account signs in', async () => {
    deliverTap(priceAlertTap('tap-switch', 'item-switch'));
    launch();
    expect(await screen.findByText('Set a budget')).toBeTruthy();

    mockProfile.needsOnboarding = false;
    await act(async () => useAuthStore.setState({ accessToken: 'other', userId: 'u-2' }));
    // Sign-in refetches the profile: the new account is done with onboarding.
    await act(async () => {
      await client?.invalidateQueries({ queryKey: ['auth', 'me'] });
    });
    act(() => router.replace('/(tabs)'));
    await settle();

    expect(itemPushes('item-switch')).toBe(0);
    expect(screen.getByText('Budget home')).toBeTruthy();
  });
});
