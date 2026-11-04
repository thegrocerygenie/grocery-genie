/**
 * V11-P0 (D1): the Premium paywall. It buys and restores through RevenueCat,
 * then shows Premium only once the backend says so (`is_premium`), never from
 * the purchase alone.
 */
import React from 'react';
import { Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import PaywallScreen from '../../app/paywall';
import type { UserProfile } from '@/features/auth/types';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

const mockFetchMe = jest.fn();
jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: () => mockFetchMe(),
}));

const mockRefreshPremium = jest.fn();
jest.mock('@/features/premium/services/premiumApi', () => ({
  refreshPremium: () => mockRefreshPremium(),
}));

const offer = { priceString: '$5.99', pkg: { identifier: '$rc_monthly' } };
const mockAvailable = jest.fn(() => true);
const mockGetOffer = jest.fn();
const mockPurchase = jest.fn();
const mockRestore = jest.fn();
jest.mock('@/features/premium/services/purchases', () => ({
  isPurchasesAvailable: () => mockAvailable(),
  getPremiumOffer: (...a: unknown[]) => mockGetOffer(...a),
  purchasePremium: (...a: unknown[]) => mockPurchase(...a),
  restorePremium: (...a: unknown[]) => mockRestore(...a),
}));

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u-1',
    email: 'sam@example.com',
    name: 'Sam',
    locale: 'en',
    currency_preference: 'USD',
    email_verified_at: null,
    preferences: {
      notification_thresholds: { fifty: false, eighty: true, hundred: true },
      weekly_summary: { enabled: true, day: 0 },
      ocr_languages: [],
    },
    is_premium: false,
    premium_expires_at: null,
    ...over,
  };
}

const premiumProfile = profile({ is_premium: true, premium_expires_at: '2026-12-04T10:00:00Z' });

function renderPaywall() {
  renderRouter(
    {
      _layout: () => {
        const { Stack } = jest.requireActual('expo-router');
        return (
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <Stack />
          </QueryClientProvider>
        );
      },
      paywall: PaywallScreen,
      'settings/privacy': () => null,
    },
    { initialUrl: '/paywall' },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ accessToken: 'token' });
  mockAvailable.mockReturnValue(true);
  mockFetchMe.mockResolvedValue(profile());
  mockGetOffer.mockResolvedValue(offer);
});

describe('Paywall', () => {
  it('shows what Premium unlocks and the App Store price', async () => {
    renderPaywall();
    expect(await screen.findByLabelText('Subscribe for $5.99/month')).toBeTruthy();
    expect(screen.getByText('12-month spending trend')).toBeTruthy();
    expect(screen.getByText('Unlimited receipts')).toBeTruthy();
    expect(screen.getByText('Your own categories')).toBeTruthy();
    expect(screen.getByText('Export your data')).toBeTruthy();
    expect(screen.getByText(/stay free/)).toBeTruthy();
    expect(screen.getByLabelText('Restore Purchases')).toBeTruthy();
    expect(screen.getByLabelText('Terms of Use')).toBeTruthy();
    expect(screen.getByLabelText('Privacy Policy')).toBeTruthy();
    expect(mockGetOffer).toHaveBeenCalledWith('u-1');
  });

  it('subscribing asks the backend and shows Premium once it says so', async () => {
    mockPurchase.mockResolvedValue({ kind: 'purchased' });
    mockRefreshPremium.mockResolvedValue(premiumProfile);
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Subscribe for $5.99/month'));

    expect(await screen.findByText('You’re on Premium')).toBeTruthy();
    expect(mockPurchase).toHaveBeenCalledWith('u-1', offer);
    expect(mockRefreshPremium).toHaveBeenCalled();
  });

  it('a purchase the backend has not seen yet says Premium is on its way, not active', async () => {
    mockPurchase.mockResolvedValue({ kind: 'purchased' });
    mockRefreshPremium.mockRejectedValue(new Error('503'));
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Subscribe for $5.99/month'));

    expect(
      await screen.findByText('Purchase complete. Premium turns on in a moment.'),
    ).toBeTruthy();
    expect(screen.queryByText('You’re on Premium')).toBeNull();
  });

  it('a cancelled purchase shows nothing alarming', async () => {
    mockPurchase.mockResolvedValue({ kind: 'cancelled' });
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Subscribe for $5.99/month'));

    await waitFor(() => expect(mockPurchase).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockRefreshPremium).not.toHaveBeenCalled();
  });

  it('a failed purchase says so inline', async () => {
    mockPurchase.mockResolvedValue({ kind: 'failed', message: 'declined' });
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Subscribe for $5.99/month'));

    expect(
      await screen.findByText('The purchase didn’t go through. You weren’t charged.'),
    ).toBeTruthy();
  });

  it('restore purchases asks the backend and shows Premium', async () => {
    mockRestore.mockResolvedValue({ kind: 'restored' });
    mockRefreshPremium.mockResolvedValue(premiumProfile);
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Restore Purchases'));

    expect(await screen.findByText('You’re on Premium')).toBeTruthy();
    expect(mockRestore).toHaveBeenCalledWith('u-1');
  });

  it('restore with no subscription on the Apple ID says so', async () => {
    mockRestore.mockResolvedValue({ kind: 'restored' });
    mockRefreshPremium.mockResolvedValue(profile());
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Restore Purchases'));

    expect(
      await screen.findByText('No Premium subscription was found for this Apple ID.'),
    ).toBeTruthy();
  });

  it('restore when the backend cannot check (503) shows an error, not the no-subscription message', async () => {
    mockRestore.mockResolvedValue({ kind: 'restored' });
    mockRefreshPremium.mockRejectedValue(new Error('503'));
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Restore Purchases'));

    const alert = await screen.findByRole('alert');
    expect(alert.props.children).toBe(
      'Couldn’t check your subscription right now. Try Restore Purchases again in a moment.',
    );
    expect(screen.queryByText('No Premium subscription was found for this Apple ID.')).toBeNull();
    expect(screen.queryByText('You’re on Premium')).toBeNull();
  });

  it('the price reads as a monthly price to VoiceOver', async () => {
    renderPaywall();
    expect(await screen.findByLabelText('$5.99 a month')).toBeTruthy();
  });

  it('a Premium user sees the plan and a way to manage it, not a purchase button', async () => {
    mockFetchMe.mockResolvedValue(premiumProfile);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderPaywall();

    expect(await screen.findByText('You’re on Premium')).toBeTruthy();
    expect(screen.queryByLabelText('Subscribe for $5.99/month')).toBeNull();
    fireEvent.press(screen.getByLabelText('Manage Subscription'));
    expect(open).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
  });

  it('in Expo Go it explains purchases need the App Store build', async () => {
    mockAvailable.mockReturnValue(false);
    renderPaywall();

    expect(await screen.findByText(/Purchases need the App Store version/)).toBeTruthy();
    expect(screen.queryByLabelText(/Subscribe for/)).toBeNull();
    expect(mockGetOffer).not.toHaveBeenCalled();
  });

  it('when the offer cannot load it offers a retry', async () => {
    mockGetOffer.mockResolvedValueOnce(null).mockResolvedValueOnce(offer);
    renderPaywall();

    fireEvent.press(await screen.findByLabelText('Try Again'));
    expect(await screen.findByLabelText('Subscribe for $5.99/month')).toBeTruthy();
  });
});
