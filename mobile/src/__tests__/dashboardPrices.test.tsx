/**
 * V1.1 PI-01: the Budget dashboard opens Prices, the price history of
 * everything the user buys.
 */
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { DashboardData } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const mockData: DashboardData = {
  period: '2026-04',
  overall: { budget: 400, spent: 243, remaining: 157, percent: 60.75 },
  categories: [],
  top_items: [],
  trend: [],
  previous_period: '2026-03',
  category_changes: [],
  has_receipts: true,
};
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({
    data: mockData,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

it('opens Prices from the dashboard', () => {
  const routerScreen = renderRouter(
    { index: DashboardScreen, 'items/index': () => null },
    { initialUrl: '/' },
  );

  const button = screen.getByRole('button', { name: 'Items' });
  expect(button.props.accessibilityHint).toBe('What you paid for each item over time');
  act(() => fireEvent.press(button));

  expect(routerScreen.getPathname()).toBe('/items');
});
