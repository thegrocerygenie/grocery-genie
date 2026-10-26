/**
 * Design "Dashboard · over budget": the banner appears once any cap is
 * breached and names the categories that crossed.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { BudgetCategorySummary, DashboardData } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const mockDashboard: { data: DashboardData | undefined } = { data: undefined };
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({
    data: mockDashboard.data,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));

function category(name: string, spent: number, budget: number): BudgetCategorySummary {
  return {
    category_id: name,
    name,
    budget,
    spent,
    remaining: budget - spent,
    percent: budget > 0 ? (spent / budget) * 100 : 0,
  };
}

function dashboard(spent: number, categories: BudgetCategorySummary[]): DashboardData {
  return {
    period: '2026-04',
    overall: { budget: 400, spent, remaining: 400 - spent, percent: (spent / 400) * 100 },
    categories,
    top_items: [],
    trend: [],
    previous_period: '2026-03',
    category_changes: [],
  };
}

function renderDashboard() {
  renderRouter({ index: DashboardScreen }, { initialUrl: '/' });
}

describe('Dashboard over-budget banner', () => {
  it('names the categories that crossed their caps', () => {
    mockDashboard.data = dashboard(432, [
      category('Groceries', 214, 0),
      category('Beverages', 58, 40),
      category('Snacks & Treats', 39, 25),
    ]);
    renderDashboard();

    expect(
      screen.getByText(
        'Snacks & Treats and Beverages crossed their caps. Adjust limits or pause alerts.',
      ),
    ).toBeTruthy();
  });

  it('shows the banner when a cap is crossed while the total is still under budget', () => {
    mockDashboard.data = dashboard(242, [
      category('Groceries', 142, 175),
      category('Beverages', 58, 40),
    ]);
    renderDashboard();

    expect(
      screen.getByText('Beverages crossed its cap. Adjust limits or pause alerts.'),
    ).toBeTruthy();
  });

  it('speaks to the monthly budget when no category cap is crossed', () => {
    mockDashboard.data = dashboard(432, [category('Groceries', 432, 0)]);
    renderDashboard();

    expect(
      screen.getByText('You’re over your monthly budget. Adjust limits or pause alerts.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Some categories/)).toBeNull();
  });

  it('shows no banner when nothing is over', () => {
    mockDashboard.data = dashboard(242, [category('Groceries', 142, 175)]);
    renderDashboard();

    expect(screen.queryByText(/Adjust limits or pause alerts/)).toBeNull();
  });
});
