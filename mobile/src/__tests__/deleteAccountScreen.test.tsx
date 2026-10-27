/**
 * Settings → Delete account (App Store 5.1.1(v)): says what is erased, asks
 * once more in a destructive alert, then deletes and leaves for onboarding.
 */
import React from 'react';
import { Alert, StyleSheet, type AlertButton, type ViewStyle } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import DeleteAccountScreen from '../../app/settings/delete-account';
import { AppleReauthCancelledError } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/services/api';

const mockMutateAsync = jest.fn();
let mockIsPending = false;
jest.mock('@/features/auth/hooks/useAuth', () => {
  class AppleReauthCancelledError extends Error {}
  return {
    AppleReauthCancelledError,
    useDeleteAccount: () => ({ mutateAsync: mockMutateAsync, isPending: mockIsPending }),
  };
});

function renderScreen() {
  const routerScreen = renderRouter(
    {
      _layout: () => <Stack />,
      index: () => null,
      onboarding: () => null,
      'settings/delete-account': DeleteAccountScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push('/settings/delete-account'));
  return routerScreen;
}

/** Press the Delete button and return the alert's destructive button. */
function pressDelete(): AlertButton {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  fireEvent.press(screen.getByLabelText('Delete account'));
  const buttons = alert.mock.calls[0][2] ?? [];
  const destructive = buttons.find((b) => b.style === 'destructive');
  if (!destructive) throw new Error('no destructive button');
  return destructive;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPending = false;
});

afterEach(() => jest.restoreAllMocks());

describe('Delete account screen', () => {
  it('says what is erased and that it cannot be undone', () => {
    renderScreen();

    expect(screen.getByText(/receipts and their photos/i)).toBeTruthy();
    expect(screen.getByText(/budgets/i)).toBeTruthy();
    expect(screen.getByText(/can’t be undone/i)).toBeTruthy();
  });

  it('asks to confirm and deletes nothing until confirmed', () => {
    renderScreen();

    pressDelete();

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('on confirm, deletes the account and goes to onboarding', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    const routerScreen = renderScreen();

    await act(async () => {
      await pressDelete().onPress?.();
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(routerScreen.getPathname()).toBe('/onboarding'));
  });

  it('on failure, stays and says the account was not deleted', async () => {
    mockMutateAsync.mockRejectedValue(new Error('offline'));
    const routerScreen = renderScreen();

    await act(async () => {
      await pressDelete().onPress?.();
    });

    expect(routerScreen.getPathname()).toBe('/settings/delete-account');
    expect(screen.getByText(/your account was not deleted/i)).toBeTruthy();
  });

  it('tells Sign in with Apple users they will confirm with Apple', () => {
    renderScreen();

    expect(screen.getByText(/confirm with Apple/i)).toBeTruthy();
  });

  it.each([
    [new AppleReauthCancelledError('cancelled'), /confirm with Apple to delete/i],
    [
      new ApiError(403, { detail: { code: 'apple_account_mismatch', message: 'x' } }),
      /different Apple ID/i,
    ],
    [
      new ApiError(502, { detail: { code: 'apple_revoke_failed', message: 'x' } }),
      /couldn’t reach Apple/i,
    ],
  ])('explains a failed Apple step (%#)', async (error, message) => {
    mockMutateAsync.mockRejectedValue(error);
    renderScreen();

    await act(async () => {
      await pressDelete().onPress?.();
    });

    expect(screen.getByText(/your account was not deleted/i)).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
  });

  it('lets the Delete button grow with large text instead of clipping its label', () => {
    renderScreen();

    const style = StyleSheet.flatten(
      screen.getByLabelText('Delete account', { exact: true }).props.style,
    ) as ViewStyle;
    expect(style.height).toBeUndefined();
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });
});
