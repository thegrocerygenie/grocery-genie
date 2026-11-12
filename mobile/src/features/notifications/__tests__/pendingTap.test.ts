/**
 * DA-14 review: a tap opened before the profile confirmed onboarding
 * (`unconfirmed`) belongs to the account it was sent to. Signing out, or
 * another account signing in, drops it, so a later "onboarding due" for the
 * next account never re-holds and opens it.
 */
import type { NotificationResponse } from 'expo-notifications';

import {
  offerTap,
  settleOnboarding,
  takeTap,
  usePendingTapStore,
} from '@/features/notifications/pendingTap';
import { useAuthStore } from '@/store/authStore';
import { priceAlertTap } from '@/testing/fakeNotifications';

jest.mock('expo-notifications', () =>
  jest.requireActual('@/testing/fakeNotifications').fakeNotificationsModule(),
);
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

/** An access token whose `sub` is `userId`, as the API issues them. */
function tokenFor(userId: string): string {
  return `h.${btoa(JSON.stringify({ sub: userId }))}.s`;
}

/** A price-alert tap, typed as expo-notifications hands it over. */
function tap(identifier: string): NotificationResponse {
  return priceAlertTap(identifier, 'item-a') as unknown as NotificationResponse;
}

beforeEach(async () => {
  usePendingTapStore.setState({ pending: null, unconfirmed: null });
  await useAuthStore.getState().hydrate();
  await useAuthStore.getState().setSession({ accessToken: tokenFor('u-a'), refreshToken: 'r' });
});

describe('an unconfirmed tap and the next account (DA-14 review)', () => {
  it('is dropped on sign-out, so a later account due for onboarding never opens it', async () => {
    offerTap(tap('tap-out-a'));
    expect(takeTap(false)).not.toBeNull();
    expect(usePendingTapStore.getState().unconfirmed).not.toBeNull();

    await useAuthStore.getState().clear();
    await useAuthStore.getState().setSession({ accessToken: tokenFor('u-b'), refreshToken: 'r' });
    settleOnboarding(true);

    expect(usePendingTapStore.getState().pending).toBeNull();
    expect(usePendingTapStore.getState().unconfirmed).toBeNull();
  });

  it('is dropped when another account signs in without a sign-out', async () => {
    offerTap(tap('tap-switch-a'));
    expect(takeTap(false)).not.toBeNull();

    await useAuthStore.getState().setSession({ accessToken: tokenFor('u-b'), refreshToken: 'r' });
    settleOnboarding(true);

    expect(usePendingTapStore.getState().pending).toBeNull();
    expect(usePendingTapStore.getState().unconfirmed).toBeNull();
  });

  it('is kept across a token refresh for the same account', async () => {
    offerTap(tap('tap-refresh-a'));
    expect(takeTap(false)).not.toBeNull();

    await useAuthStore.getState().setSession({ accessToken: tokenFor('u-a'), refreshToken: 'r2' });
    settleOnboarding(true);

    expect(usePendingTapStore.getState().pending).not.toBeNull();
  });
});
