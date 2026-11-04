/**
 * The root layout anchors the tabs under any screen the app starts on (BUG-6).
 * A signed-out email link (reset password) starts on an onboarding screen, so
 * the tabs sit under it. They must render nothing until someone signs in:
 * a mounted Budget tab called the API with no token and got 401s.
 */
import React from 'react';
import { Text } from 'react-native';
import { Slot } from 'expo-router';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';

import RootLayout, { unstable_settings } from '../../app/_layout';
import TabsLayout from '../../app/(tabs)/_layout';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('expo-blur', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    BlurView: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView>,
  };
});
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncQueue: () => undefined }));
jest.mock('@/features/notifications/hooks/usePushNotifications', () => ({
  usePushNotifications: () => undefined,
}));
const mockTimeZoneSync = jest.fn();
jest.mock('@/hooks/useTimeZoneSync', () => ({ useTimeZoneSync: () => mockTimeZoneSync() }));
const mockBudgetMounted = jest.fn();
function BudgetTab() {
  mockBudgetMounted();
  return <Text>Budget tab</Text>;
}

it('keeps the anchored tabs empty under a signed-out email link', async () => {
  useAuthStore.setState({ hydrated: true, accessToken: null, refreshToken: null });

  renderRouter(
    {
      _layout: { default: RootLayout, unstable_settings },
      '(tabs)/_layout': TabsLayout,
      '(tabs)/(budget)/_layout': () => <Slot />,
      '(tabs)/(budget)/index': BudgetTab,
      '(tabs)/scan': () => null,
      '(tabs)/history': () => null,
      'onboarding/_layout': () => <Slot />,
      'onboarding/reset-password': () => <Text>Reset password screen</Text>,
    },
    { initialUrl: '/onboarding/reset-password?token=t' },
  );

  await waitFor(() => expect(screen.getByText('Reset password screen')).toBeTruthy());
  expect(mockBudgetMounted).not.toHaveBeenCalled();
  expect(mockTimeZoneSync).not.toHaveBeenCalled();
});
