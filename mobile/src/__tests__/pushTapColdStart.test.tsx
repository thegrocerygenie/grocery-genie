/**
 * BUG-6 (device check 2026-11-03): a price alert tapped while the app was
 * closed opened the item as the only screen, with no back button and no tab
 * bar. The tap reaches the app at launch, so the push hook routes on its first
 * run. It must route only once the root Stack is mounted, so the item lands
 * on top of the tabs.
 */
import React from 'react';
import { Text } from 'react-native';
import { router, Slot } from 'expo-router';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';

import RootLayout from '../../app/_layout';
import type { UserProfile } from '@/features/auth/types';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncQueue: () => undefined }));

// The tap that launched the app: a price alert for item abc.
const mockLaunchResponse = {
  actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  notification: {
    request: {
      identifier: 'push-1',
      content: {
        data: {
          notification_id: 'n-1',
          type: 'price_change',
          url: '/items/abc',
          canonical_item_id: 'abc',
          store_id: 's-1',
        },
      },
    },
  },
};
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: jest.fn(),
  useLastNotificationResponse: () => mockLaunchResponse,
  clearLastNotificationResponseAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getExpoPushTokenAsync: jest.fn(),
}));
const mockMarkRead = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/notifications/services/pushApi', () => ({
  markNotificationRead: (...args: unknown[]) => mockMarkRead(...args),
  registerPushToken: jest.fn().mockResolvedValue(undefined),
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

it('opens the tapped item on top of the tabs when the tap launched the app', async () => {
  useAuthStore.setState({ hydrated: true, accessToken: 't', refreshToken: 't' });

  renderRouter(
    {
      _layout: RootLayout,
      '(tabs)/_layout': () => <Slot />,
      '(tabs)/index': () => <Text>Budget</Text>,
      'items/[id]': () => <Text>Item</Text>,
    },
    { initialUrl: '/' },
  );

  await waitFor(() => expect(screen.getByText('Item')).toBeTruthy());
  expect(router.canGoBack()).toBe(true);
  expect(mockMarkRead).toHaveBeenCalledWith('n-1', 'push');
});
