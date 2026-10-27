/**
 * Email deep links. The backend emails `grocerygenie://onboarding/verify-email?token=…`,
 * `grocerygenie://onboarding/reset-password?token=…` and
 * `grocerygenie://onboarding/confirm-email-change?token=…` (backend/app/core/config.py).
 * Each must open its screen with the token, signed in or not. After a good
 * verification or email change, the screen must say so and move the user on.
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import { Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import RootLayout from '../../app/_layout';
import OnboardingLayout from '../../app/onboarding/_layout';
import ConfirmEmailChangeScreen from '../../app/onboarding/confirm-email-change';
import ResetPasswordScreen from '../../app/onboarding/reset-password';
import VerifyEmailScreen from '../../app/onboarding/verify-email';
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
jest.mock('@/features/notifications/hooks/usePushNotifications', () => ({
  usePushNotifications: () => undefined,
}));

function mockProfile(): UserProfile {
  return {
    id: 'u-1',
    email: 'verify@test.com',
    name: 'Verify',
    locale: 'en_US',
    currency_preference: 'USD',
    email_verified_at: null,
    preferences: {
      notification_thresholds: { fifty: false, eighty: true, hundred: true },
      weekly_summary: { enabled: true, day: 0 },
      ocr_languages: [],
    },
    needs_onboarding: false,
  };
}

const mockVerifyEmail = jest.fn<Promise<{ verified_at: string | null }>, [string]>();
const mockConfirmEmailChange = jest.fn<Promise<{ email: string }>, [string]>();
jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: async () => mockProfile(),
  verifyEmail: (token: string) => mockVerifyEmail(token),
  confirmEmailChange: (token: string) => mockConfirmEmailChange(token),
}));

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

function openLink(url: string) {
  return renderRouter(
    {
      _layout: RootLayout,
      '(tabs)/_layout': () => <Slot />,
      '(tabs)/index': () => <Text>Tabs home</Text>,
      'onboarding/_layout': OnboardingLayout,
      'onboarding/index': () => <Text>Welcome</Text>,
      'onboarding/sign-in': () => <Text>Sign in screen</Text>,
      'onboarding/budget': () => <Text>Set Budget screen</Text>,
      'onboarding/verify-email': VerifyEmailScreen,
      'onboarding/reset-password': ResetPasswordScreen,
      'onboarding/confirm-email-change': ConfirmEmailChangeScreen,
      ...otherRoutes,
    },
    { initialUrl: url },
  );
}

function signIn(accessToken: string | null) {
  act(() => {
    useAuthStore.setState({ hydrated: true, accessToken, refreshToken: accessToken });
  });
}

beforeEach(() => {
  mockVerifyEmail.mockReset();
  mockVerifyEmail.mockResolvedValue({ verified_at: '2026-10-27T00:00:00Z' });
  mockConfirmEmailChange.mockReset();
  mockConfirmEmailChange.mockResolvedValue({ email: 'new@test.com' });
});

describe('verify-email link', () => {
  it('opens the verify screen and sends its token', async () => {
    signIn(null);
    const router = openLink('/onboarding/verify-email?token=abc123');

    await waitFor(() => expect(mockVerifyEmail).toHaveBeenCalledWith('abc123'));
    expect(router.getPathname()).toBe('/onboarding/verify-email');
  });

  it('confirms the verification and moves a signed-out user to sign in', async () => {
    signIn(null);
    const router = openLink('/onboarding/verify-email?token=abc123');

    await screen.findByText('Email verified');
    expect(screen.queryByText('Check your email')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByText('Sign in screen');
    expect(router.getPathname()).toBe('/onboarding/sign-in');
  });

  it('confirms the verification and moves a signed-in user into the app', async () => {
    signIn('token');
    const router = openLink('/onboarding/verify-email?token=abc123');

    await screen.findByText('Email verified');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByText('Tabs home');
    expect(router.getPathname()).toBe('/');
  });

  it('stays on Check your email and alerts when the token is bad', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockVerifyEmail.mockRejectedValue(new Error('bad token'));
    signIn(null);
    openLink('/onboarding/verify-email?token=expired');

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Verification failed', expect.any(String)),
    );
    expect(screen.getByText('Check your email')).toBeTruthy();
    expect(screen.queryByText('Email verified')).toBeNull();
    alert.mockRestore();
  });
});

describe('reset-password link', () => {
  it('opens the reset screen for a signed-out user', async () => {
    signIn(null);
    const router = openLink('/onboarding/reset-password?token=t0k');

    await screen.findByLabelText('New password');
    expect(router.getPathname()).toBe('/onboarding/reset-password');
    expect(router.getSearchParams()).toEqual({ token: 't0k' });
  });
});

describe('email-change link', () => {
  it('confirms the change with its token and shows the new email', async () => {
    signIn(null);
    const router = openLink('/onboarding/confirm-email-change?token=chg1');

    await screen.findByText('Email changed');
    expect(mockConfirmEmailChange).toHaveBeenCalledWith('chg1');
    expect(mockConfirmEmailChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/new@test\.com/)).toBeTruthy();
    expect(router.getPathname()).toBe('/onboarding/confirm-email-change');
  });

  it('moves a signed-out user to sign in', async () => {
    signIn(null);
    const router = openLink('/onboarding/confirm-email-change?token=chg1');

    await screen.findByText('Email changed');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByText('Sign in screen');
    expect(router.getPathname()).toBe('/onboarding/sign-in');
  });

  it('moves a signed-in user into the app', async () => {
    signIn('token');
    const router = openLink('/onboarding/confirm-email-change?token=chg1');

    await screen.findByText('Email changed');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByText('Tabs home');
    expect(router.getPathname()).toBe('/');
  });

  it('says the link did not work when the token is bad', async () => {
    mockConfirmEmailChange.mockRejectedValue(new Error('bad token'));
    signIn(null);
    openLink('/onboarding/confirm-email-change?token=expired');

    await screen.findByText('Link not valid');
    expect(screen.queryByText('Email changed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('says the link did not work when it has no token', async () => {
    signIn(null);
    openLink('/onboarding/confirm-email-change');

    await screen.findByText('Link not valid');
    expect(mockConfirmEmailChange).not.toHaveBeenCalled();
  });
});
