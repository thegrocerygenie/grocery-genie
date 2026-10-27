/**
 * Design "Settings · root": the Spending rows show the user's live settings,
 * and every Account row goes somewhere.
 */
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import SettingsScreen from '../../app/settings/index';
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
      'settings/index': SettingsScreen,
      'settings/about': () => null,
      'settings/privacy': () => null,
      'settings/help': () => null,
      'settings/delete-account': () => null,
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

    expect(routerScreen.getPathname()).toBe('/settings/about');
  });

  it.each([
    ['Privacy', '/settings/privacy'],
    ['Help & feedback', '/settings/help'],
    ['Delete account', '/settings/delete-account'],
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
