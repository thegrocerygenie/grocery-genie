/**
 * Settings → Categories (BC-05 AC 3, V11-P1): up to 10 custom categories for
 * Premium. A free user sees the upgrade prompt, never an error (D2).
 */
import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import CategorySettingsScreen from '../../app/settings/categories';
import type { CategoryResponse } from '@/features/budget/types';
import { ApiError } from '@/services/api';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), notificationAsync: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
}));

let mockPremium = true;
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: { is_premium: mockPremium } }),
}));

const DEFAULTS: CategoryResponse[] = ['Groceries', 'Household', 'Other'].map((name, i) => ({
  id: `d-${i}`,
  name,
  is_default: true,
  sort_order: i + 1,
}));

function custom(n: number): CategoryResponse[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c-${i}`,
    name: `Custom ${i}`,
    is_default: false,
    sort_order: 101 + i,
  }));
}

let mockCategories: CategoryResponse[] = DEFAULTS;
let mockCreateError: unknown = null;
const mockCreate = jest.fn();
const mockRename = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: mockCategories, isLoading: false, isError: false }),
  useCreateCategory: () => ({ mutate: mockCreate, isPending: false, error: mockCreateError }),
  useRenameCategory: () => ({ mutate: mockRename, isPending: false }),
  useDeleteCategory: () => ({ mutate: mockDelete, isPending: false }),
}));

type PromptButtons = AlertButton[];

beforeEach(() => {
  mockPremium = true;
  mockCategories = DEFAULTS;
  mockCreateError = null;
  mockCreate.mockReset();
  mockRename.mockReset();
  mockDelete.mockReset();
  mockPush.mockReset();
  jest.restoreAllMocks();
});

function promptAndType(value: string) {
  const prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => {});
  return () => {
    const buttons = prompt.mock.calls[0][2] as PromptButtons;
    const save = buttons.find((b) => b.style !== 'cancel');
    (save?.onPress as (v?: string) => void)(value);
  };
}

it('lists the built-in categories as read-only', () => {
  render(<CategorySettingsScreen />);
  expect(screen.getByText('Groceries')).toBeTruthy();
  expect(screen.getByText('Other')).toBeTruthy();
  expect(screen.queryByLabelText(/Groceries, Rename or delete/)).toBeNull();
});

it('a free user sees the upgrade prompt that opens the paywall, not an add button', () => {
  mockPremium = false;
  render(<CategorySettingsScreen />);

  expect(screen.getByTestId('premium-upgrade-prompt')).toBeTruthy();
  expect(screen.queryByLabelText('Add Category')).toBeNull();
  fireEvent.press(screen.getByLabelText('See Premium'));
  expect(mockPush).toHaveBeenCalledWith('/paywall');
});

it('a Premium user adds a category by name', () => {
  render(<CategorySettingsScreen />);
  const type = promptAndType('  Garden ');
  fireEvent.press(screen.getByLabelText('Add Category'));
  type();
  expect(mockCreate).toHaveBeenCalledWith('Garden', expect.anything());
});

it('shows how many of the 10 are used', () => {
  mockCategories = [...DEFAULTS, ...custom(3)];
  render(<CategorySettingsScreen />);
  expect(screen.getByText('3 of 10')).toBeTruthy();
  expect(screen.getByText('Custom 2')).toBeTruthy();
});

it('at 10 the add button is disabled and says why', () => {
  mockCategories = [...DEFAULTS, ...custom(10)];
  render(<CategorySettingsScreen />);
  expect(screen.getByLabelText('Add Category').props.accessibilityState).toMatchObject({
    disabled: true,
  });
  expect(screen.getByText(/the most you can have/)).toBeTruthy();
});

it('a refused create (Premium lapsed) shows the upgrade prompt, not an error', () => {
  mockCreateError = new ApiError(403, {
    detail: { code: 'premium_required', feature: 'custom_categories' },
  });
  render(<CategorySettingsScreen />);
  expect(screen.getByTestId('premium-upgrade-prompt')).toBeTruthy();
});

it('a taken name says so', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  render(<CategorySettingsScreen />);
  const type = promptAndType('Pet');
  fireEvent.press(screen.getByLabelText('Add Category'));
  type();
  const { onError } = mockCreate.mock.calls[0][1] as { onError: (e: unknown) => void };
  onError(new ApiError(409, { detail: { code: 'category_name_taken' } }));
  expect(alert).toHaveBeenCalledWith('A category with that name already exists.');
});

it('renames a custom category', () => {
  mockCategories = [...DEFAULTS, ...custom(1)];
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  render(<CategorySettingsScreen />);
  fireEvent.press(screen.getByLabelText('Custom 0, Rename or delete'));

  const type = promptAndType('Yard');
  const actions = alert.mock.calls[0][2] as AlertButton[];
  actions.find((b) => b.text === 'Rename')?.onPress?.();
  type();
  expect(mockRename).toHaveBeenCalledWith({ id: 'c-0', name: 'Yard' }, expect.anything());
});

it('deletes a custom category after confirming', () => {
  mockCategories = [...DEFAULTS, ...custom(1)];
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  render(<CategorySettingsScreen />);
  fireEvent.press(screen.getByLabelText('Custom 0, Rename or delete'));

  (alert.mock.calls[0][2] as AlertButton[]).find((b) => b.text === 'Delete')?.onPress?.();
  expect(alert.mock.calls[1][0]).toBe('Delete “Custom 0”?');
  expect(mockDelete).not.toHaveBeenCalled();
  const confirm = (alert.mock.calls[1][2] as AlertButton[]).find(
    (b) => b.style === 'destructive',
  );
  confirm?.onPress?.();
  expect(mockDelete).toHaveBeenCalledWith('c-0', expect.anything());
});

it('after Premium lapses the categories stay and can be deleted, not renamed', () => {
  mockPremium = false;
  mockCategories = [...DEFAULTS, ...custom(2)];
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  render(<CategorySettingsScreen />);

  expect(screen.getByText('Custom 1')).toBeTruthy();
  expect(screen.getByText(/Renew Premium to rename them/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Custom 1, Delete'));
  expect(alert.mock.calls[0][0]).toBe('Delete “Custom 1”?');
});
