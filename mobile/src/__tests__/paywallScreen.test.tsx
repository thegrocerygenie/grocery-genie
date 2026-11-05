/**
 * V11-P0 (D1) and PREM-01 (D7): the Premium paywall. Yearly and Monthly from
 * the RevenueCat offering (mocked here), with the 7-day trial when the App
 * Store allows it. It buys and restores through RevenueCat, then shows
 * Premium only once the backend says so (`is_premium`), never from the
 * purchase alone.
 */
import React from 'react';
import { Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

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

const yearly = {
  kind: 'yearly',
  priceString: '$39.99',
  price: 39.99,
  currencyCode: 'USD',
  trialDays: 7 as number | null,
  pkg: { identifier: '$rc_annual' },
};
const monthly = {
  kind: 'monthly',
  priceString: '$4.99',
  price: 4.99,
  currencyCode: 'USD',
  trialDays: 7 as number | null,
  pkg: { identifier: '$rc_monthly' },
};
const offer = { plans: [yearly, monthly] };
const noTrial = {
  plans: [
    { ...yearly, trialDays: null },
    { ...monthly, trialDays: null },
  ],
};
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

function renderPaywall({ from }: { from?: string } = {}) {
  const view = renderRouter(
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
      index: () => null,
      paywall: PaywallScreen,
      'settings/privacy': () => null,
    },
    { initialUrl: from ?? '/paywall' },
  );
  if (from) act(() => router.push('/paywall'));
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ accessToken: 'token' });
  mockAvailable.mockReturnValue(true);
  mockFetchMe.mockResolvedValue(profile());
  mockGetOffer.mockResolvedValue(offer);
});

const TRIAL = 'Start 7-day free trial';

describe('Paywall', () => {
  it('PREM-01 AC 1: Yearly first and selected, with its monthly price and the saving, then Monthly', async () => {
    renderPaywall();
    const year = await screen.findByLabelText('Yearly, $39.99 a year, $3.33 a month, save 33%');
    const month = screen.getByLabelText('Monthly, $4.99 a month');
    expect(year.props.accessibilityState).toMatchObject({ checked: true });
    expect(month.props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText('SAVE 33%')).toBeTruthy();
    expect(screen.getByText('/yr · $3.33/mo')).toBeTruthy();
    expect(screen.getByText('$39.99')).toBeTruthy();
    expect(screen.getByText('$4.99')).toBeTruthy();
    expect(mockGetOffer).toHaveBeenCalledWith('u-1');

    fireEvent.press(month);
    expect(screen.getByLabelText('Monthly, $4.99 a month').props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it('PREM-01 AC 1: prices and the saving come from the App Store, never hard-coded', async () => {
    mockGetOffer.mockResolvedValue({
      plans: [
        { ...yearly, priceString: '€49,99', price: 49.99, currencyCode: 'EUR' },
        { ...monthly, priceString: '€5,99', price: 5.99, currencyCode: 'EUR' },
      ],
    });
    renderPaywall();
    expect(await screen.findByText('SAVE 30%')).toBeTruthy();
    expect(screen.getByText('€49,99')).toBeTruthy();
    expect(screen.getByText('€5,99')).toBeTruthy();
  });

  it('PREM-01 AC 2, EC-PREM 1: an eligible user starts the 7-day trial on either plan', async () => {
    renderPaywall();
    expect(await screen.findByLabelText(TRIAL)).toBeTruthy();
    expect(screen.getByText(/7 days free, then \$39\.99\/year/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Monthly, $4.99 a month'));
    expect(screen.getByLabelText(TRIAL)).toBeTruthy();
    expect(screen.getByText(/7 days free, then \$4\.99\/month/)).toBeTruthy();
    expect(screen.getByLabelText('Terms of Use')).toBeTruthy();
    expect(screen.getByLabelText('Privacy Policy')).toBeTruthy();
  });

  it('PREM-01 AC 2, EC-PREM 1: a user the App Store says cannot take the trial sees Subscribe', async () => {
    mockGetOffer.mockResolvedValue(noTrial);
    renderPaywall();
    expect(await screen.findByLabelText('Subscribe')).toBeTruthy();
    expect(screen.queryByLabelText(TRIAL)).toBeNull();
    expect(screen.queryByText(/days free/)).toBeNull();
    expect(screen.getByText(/Billed \$39\.99 a year/)).toBeTruthy();
  });

  it('PREM-01 AC 3: the design look, × close, title, subtitle, cancel anytime and restore', async () => {
    const view = renderPaywall({ from: '/' });
    await screen.findByLabelText(TRIAL);
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('Unlock the full power of your receipts.')).toBeTruthy();
    expect(screen.getByText(/Cancel anytime/)).toBeTruthy();
    expect(screen.getByLabelText('Restore purchase')).toBeTruthy();
    expect(screen.getByLabelText('Close')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close'));
    await waitFor(() => expect(view.getPathname()).toBe('/'));
  });

  it('PREM-01 AC 4: the feature list names what is built, with unlimited receipts and rollover', async () => {
    renderPaywall();
    await screen.findByLabelText(TRIAL);
    for (const title of [
      'Cross-store comparison',
      'Custom categories',
      'Data export · CSV/JSON/PDF',
      '12-month trends',
      'Per-item & per-store mute',
      'Unlimited receipts',
      'Budget rollover',
      'Priority OCR processing',
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText('Price history and price alerts stay free.')).toBeTruthy();
  });

  it('subscribing buys the selected plan, asks the backend and shows Premium once it says so', async () => {
    mockPurchase.mockResolvedValue({ kind: 'purchased' });
    mockRefreshPremium.mockResolvedValue(premiumProfile);
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Monthly, $4.99 a month'));
    fireEvent.press(screen.getByLabelText(TRIAL));

    expect(await screen.findByText('You’re on Premium')).toBeTruthy();
    expect(mockPurchase).toHaveBeenCalledWith('u-1', monthly);
    expect(mockRefreshPremium).toHaveBeenCalled();
  });

  it('the yearly plan is bought when it stays selected', async () => {
    mockPurchase.mockResolvedValue({ kind: 'cancelled' });
    renderPaywall();
    fireEvent.press(await screen.findByLabelText(TRIAL));
    await waitFor(() => expect(mockPurchase).toHaveBeenCalledWith('u-1', yearly));
  });

  it('a purchase the backend has not seen yet says Premium is on its way, not active', async () => {
    mockPurchase.mockResolvedValue({ kind: 'purchased' });
    mockRefreshPremium.mockRejectedValue(new Error('503'));
    renderPaywall();
    fireEvent.press(await screen.findByLabelText(TRIAL));

    expect(
      await screen.findByText('Purchase complete. Premium turns on in a moment.'),
    ).toBeTruthy();
    expect(screen.queryByText('You’re on Premium')).toBeNull();
  });

  it('a cancelled purchase shows nothing alarming', async () => {
    mockPurchase.mockResolvedValue({ kind: 'cancelled' });
    renderPaywall();
    fireEvent.press(await screen.findByLabelText(TRIAL));

    await waitFor(() => expect(mockPurchase).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockRefreshPremium).not.toHaveBeenCalled();
  });

  it('a failed purchase says so inline', async () => {
    mockPurchase.mockResolvedValue({ kind: 'failed', message: 'declined' });
    renderPaywall();
    fireEvent.press(await screen.findByLabelText(TRIAL));

    expect(
      await screen.findByText('The purchase didn’t go through. You weren’t charged.'),
    ).toBeTruthy();
  });

  it('restore purchases asks the backend and shows Premium', async () => {
    mockRestore.mockResolvedValue({ kind: 'restored' });
    mockRefreshPremium.mockResolvedValue(premiumProfile);
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Restore purchase'));

    expect(await screen.findByText('You’re on Premium')).toBeTruthy();
    expect(mockRestore).toHaveBeenCalledWith('u-1');
  });

  it('restore with no subscription on the Apple ID says so', async () => {
    mockRestore.mockResolvedValue({ kind: 'restored' });
    mockRefreshPremium.mockResolvedValue(profile());
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Restore purchase'));

    expect(
      await screen.findByText('No Premium subscription was found for this Apple ID.'),
    ).toBeTruthy();
  });

  it('restore when the backend cannot check (503) shows an error, not the no-subscription message', async () => {
    mockRestore.mockResolvedValue({ kind: 'restored' });
    mockRefreshPremium.mockRejectedValue(new Error('503'));
    renderPaywall();
    fireEvent.press(await screen.findByLabelText('Restore purchase'));

    const alert = await screen.findByRole('alert');
    expect(alert.props.children).toBe(
      'Couldn’t check your subscription right now. Try Restore purchase again in a moment.',
    );
    expect(screen.queryByText('No Premium subscription was found for this Apple ID.')).toBeNull();
    expect(screen.queryByText('You’re on Premium')).toBeNull();
  });

  it('PREM-01 AC 6, EC-PREM 1: a Premium user sees the plan and Manage Subscription, not a purchase button', async () => {
    mockFetchMe.mockResolvedValue(premiumProfile);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderPaywall();

    expect(await screen.findByText('You’re on Premium')).toBeTruthy();
    expect(screen.queryByLabelText(TRIAL)).toBeNull();
    expect(screen.queryByLabelText('Subscribe')).toBeNull();
    expect(screen.queryByLabelText(/^Yearly/)).toBeNull();
    fireEvent.press(screen.getByLabelText('Manage Subscription'));
    expect(open).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
  });

  it('PREM-01 AC 6: in Expo Go it explains purchases need the App Store build', async () => {
    mockAvailable.mockReturnValue(false);
    renderPaywall();

    expect(await screen.findByText(/Purchases need the App Store version/)).toBeTruthy();
    expect(screen.queryByLabelText(TRIAL)).toBeNull();
    expect(screen.queryByLabelText('Subscribe')).toBeNull();
    expect(mockGetOffer).not.toHaveBeenCalled();
  });

  it('PREM-01 AC 6: when the offer cannot load it offers a retry', async () => {
    mockGetOffer.mockResolvedValueOnce(null).mockResolvedValueOnce(offer);
    renderPaywall();

    fireEvent.press(await screen.findByLabelText('Try Again'));
    expect(await screen.findByLabelText(TRIAL)).toBeTruthy();
  });
});
