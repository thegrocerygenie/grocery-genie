/**
 * Design "Settings · root": the Spending rows show the user's live settings,
 * and every Account row goes somewhere.
 */
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import SettingsScreen from '../../app/settings/index';
import { fontScale, spacing } from '@/constants/theme';
import type { BudgetResponse } from '@/features/budget/types';
import type { UserProfile } from '@/features/auth/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
  jest.requireActual('@/testing/aiConsentHooksMock'),
);
jest.mock('expo-constants', () => ({ expoConfig: { version: '0.1.0' } }));

const profile: UserProfile = {
  id: 'u-1',
  email: 'sam@example.com',
  name: 'Sam',
  locale: 'en',
  currency_preference: 'USD',
  email_verified_at: null,
  preferences: {
    notification_thresholds: { fifty: false, eighty: true, hundred: true },
    weekly_summary: { enabled: true, day: 0 },
    ocr_languages: ['en'],
  },
};

let mockBudgets: BudgetResponse[] = [];
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: profile }),
  useSignOut: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/features/budget/hooks/useBudget', () => ({
  useBudgets: () => ({ data: mockBudgets }),
}));
let mockClaimAvailable = false;
jest.mock('@/features/premium/hooks/useWaitlistOffer', () => ({
  useWaitlistOffer: () => ({
    data: {
      window_open: true,
      claim_available: mockClaimAvailable,
      closes_at: '2027-04-01T00:00:00Z',
      redemption: null,
    },
  }),
}));

function budget(category_id: string | null, amount: number): BudgetResponse {
  return {
    id: category_id ?? 'overall',
    category_id,
    amount,
    period_type: 'monthly',
    period_start: '2026-10-01',
    rollover_enabled: false,
  };
}

function renderSettings() {
  const routerScreen = renderRouter(
    {
      _layout: () => <Stack />,
      index: () => null,
      'settings/index': SettingsScreen,
      'settings/about': () => null,
      'settings/privacy': () => null,
      'settings/help': () => null,
      'settings/delete-account': () => null,
      'settings/export-data': () => null,
      'settings/currency-settings': () => null,
      'settings/categories': () => null,
      'settings/stores': () => null,
      'settings/waitlist-offer': () => null,
      paywall: () => null,
    },
    { initialUrl: '/' },
  );
  act(() => router.push('/settings'));
  return routerScreen;
}

beforeEach(() => {
  mockBudgets = [
    budget(null, 400),
    budget('g', 175),
    budget('h', 50),
    budget('b', 30),
    budget('s', 25),
  ];
});

afterEach(() => jest.restoreAllMocks());

describe('Settings hub', () => {
  it('shows the live budget and alert settings under each row', () => {
    renderSettings();

    expect(screen.getByText('$400/mo · 4 caps')).toBeTruthy();
    expect(screen.getByText('80% · 100% · weekly')).toBeTruthy();
  });

  it('shows the budget currency and opens Currency', () => {
    const app = renderSettings();

    // The label replaces the row's text, so VoiceOver reads the setting as its value.
    expect(screen.getByLabelText('Currency').props.accessibilityValue).toEqual({ text: 'USD' });
    fireEvent.press(screen.getByLabelText('Currency'));
    expect(app.getPathname()).toBe('/settings/currency-settings');
  });

  it('shows budget amounts in the budget currency', () => {
    profile.currency_preference = 'EUR';
    renderSettings();

    expect(screen.getByText('€400/mo · 4 caps')).toBeTruthy();
    profile.currency_preference = 'USD';
  });

  it('a free user sees the free plan and a Premium row that opens the paywall (V11-P0)', () => {
    const app = renderSettings();

    expect(screen.getByText('sam@example.com · Free plan')).toBeTruthy();
    const row = screen.getByLabelText('Grocery Genie Premium');
    expect(row.props.accessibilityValue).toEqual({ text: 'Free plan · Upgrade' });
    fireEvent.press(row);
    expect(app.getPathname()).toBe('/paywall');
  });

  it('offers the waitlist claim only while the server says it is open (V11-P5)', () => {
    mockClaimAvailable = false;
    const first = renderSettings();
    expect(screen.queryByLabelText('Claim your waitlist offer')).toBeNull();
    first.unmount();

    mockClaimAvailable = true;
    const app = renderSettings();
    const row = screen.getByLabelText('Claim your waitlist offer');
    expect(row.props.accessibilityValue).toEqual({ text: 'A free year of Premium' });
    fireEvent.press(row);
    expect(app.getPathname()).toBe('/settings/waitlist-offer');
    mockClaimAvailable = false;
  });

  it('draws a divider between the Premium row and the waitlist row (V11-P5)', () => {
    mockClaimAvailable = false;
    const first = renderSettings();
    expect(screen.queryByTestId('settings-divider-premium-1')).toBeNull();
    first.unmount();

    mockClaimAvailable = true;
    renderSettings();
    expect(screen.getByTestId('settings-divider-premium-1')).toBeTruthy();
    mockClaimAvailable = false;
  });

  it('pads the bottom of the list with a theme token', () => {
    renderSettings();

    const style = StyleSheet.flatten(
      screen.getByTestId('settings-scroll').props.contentContainerStyle as ViewStyle,
    );
    expect(style.paddingBottom).toBe(spacing.screenBottom);
  });

  it('a Premium user sees Premium, from the backend profile', () => {
    profile.is_premium = true;
    renderSettings();

    expect(screen.getByText('sam@example.com · Premium')).toBeTruthy();
    expect(screen.getByLabelText('Grocery Genie Premium').props.accessibilityValue).toEqual({
      text: 'Premium',
    });
    profile.is_premium = false;
  });

  it('opens Categories, and tells a free user they are Premium (V11-P1)', () => {
    const app = renderSettings();

    const row = screen.getByLabelText('Categories');
    expect(row.props.accessibilityValue).toEqual({ text: 'Your own categories with Premium' });
    fireEvent.press(row);
    expect(app.getPathname()).toBe('/settings/categories');
  });

  it('opens Stores, where the user merges the same store (V11-05)', () => {
    const app = renderSettings();

    const row = screen.getByLabelText('Stores');
    expect(row.props.accessibilityValue).toEqual({ text: 'Merge the same store' });
    fireEvent.press(row);
    expect(app.getPathname()).toBe('/settings/stores');
  });

  it('has a switch to withdraw AI receipt reading (App Store 5.1.2(i))', () => {
    renderSettings();
    expect(screen.getByRole('switch', { name: 'Read receipts with AI' }).props.value).toBe(true);
  });

  it('shows the real app version on About and opens the About screen', () => {
    const routerScreen = renderSettings();

    expect(screen.getByText('v0.1.0')).toBeTruthy();
    expect(screen.queryByText('v1.0.0')).toBeNull();
    fireEvent.press(screen.getByLabelText('About'));

    expect(routerScreen.getPathname()).toBe('/settings/about');
  });

  it.each([
    ['Privacy', '/settings/privacy'],
    ['Help & feedback', '/settings/help'],
    ['Delete account', '/settings/delete-account'],
    ['Export data', '/settings/export-data'],
  ])('opens %s in the app', (label, path) => {
    const routerScreen = renderSettings();

    fireEvent.press(screen.getByLabelText(label));

    expect(routerScreen.getPathname()).toBe(path);
  });

  it.each(['Sign out', 'Delete account'])(
    'lets %s grow with large text instead of clipping its label',
    (label) => {
      renderSettings();

      const style = StyleSheet.flatten(screen.getByLabelText(label).props.style) as ViewStyle;
      expect(style.height).toBeUndefined();
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    },
  );
});

// F6 (Simulator pass 2026-11-06): at AX5 Done overlapped the Settings title.
it('caps Done at the size a native bar button stops growing, and labels it', () => {
  renderSettings();
  expect(screen.getByText('Done').props.maxFontSizeMultiplier).toBe(fontScale.headerButtonMax);
  expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
});
