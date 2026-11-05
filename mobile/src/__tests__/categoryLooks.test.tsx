/**
 * BC-05 AC 7 (DA-9): a category's colour and icon show wherever it is listed
 * with one: the category picker and the dashboard's category bars (Settings →
 * Categories is in categorySettings.test.tsx).
 */
import React from 'react';
import { render, screen as rtl, within } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

import DashboardScreen from '../../app/(tabs)/(budget)/index';
import { CategoryPickerSheet } from '@/components/CategoryPickerSheet';
import { categoryPalette } from '@/constants/theme';
import type {
  BudgetCategorySummary,
  CategoryResponse,
  DashboardData,
} from '@/features/budget/types';

jest.mock('expo-symbols', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    SymbolView: ({ name }: { name: string }) => <Text testID="symbol">{name}</Text>,
  };
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const mockDashboard: { data: DashboardData | undefined } = { data: undefined };
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({
    data: mockDashboard.data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/utils/today', () => ({ today: () => new Date(2026, 3, 19) }));

function bar(name: string, spent: number, color?: string, icon?: string): BudgetCategorySummary {
  return {
    category_id: `id-${name}`,
    name,
    budget: 100,
    spent,
    remaining: 100 - spent,
    percent: spent,
    ...(color ? { color } : {}),
    ...(icon ? { icon } : {}),
  };
}

function backgroundOf(node: { props: { style: unknown } }): unknown {
  const flat = ([] as unknown[]).concat(node.props.style as unknown[]).flat(3);
  const withBg = flat.filter(
    (s): s is { backgroundColor: unknown } =>
      typeof s === 'object' && s !== null && 'backgroundColor' in s,
  );
  return withBg[withBg.length - 1]?.backgroundColor;
}

describe('dashboard category bars', () => {
  it('draw a custom category in its own colour and icon', () => {
    mockDashboard.data = {
      period: '2026-04',
      overall: { budget: 0, spent: 70, remaining: -70, percent: 0 },
      categories: [bar('Garden', 40, 'mint', 'leaf'), bar('Groceries', 30, 'green', 'cart')],
      top_items: [],
      trend: [],
      previous_period: '2026-03',
      category_changes: [],
      has_receipts: true,
    };
    renderRouter({ index: DashboardScreen }, { initialUrl: '/' });

    const icon = screen.getByTestId('category-icon-id-Garden');
    expect(backgroundOf(icon)).toBe(categoryPalette.mint);
    expect(within(icon).getByText('leaf.fill')).toBeTruthy();
    expect(backgroundOf(screen.getByTestId('category-bar-id-Garden'))).toBe(categoryPalette.mint);
    expect(backgroundOf(screen.getByTestId('category-icon-id-Groceries'))).toBe(
      categoryPalette.green,
    );
  });

  it('fall back to the built-in look by name from a server before colours', () => {
    mockDashboard.data = {
      period: '2026-04',
      overall: { budget: 0, spent: 30, remaining: -30, percent: 0 },
      categories: [bar('Groceries', 30)],
      top_items: [],
      trend: [],
      previous_period: '2026-03',
      category_changes: [],
      has_receipts: true,
    };
    renderRouter({ index: DashboardScreen }, { initialUrl: '/' });
    const icon = screen.getByTestId('category-icon-id-Groceries');
    expect(within(icon).getByText('cart.fill')).toBeTruthy();
  });
});

describe('category picker', () => {
  it('shows a custom category in its own colour and icon', () => {
    const categories: CategoryResponse[] = [
      {
        id: 'd-0',
        name: 'Groceries',
        is_default: true,
        sort_order: 1,
        color: 'green',
        icon: 'cart',
      },
      {
        id: 'c-0',
        name: 'Garden',
        is_default: false,
        sort_order: 101,
        color: 'mint',
        icon: 'leaf',
      },
    ];
    render(
      <CategoryPickerSheet
        visible
        selectedId={null}
        categories={categories}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const garden = rtl.getByTestId('category-icon-c-0');
    expect(backgroundOf(garden)).toBe(categoryPalette.mint);
    expect(within(garden).getByText('leaf.fill')).toBeTruthy();
    expect(rtl.getByText('Garden')).toBeTruthy();
    expect(backgroundOf(rtl.getByTestId('category-icon-d-0'))).toBe(categoryPalette.green);
  });
});
