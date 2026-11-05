/**
 * Settings → Categories (BC-05 AC 3, V11-P1; AC 5–8, DA-9): up to 10 custom
 * categories for Premium, each with a colour and an icon. Built-in first, then
 * Custom with a "New category" row and an Edit button (the design). A free
 * user sees the upgrade prompt, never an error (D2).
 */
import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import CategorySettingsScreen from '../../app/settings/categories';
import { categoryPalette } from '@/constants/theme';
import type { CategoryResponse } from '@/features/budget/types';
import { ApiError } from '@/services/api';

jest.mock('expo-symbols', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    SymbolView: ({ name }: { name: string }) => <Text testID="symbol">{name}</Text>,
  };
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), notificationAsync: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  // Renders the header button the screen puts in the navigation bar.
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight ? <>{options.headerRight()}</> : null,
  },
  useRouter: () => ({ push: mockPush }),
}));

let mockPremium = true;
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: { is_premium: mockPremium } }),
}));

const DEFAULTS: CategoryResponse[] = [
  ['Groceries', 'green', 'cart'],
  ['Household', 'blue', 'house'],
  ['Other', 'gray', 'tag'],
].map(([name, color, icon], i) => ({
  id: `d-${i}`,
  name,
  is_default: true,
  sort_order: i + 1,
  color,
  icon,
}));

function custom(n: number): CategoryResponse[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c-${i}`,
    name: `Custom ${i}`,
    is_default: false,
    sort_order: 101 + i,
    color: 'pink',
    icon: 'leaf',
  }));
}

let mockCategories: CategoryResponse[] = DEFAULTS;
let mockCreateError: unknown = null;
let mockUpdateError: unknown = null;
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: mockCategories, isLoading: false, isError: false }),
  useCreateCategory: () => ({ mutate: mockCreate, isPending: false, error: mockCreateError }),
  useUpdateCategory: () => ({ mutate: mockUpdate, isPending: false, error: mockUpdateError }),
  useDeleteCategory: () => ({ mutate: mockDelete, isPending: false }),
}));

type PromptButtons = AlertButton[];

beforeEach(() => {
  mockPremium = true;
  mockCategories = DEFAULTS;
  mockCreateError = null;
  mockUpdateError = null;
  mockCreate.mockReset();
  mockUpdate.mockReset();
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

/** Index of the first element whose text is `text`, in render order. */
function order(...texts: string[]): number[] {
  type Node = { props: { children?: unknown } };
  const all: Node[] = screen.UNSAFE_root.findAll((n: Node) => typeof n.props.children === 'string');
  return texts.map((t) => all.findIndex((n) => n.props.children === t));
}

// --- AC 6: the design's layout ---

it('lists Built-in first, then Custom with a New category row and the Premium footer', () => {
  mockCategories = [...DEFAULTS, ...custom(1)];
  render(<CategorySettingsScreen />);
  const [builtIn, groceries, customHeader, mine, newRow, footer] = order(
    'Built-in',
    'Groceries',
    'Custom',
    'Custom 0',
    'New category',
    'Custom categories require Premium.',
  );
  expect(builtIn).toBeGreaterThanOrEqual(0);
  expect(builtIn).toBeLessThan(groceries);
  expect(groceries).toBeLessThan(customHeader);
  expect(customHeader).toBeLessThan(mine);
  expect(mine).toBeLessThan(newRow);
  expect(newRow).toBeLessThan(footer);
});

it('lists the built-in categories as read-only, each with its own icon square', () => {
  render(<CategorySettingsScreen />);
  const groceries = screen.getByTestId('category-icon-d-0');
  expect(groceries.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ backgroundColor: categoryPalette.green })]),
  );
  expect(within(groceries).getByText('cart.fill')).toBeTruthy();
  expect(screen.queryByLabelText(/Groceries, /)).toBeNull();
});

it('shows each custom category in a round icon with its colour and icon (AC 7)', () => {
  mockCategories = [...DEFAULTS, ...custom(1)];
  render(<CategorySettingsScreen />);
  const icon = screen.getByTestId('category-icon-c-0');
  expect(icon.props.style).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ borderRadius: 14 }),
      expect.objectContaining({ backgroundColor: categoryPalette.pink }),
    ]),
  );
  expect(within(icon).getByText('leaf.fill')).toBeTruthy();
});

it('the Edit button shows a delete button per custom category, and Done hides them', () => {
  mockCategories = [...DEFAULTS, ...custom(2)];
  render(<CategorySettingsScreen />);
  expect(screen.queryByLabelText('Delete Custom 0')).toBeNull();

  fireEvent.press(screen.getByLabelText('Edit custom categories'));
  expect(screen.getByLabelText('Delete Custom 0')).toBeTruthy();
  expect(screen.getByLabelText('Delete Custom 1')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('Done editing'));
  expect(screen.queryByLabelText('Delete Custom 0')).toBeNull();
});

it('has no Edit button with no custom categories', () => {
  render(<CategorySettingsScreen />);
  expect(screen.queryByLabelText('Edit custom categories')).toBeNull();
});

// --- AC 3 gating, kept ---

it('a free user sees the upgrade prompt that opens the paywall, not an add button', () => {
  mockPremium = false;
  render(<CategorySettingsScreen />);

  expect(screen.getByTestId('premium-upgrade-prompt')).toBeTruthy();
  expect(screen.queryByLabelText('New category')).toBeNull();
  expect(screen.getByText('Custom categories require Premium.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('See Premium'));
  expect(mockPush).toHaveBeenCalledWith('/paywall');
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
  expect(screen.getByLabelText('New category').props.accessibilityState).toMatchObject({
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

// --- AC 5: colour and icon chosen on create and edit ---

it('a Premium user adds a category by name, with the first colour and icon by default', () => {
  render(<CategorySettingsScreen />);
  fireEvent.press(screen.getByLabelText('New category'));
  expect(screen.getByLabelText('Indigo').props.accessibilityState).toMatchObject({
    selected: true,
  });
  expect(screen.getByLabelText('Tag').props.accessibilityState).toMatchObject({
    selected: true,
  });
  fireEvent.changeText(screen.getByLabelText('Name'), '  Garden ');
  fireEvent.press(screen.getByLabelText('Save'));
  expect(mockCreate).toHaveBeenCalledWith(
    { name: 'Garden', color: 'indigo', icon: 'tag' },
    expect.anything(),
  );
});

it('a new category takes the colour and icon picked', () => {
  render(<CategorySettingsScreen />);
  fireEvent.press(screen.getByLabelText('New category'));
  fireEvent.changeText(screen.getByLabelText('Name'), 'Garden');
  fireEvent.press(screen.getByLabelText('Mint'));
  fireEvent.press(screen.getByLabelText('Leaf'));
  expect(screen.getByLabelText('Mint').props.accessibilityState).toMatchObject({
    selected: true,
  });
  fireEvent.press(screen.getByLabelText('Save'));
  expect(mockCreate).toHaveBeenCalledWith(
    { name: 'Garden', color: 'mint', icon: 'leaf' },
    expect.anything(),
  );
});

it('Save stays off until the category has a name', () => {
  render(<CategorySettingsScreen />);
  fireEvent.press(screen.getByLabelText('New category'));
  expect(screen.getByLabelText('Save').props.accessibilityState).toMatchObject({
    disabled: true,
  });
  fireEvent.press(screen.getByLabelText('Save'));
  expect(mockCreate).not.toHaveBeenCalled();
});

it('tapping a custom category edits its colour and icon, sending only what changed', () => {
  mockCategories = [...DEFAULTS, ...custom(1)];
  render(<CategorySettingsScreen />);
  fireEvent.press(screen.getByLabelText('Custom 0, Change name, colour and icon'));
  expect(screen.getByText('Edit Category')).toBeTruthy();
  expect(screen.getByLabelText('Pink').props.accessibilityState).toMatchObject({
    selected: true,
  });
  expect(screen.getByLabelText('Leaf').props.accessibilityState).toMatchObject({
    selected: true,
  });
  fireEvent.press(screen.getByLabelText('Blue'));
  fireEvent.press(screen.getByLabelText('Save'));
  expect(mockUpdate).toHaveBeenCalledWith({ id: 'c-0', color: 'blue' }, expect.anything());
});

it('a taken name says so', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  render(<CategorySettingsScreen />);
  fireEvent.press(screen.getByLabelText('New category'));
  fireEvent.changeText(screen.getByLabelText('Name'), 'Pet');
  fireEvent.press(screen.getByLabelText('Save'));
  const { onError } = mockCreate.mock.calls[0][1] as { onError: (e: unknown) => void };
  onError(new ApiError(409, { detail: { code: 'category_name_taken' } }));
  expect(alert).toHaveBeenCalledWith('A category with that name already exists.');
});

// --- Edit: rename and delete ---

it('renames a custom category', () => {
  mockCategories = [...DEFAULTS, ...custom(1)];
  render(<CategorySettingsScreen />);
  fireEvent.press(screen.getByLabelText('Edit custom categories'));
  const type = promptAndType('Yard');
  fireEvent.press(screen.getByLabelText('Custom 0, Rename'));
  type();
  expect(mockUpdate).toHaveBeenCalledWith({ id: 'c-0', name: 'Yard' }, expect.anything());
});

it('deletes a custom category after confirming', () => {
  mockCategories = [...DEFAULTS, ...custom(1)];
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  render(<CategorySettingsScreen />);
  fireEvent.press(screen.getByLabelText('Edit custom categories'));
  fireEvent.press(screen.getByLabelText('Delete Custom 0'));

  expect(alert.mock.calls[0][0]).toBe('Delete “Custom 0”?');
  expect(mockDelete).not.toHaveBeenCalled();
  const confirm = (alert.mock.calls[0][2] as AlertButton[]).find((b) => b.style === 'destructive');
  confirm?.onPress?.();
  expect(mockDelete).toHaveBeenCalledWith('c-0', expect.anything());
});

// --- AC 8: after a lapse ---

it('after Premium lapses the categories stay and can be deleted, not renamed', () => {
  mockPremium = false;
  mockCategories = [...DEFAULTS, ...custom(2)];
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  render(<CategorySettingsScreen />);

  expect(screen.getByText('Custom 1')).toBeTruthy();
  expect(screen.getByText(/Renew Premium to rename them/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Edit custom categories'));
  fireEvent.press(screen.getByLabelText('Delete Custom 1'));
  expect(alert.mock.calls[0][0]).toBe('Delete “Custom 1”?');
});

it('after Premium lapses a category keeps its colour and icon, and changing them shows the upgrade prompt', () => {
  mockPremium = false;
  mockCategories = [...DEFAULTS, ...custom(1)];
  render(<CategorySettingsScreen />);
  const icon = screen.getByTestId('category-icon-c-0');
  expect(icon.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ backgroundColor: categoryPalette.pink })]),
  );

  fireEvent.press(screen.getByLabelText('Custom 0, Change name, colour and icon'));
  expect(screen.getByText('Make it yours with Premium')).toBeTruthy();
  expect(screen.queryByLabelText('Save')).toBeNull();
  expect(screen.getByLabelText('Blue').props.accessibilityState).toMatchObject({
    disabled: true,
  });
  fireEvent.press(screen.getAllByLabelText('See Premium')[0]);
  expect(mockPush).toHaveBeenCalledWith('/paywall');
});

it('a change refused with 403 premium_required turns the editor into the upgrade prompt', () => {
  mockCategories = [...DEFAULTS, ...custom(1)];
  render(<CategorySettingsScreen />);
  fireEvent.press(screen.getByLabelText('Custom 0, Change name, colour and icon'));
  fireEvent.press(screen.getByLabelText('Blue'));
  fireEvent.press(screen.getByLabelText('Save'));
  const { onError } = mockUpdate.mock.calls[0][1] as { onError: (e: unknown) => void };
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  act(() => onError(new ApiError(403, { detail: { code: 'premium_required' } })));
  expect(alert).not.toHaveBeenCalled();
  expect(screen.getByText('Make it yours with Premium')).toBeTruthy();
});
