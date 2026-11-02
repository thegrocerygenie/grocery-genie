/**
 * BC-03 AC 4: alerts can be turned off per category, in Settings → Alerts.
 * Only categories with a budget can alert, so only they are listed.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import NotificationSettingsScreen from '../../app/settings/notification-settings';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

let mockMuted: string[] = [];
const mockMutate = jest.fn();
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({
    data: {
      preferences: {
        notification_thresholds: { fifty: false, eighty: true, hundred: true },
        weekly_summary: { enabled: true, day: 0 },
        ocr_languages: [],
        muted_alert_categories: mockMuted,
      },
    },
  }),
  useUpdatePreferences: () => ({ mutate: mockMutate }),
}));
jest.mock('@/features/budget/hooks/useBudget', () => ({
  useBudgets: () => ({
    data: [
      { id: 'b-all', category_id: null, amount: 400 },
      { id: 'b-g', category_id: 'cat-groceries', amount: 175 },
      { id: 'b-h', category_id: 'cat-household', amount: 50 },
    ],
  }),
}));
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 'cat-groceries', name: 'Groceries' },
      { id: 'cat-household', name: 'Household' },
      { id: 'cat-pet', name: 'Pet' },
    ],
  }),
}));

beforeEach(() => {
  mockMuted = [];
  mockMutate.mockReset();
});

it('lists a switch for each category with a budget, on by default', () => {
  render(<NotificationSettingsScreen />);

  expect(screen.getByLabelText('Groceries alerts').props.value).toBe(true);
  expect(screen.getByLabelText('Household alerts').props.value).toBe(true);
  expect(screen.queryByLabelText('Pet alerts')).toBeNull();
});

it('shows a muted category as off', () => {
  mockMuted = ['cat-household'];
  render(<NotificationSettingsScreen />);

  expect(screen.getByLabelText('Household alerts').props.value).toBe(false);
});

it('mutes a category when its switch is turned off', () => {
  mockMuted = ['cat-household'];
  render(<NotificationSettingsScreen />);

  fireEvent(screen.getByLabelText('Groceries alerts'), 'valueChange', false);

  expect(mockMutate).toHaveBeenCalledWith({
    muted_alert_categories: ['cat-household', 'cat-groceries'],
  });
});

it('unmutes a category when its switch is turned on', () => {
  mockMuted = ['cat-household', 'cat-groceries'];
  render(<NotificationSettingsScreen />);

  fireEvent(screen.getByLabelText('Household alerts'), 'valueChange', true);

  expect(mockMutate).toHaveBeenCalledWith({ muted_alert_categories: ['cat-groceries'] });
});
