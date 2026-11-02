/**
 * Settings → Currency: the budget currency. Only receipts in it count toward
 * budgets (MVP rule, 2026-11-02); budget amounts are not converted.
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';

import CurrencySettingsScreen from '../../app/settings/currency-settings';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

let mockCurrency = 'USD';
const mockMutate = jest.fn();
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: { currency_preference: mockCurrency } }),
  useUpdatePreferences: () => ({ mutate: mockMutate, isPending: false }),
}));

beforeEach(() => {
  mockCurrency = 'USD';
  mockMutate.mockReset();
});

it('marks the current budget currency', () => {
  render(<CurrencySettingsScreen />);

  expect(screen.getByLabelText('US Dollar, USD').props.accessibilityState).toMatchObject({
    selected: true,
  });
  expect(screen.getByLabelText('Euro, EUR').props.accessibilityState).toMatchObject({
    selected: false,
  });
});

it('saves the currency the user picks', () => {
  render(<CurrencySettingsScreen />);

  fireEvent.press(screen.getByLabelText('Euro, EUR'));

  expect(mockMutate).toHaveBeenCalledWith({ currency_preference: 'EUR' });
});

it('does not save again when the current currency is tapped', () => {
  render(<CurrencySettingsScreen />);

  fireEvent.press(screen.getByLabelText('US Dollar, USD'));

  expect(mockMutate).not.toHaveBeenCalled();
});

it('lists a current currency that is not in the common list', () => {
  mockCurrency = 'ISK';
  render(<CurrencySettingsScreen />);

  expect(screen.getByLabelText(/ISK$/).props.accessibilityState).toMatchObject({
    selected: true,
  });
});

it('says what the currency changes, and that amounts are not converted', () => {
  render(<CurrencySettingsScreen />);

  expect(screen.getByText(/Only receipts in this currency count toward your budgets/)).toBeTruthy();
  expect(screen.getByText(/aren’t converted/)).toBeTruthy();
});
