/**
 * Design "Settings · root": the Spending rows show the user's live settings,
 * and every Account row goes somewhere.
 */
import React from 'react';
import { Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import SettingsScreen from '../../app/settings';
import { LINKS } from '@/constants/links';
import type { BudgetResponse } from '@/features/budget/types';
import type { UserProfile } from '@/features/auth/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
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
      settings: SettingsScreen,
      about: () => null,
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

  it('shows the real app version on About and opens the About screen', () => {
    const routerScreen = renderSettings();

    expect(screen.getByText('v0.1.0')).toBeTruthy();
    expect(screen.queryByText('v1.0.0')).toBeNull();
    fireEvent.press(screen.getByLabelText('About'));

    expect(routerScreen.getPathname()).toBe('/about');
  });

  it.each([
    ['Privacy', LINKS.privacyPolicy],
    ['Help & feedback', LINKS.help],
  ])('opens %s in the browser', (label, url) => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderSettings();

    fireEvent.press(screen.getByLabelText(label));

    expect(open).toHaveBeenCalledWith(url);
  });
});
