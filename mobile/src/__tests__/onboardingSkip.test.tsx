/**
 * Onboarding Skip: a user who skips Set Budget and taps "Not now" on the
 * camera screen finishes onboarding with no budget. The root layout's gate
 * must then leave them on the tabs instead of sending them back to Set Budget.
 */
import React from 'react';
import { Text } from 'react-native';
import { Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import RootLayout from '../../app/_layout';
import OnboardingLayout from '../../app/onboarding/_layout';
import OnboardingCamera from '../../app/onboarding/camera';
import type { UserProfile } from '@/features/auth/types';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));
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

// A fake server: a user with no budget needs onboarding until they complete it.
const mockServer = { completed: false };

function mockProfile(): UserProfile {
  return {
    id: 'u-1',
    email: 'skip@test.com',
    name: 'Skip',
    locale: 'en_US',
    currency_preference: 'USD',
    email_verified_at: null,
    preferences: {
      notification_thresholds: { fifty: false, eighty: true, hundred: true },
      weekly_summary: { enabled: true, day: 0 },
      ocr_languages: [],
    },
    needs_onboarding: !mockServer.completed,
  };
}

const mockFetchMe = jest.fn(async () => mockProfile());
const mockCompleteOnboarding = jest.fn(async () => {
  mockServer.completed = true;
  return mockProfile();
});

jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: () => mockFetchMe(),
  completeOnboarding: () => mockCompleteOnboarding(),
}));

// The other screens app/_layout.tsx declares, so its Stack finds each one.
const otherRoutes = Object.fromEntries(
  [
    'review',
    'budget-settings',
    'notification-settings',
    'settings',
    'language-settings',
    'manual-entry',
    'top-items',
    'trend',
    'email-change',
    'recently-deleted',
  ].map((name) => [name, () => null]),
);

describe('Onboarding Skip → Not now', () => {
  beforeEach(() => {
    mockServer.completed = false;
    act(() => {
      useAuthStore.setState({ hydrated: true, accessToken: 'token', refreshToken: 'refresh' });
    });
  });

  it('lands on the tabs and stays there', async () => {
    const router = renderRouter(
      {
        _layout: RootLayout,
        '(tabs)/_layout': () => <Slot />,
        '(tabs)/index': () => <Text>Tabs home</Text>,
        'onboarding/_layout': OnboardingLayout,
        'onboarding/budget': () => <Text>Set Budget screen</Text>,
        'onboarding/camera': OnboardingCamera,
        ...otherRoutes,
      },
      // Skip on Set Budget pushes the camera screen without saving a budget.
      { initialUrl: '/onboarding/camera' },
    );

    // The gate has loaded /me, which says this user still needs onboarding.
    await waitFor(() => expect(mockFetchMe).toHaveBeenCalled());
    await act(async () => {});

    fireEvent.press(screen.getByText('Not now'));

    await screen.findByText('Tabs home');
    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(router.getPathname()).toBe('/');
    expect(screen.queryByText('Set Budget screen')).toBeNull();
  });
});
